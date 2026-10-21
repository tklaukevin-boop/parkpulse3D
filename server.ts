import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import {
  buildInitialCarparks,
  buildInitialSmartMeters,
  INITIAL_ROADS,
  INITIAL_CCTV_CAMERAS,
  INITIAL_TUNNEL_MONITORS,
  INITIAL_TRAFFIC_INCIDENTS,
  simulateTelemetryTick,
  evaluateCarparkQueueRisk,
} from './src/data/hkParkingData.ts';
import type { CarparkFacility } from './src/data/hkParkingData.ts';
import {
  fetchGoogleRoutesApi,
} from './src/utils/googleMapsRouteService.ts';
import {
  isWithinHongKongBounds,
} from './src/utils/proactiveRouteEngine.ts';
import type { CompactSmartMeterCatalog } from './src/utils/tdSmartMeterService.ts';
import { unpackSmartMeterCatalog } from './src/utils/tdSmartMeterService.ts';

const PORT = Number(process.env.PORT) || 3000;

// Load official 20,699-spot Hong Kong Transport Department Smart Meter Catalog from disk
let stateCatalog: CompactSmartMeterCatalog | null = null;
const meterChangedAtMap = new Map<string, string>();

function loadInitialSmartMeterCatalog(): CompactSmartMeterCatalog | null {
  try {
    const catalogPath = path.join(process.cwd(), 'public', 'hk-smart-meters-catalog.json');
    if (fs.existsSync(catalogPath)) {
      const raw = fs.readFileSync(catalogPath, 'utf8');
      return JSON.parse(raw) as CompactSmartMeterCatalog;
    }
  } catch (err) {
    console.error('Failed to load hk-smart-meters-catalog.json:', err);
  }
  return null;
}

function loadInitialCarparksCatalog(): CarparkFacility[] {
  const curated = buildInitialCarparks();
  try {
    const catalogPath = path.join(process.cwd(), 'public', 'hk-gov-carparks-catalog.json');
    if (fs.existsSync(catalogPath)) {
      const raw = fs.readFileSync(catalogPath, 'utf8');
      const list = JSON.parse(raw) as CarparkFacility[];
      if (Array.isArray(list) && list.length > 0) {
        const byId = new Map<string, CarparkFacility>();
        for (const cp of curated) {
          byId.set(cp.id, cp);
        }
        for (const cp of list) {
          if (!byId.has(cp.id)) {
            byId.set(cp.id, cp);
          }
        }
        return Array.from(byId.values());
      }
    }
  } catch (err) {
    console.error('Failed to load hk-gov-carparks-catalog.json:', err);
  }
  return curated;
}

stateCatalog = loadInitialSmartMeterCatalog();

// In-memory live edge state synchronized with DATA.GOV.HK & realistic physics
let stateCarparks = loadInitialCarparksCatalog();
let stateMeters = stateCatalog
  ? unpackSmartMeterCatalog(stateCatalog)
  : buildInitialSmartMeters();
let stateRoads = [...INITIAL_ROADS];
let stateTunnels = [...INITIAL_TUNNEL_MONITORS];
const stateCctv = [...INITIAL_CCTV_CAMERAS];
const stateIncidents = [...INITIAL_TRAFFIC_INCIDENTS];
let lastGovSyncTime: string | null = null;
let upstreamGovReachable = false;
let upstreamMeterReachable = false;

// In-memory Edge Cache for Transport Department Live CCTV JPEG Snapshots
interface CachedCctvFrame {
  buffer: Buffer;
  contentType: string;
  fetchedAt: number;
}
const cctvFrameCache = new Map<string, CachedCctvFrame>();
const CCTV_CACHE_TTL_MS = 55_000; // TD updates snapshots every 60s
const ALLOWED_CCTV_ID_REGEX = /^[A-Z]{1,6}\d{3,5}[A-Z]?$/i;
const MAX_CCTV_CACHE_ENTRIES = 120;

async function fetchTdCctvSnapshot(camId: string): Promise<CachedCctvFrame | null> {
  const cleanId = camId.trim().toUpperCase();
  if (!ALLOWED_CCTV_ID_REGEX.test(cleanId)) return null;

  const now = Date.now();
  const cached = cctvFrameCache.get(cleanId);
  if (cached && now - cached.fetchedAt < CCTV_CACHE_TTL_MS) {
    return cached;
  }

  const urls = [
    `https://tdcctv.data.one.gov.hk/${cleanId}.JPG`,
    `https://tdcctv.data.gov.hk/${cleanId}.JPG`,
  ];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'image/jpeg,image/*;q=0.8',
          'User-Agent': 'HKParkAndCharge3D/2.0',
        },
      });
      clearTimeout(timeout);

      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        if (buffer.byteLength > 500) {
          const entry: CachedCctvFrame = {
            buffer,
            contentType: res.headers.get('content-type') || 'image/jpeg',
            fetchedAt: Date.now(),
          };
          if (!cctvFrameCache.has(cleanId) && cctvFrameCache.size >= MAX_CCTV_CACHE_ENTRIES) {
            const oldestKey = cctvFrameCache.keys().next().value;
            if (oldestKey) cctvFrameCache.delete(oldestKey);
          }
          cctvFrameCache.set(cleanId, entry);
          return entry;
        }
      }
    } catch {
      // Try next mirror or return stale cache if available
    }
  }

  return cached ?? null;
}

async function prewarmCctvSnapshots() {
  await Promise.allSettled(
    stateCctv.map((cam) => fetchTdCctvSnapshot(cam.id))
  );
}

// Sync Real-Time Occupancy Status for all 20,699 Smart Meters from DATA.GOV.HK (TD HKeMeter)
async function syncTdSmartMetersOccupancy() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    const res = await fetch(
      'https://resource.data.one.gov.hk/td/psiparkingspaces/occupancystatus/occupancystatus.csv',
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) return;
    const text = await res.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 100) return;

    const occMap = new Map<string, { meterSt: 'N' | 'OU'; occupied: boolean; changedAt: string }>();
    for (let i = 1; i < lines.length; i++) {
      const [spaceIdRaw, meterStRaw, occStRaw, changedAtRaw] = lines[i].split(',');
      if (!spaceIdRaw) continue;
      const spaceId = spaceIdRaw.trim();
      const meterSt: 'N' | 'OU' = meterStRaw?.trim() === 'OU' ? 'OU' : 'N';
      const occupied = occStRaw?.trim() !== 'V' || meterSt === 'OU';
      const changedAt = (changedAtRaw || '').trim();
      occMap.set(spaceId, { meterSt, occupied, changedAt });
      if (changedAt) {
        meterChangedAtMap.set(spaceId, changedAt);
      }
    }

    if (occMap.size > 1000) {
      upstreamMeterReachable = true;
      upstreamGovReachable = true;
      lastGovSyncTime = new Date().toLocaleTimeString('zh-HK', { hour12: false });

      const occChars: string[] = new Array(stateMeters.length);
      for (let i = 0; i < stateMeters.length; i++) {
        const m = stateMeters[i];
        const live = occMap.get(m.id);
        if (live) {
          m.occupied = live.occupied;
          m.meterStatus = live.meterSt;
          m.occupancyChangedAt = live.changedAt;
          m.lastSensorPingSecs = 1 + (i % 8);
        }
        occChars[i] = m.meterStatus === 'OU' ? 'U' : m.occupied ? 'O' : 'V';
      }

      if (stateCatalog) {
        stateCatalog.occupancyString = occChars.join('');
        stateCatalog.syncedAt = new Date().toISOString();
      }
    }
  } catch {
    // Keep existing meter states if upstream times out
  }
}

async function syncWithDataGovHk() {
  await Promise.allSettled([
    (async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(
          'https://api.data.gov.hk/v1/carpark-info-vacancy?data=vacancy&vehicleTypes=privateCar&lang=zh_TW',
          { signal: controller.signal }
        );
        clearTimeout(timeout);

        if (res.ok) {
          const json = (await res.json()) as {
            results?: Array<{
              park_Id?: string;
              privateCar?: Array<{ vacancy?: number }>;
            }>;
          };
          if (json && Array.isArray(json.results) && json.results.length > 0) {
            upstreamGovReachable = true;
            lastGovSyncTime = new Date().toLocaleTimeString('zh-HK', { hour12: false });
            const vacancyMap = new Map<string, number>();
            for (const item of json.results) {
              const vac = item.privateCar?.[0]?.vacancy;
              if (item.park_Id && typeof vac === 'number' && vac >= 0) {
                vacancyMap.set(item.park_Id, vac);
              }
            }

            stateCarparks = stateCarparks.map((cp) => {
              const parkId = cp.tdParkId || (cp as { govParkId?: string }).govParkId;
              if (parkId && vacancyMap.has(parkId)) {
                const liveVacancy = Math.min(cp.totalSpaces, vacancyMap.get(parkId)!);
                const { queueRisk, estimatedWaitMins } = evaluateCarparkQueueRisk(
                  liveVacancy,
                  cp.adjacentRoadSpeedKmh
                );
                return {
                  ...cp,
                  availableSpaces: liveVacancy,
                  queueRisk,
                  estimatedWaitMins,
                  lastUpdated: lastGovSyncTime!,
                };
              }
              return cp;
            });
          }
        }
      } catch {
        // Ignore single carpark sync error
      }
    })(),
    syncTdSmartMetersOccupancy(),
  ]);
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Start initial sync and prewarm TD CCTV snapshots in background
  syncWithDataGovHk();
  prewarmCctvSnapshots();

  setInterval(() => {
    // Only run synthetic random jitter when upstream government feeds are unreachable
    if (upstreamGovReachable && upstreamMeterReachable) return;
    const next = simulateTelemetryTick(
      upstreamGovReachable ? [] : stateCarparks,
      upstreamMeterReachable ? [] : stateMeters,
      stateRoads,
      stateTunnels
    );
    if (!upstreamGovReachable) {
      stateCarparks = next.carparks;
      stateRoads = next.roads;
      stateTunnels = next.tunnels;
    }
    if (!upstreamMeterReachable) {
      stateMeters = next.meters;
    }
  }, 6000);

  setInterval(() => {
    syncWithDataGovHk();
  }, 30000);

  setInterval(() => {
    prewarmCctvSnapshots();
  }, 55000);

  // Mode A Edge Proxy Endpoints
  app.get('/api/viewport-facilities', (req, res) => {
    const bboxParam = typeof req.query.bbox === 'string' ? req.query.bbox : '';
    const parts = bboxParam.split(',').map(Number);
    const hasValidBBox = parts.length === 4 && parts.every((n) => !Number.isNaN(n));

    if (!hasValidBBox) {
      res.json({
        source: upstreamGovReachable
          ? 'DATA.GOV.HK HKeMobility Live Hybrid'
          : 'Edge Spatial Index Gateway',
        upstreamGovReachable,
        timestamp: new Date().toISOString(),
        carparks: stateCarparks,
        meters: stateMeters,
        roads: stateRoads,
        tunnels: stateTunnels,
      });
      return;
    }

    const [west, south, east, north] = parts;
    const pad = 0.018;
    const inBox = (coords: [number, number]) =>
      coords[0] >= west - pad &&
      coords[0] <= east + pad &&
      coords[1] >= south - pad &&
      coords[1] <= north + pad;

    const visibleCarparks = stateCarparks.filter((c) => inBox(c.coordinates));
    const visibleMeters = stateMeters.filter((m) => inBox(m.coordinates));

    res.json({
      source: upstreamGovReachable
        ? 'DATA.GOV.HK Spatial BBox Stream'
        : 'Edge Spatial BBox Stream',
      upstreamGovReachable,
      timestamp: new Date().toISOString(),
      bbox: [west, south, east, north],
      carparks: visibleCarparks.length > 0 ? visibleCarparks : stateCarparks,
      meters: visibleMeters,
      roads: stateRoads,
      tunnels: stateTunnels,
    });
  });

function haversineDistanceKm(coord1: [number, number], coord2: [number, number]): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371; // Earth's mean radius in km
  const dLat = toRad(coord2[1] - coord1[1]);
  const dLng = toRad(coord2[0] - coord1[0]);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(coord1[1])) *
      Math.cos(toRad(coord2[1])) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

  app.get('/api/carparks', (req, res) => {
    const latStr = req.query.lat as string | undefined;
    const lngStr = req.query.lng as string | undefined;
    const radiusKmStr = req.query.radiusKm as string | undefined;
    const bboxParam = req.query.bbox as string | undefined;
    const queryParam = (req.query.q as string | undefined)?.trim().toLowerCase();
    const districtParam = req.query.district as string | undefined;

    let filtered = stateCarparks;

    // 1. Text search parameter (cross-district universal search)
    if (queryParam) {
      filtered = filtered.filter((cp) =>
        cp.nameZh.toLowerCase().includes(queryParam) ||
        cp.nameSc.toLowerCase().includes(queryParam) ||
        cp.nameEn.toLowerCase().includes(queryParam) ||
        cp.districtZh.toLowerCase().includes(queryParam) ||
        cp.districtSc.toLowerCase().includes(queryParam) ||
        cp.districtEn.toLowerCase().includes(queryParam) ||
        cp.addressZh.toLowerCase().includes(queryParam) ||
        (cp.addressSc && cp.addressSc.toLowerCase().includes(queryParam)) ||
        cp.addressEn.toLowerCase().includes(queryParam) ||
        (cp.adjacentRoadNameZh && cp.adjacentRoadNameZh.toLowerCase().includes(queryParam)) ||
        (cp.adjacentRoadNameEn && cp.adjacentRoadNameEn.toLowerCase().includes(queryParam)) ||
        (cp.evInfo?.operator && cp.evInfo.operator.toLowerCase().includes(queryParam))
      );
      res.json({
        source: upstreamGovReachable
          ? 'DATA.GOV.HK HKeMobility Live Hybrid'
          : 'Edge Gateway Live Telemetry',
        upstreamGovReachable,
        timestamp: new Date().toISOString(),
        totalTerritoryCount: stateCarparks.length,
        returnedCount: filtered.length,
        mode: 'query_search',
        data: filtered,
      });
      return;
    }

    // 2. Specific district parameter if supplied
    if (districtParam && districtParam !== 'all') {
      filtered = filtered.filter((cp) => cp.districtKey === districtParam);
    } else if (!districtParam && !latStr && !bboxParam) {
      // Default to focused regional slice (Central district) to eliminate startup payload jamming
      filtered = filtered.filter((cp) => cp.districtKey === 'central');
    }

    // 3. Proximity Radius filtering (e.g. lat, lng, radiusKm = 10)
    if (latStr && lngStr) {
      const userLat = parseFloat(latStr);
      const userLng = parseFloat(lngStr);
      const radiusKm = radiusKmStr ? parseFloat(radiusKmStr) : 10.0;
      if (!Number.isNaN(userLat) && !Number.isNaN(userLng) && radiusKm > 0) {
        filtered = filtered.filter((cp) => {
          const dist = haversineDistanceKm([userLng, userLat], cp.coordinates);
          return dist <= radiusKm;
        });
      }
    } else if (bboxParam) {
      const parts = bboxParam.split(',').map(Number);
      if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
        const [west, south, east, north] = parts;
        const pad = 0.02; // ~2km padding
        filtered = filtered.filter((cp) =>
          cp.coordinates[0] >= west - pad &&
          cp.coordinates[0] <= east + pad &&
          cp.coordinates[1] >= south - pad &&
          cp.coordinates[1] <= north + pad
        );
      }
    }

    res.json({
      source: upstreamGovReachable
        ? 'DATA.GOV.HK HKeMobility Live Hybrid'
        : 'Edge Gateway Live Telemetry',
      upstreamGovReachable,
      timestamp: new Date().toISOString(),
      totalTerritoryCount: stateCarparks.length,
      returnedCount: filtered.length,
      mode: latStr && lngStr ? 'proximity_funnel' : bboxParam ? 'bbox_funnel' : 'catalog',
      data: filtered,
    });
  });

  // Full 20,699-spot Dictionary-Compressed Smart Meter Catalog endpoint
  app.get('/api/meters/catalog', (_req, res) => {
    if (stateCatalog) {
      res.json({
        source: 'Transport Dept HKeMeter Full Territory Catalog (DATA.GOV.HK)',
        upstreamMeterReachable,
        lastSyncTime: lastGovSyncTime,
        catalog: stateCatalog,
      });
      return;
    }
    res.status(404).json({ error: 'Catalog not loaded' });
  });

  // Lightweight 20KB Real-Time Occupancy String for all 20,699 Smart Meters
  app.get('/api/meters/occupancy', (_req, res) => {
    const occStr =
      stateCatalog?.occupancyString ||
      stateMeters.map((m) => (m.meterStatus === 'OU' ? 'U' : m.occupied ? 'O' : 'V')).join('');
    let vacantCount = 0;
    for (let i = 0; i < occStr.length; i++) {
      if (occStr.charCodeAt(i) === 86) vacantCount++;
    }
    res.json({
      source: upstreamMeterReachable
        ? 'DATA.GOV.HK TD HKeMeter Live Occupancy Feed'
        : 'Edge Smart Meter Telemetry',
      upstreamMeterReachable,
      lastSyncTime: lastGovSyncTime,
      totalSpots: stateMeters.length,
      vacantCount,
      occupiedCount: stateMeters.length - vacantCount,
      occupancyString: occStr,
    });
  });

  // Detailed Single Smart Meter & Pole Sibling Inspector Endpoint
  app.get('/api/meters/:id', (req, res) => {
    const targetId = (req.params.id || '').trim().toUpperCase();
    const found = stateMeters.find((m) => m.id.toUpperCase() === targetId);
    if (!found) {
      res.status(404).json({ error: 'Smart meter not found' });
      return;
    }
    const poleSiblings = stateMeters.filter(
      (m) => m.meterPoleId === found.meterPoleId || m.corridorGroupId === found.corridorGroupId
    );
    res.json({
      source: 'TD HKeMeter Inspector',
      meter: {
        ...found,
        occupancyChangedAt: meterChangedAtMap.get(found.id) || found.occupancyChangedAt || null,
      },
      corridorBaysCount: poleSiblings.length,
      corridorVacantCount: poleSiblings.filter((b) => !b.occupied).length,
      siblings: poleSiblings.slice(0, 24),
    });
  });

  app.get('/api/meters', (req, res) => {
    const districtParam = req.query.district as string | undefined;
    const latStr = req.query.lat as string | undefined;
    const lngStr = req.query.lng as string | undefined;
    const radiusKmStr = req.query.radiusKm as string | undefined;
    const bboxParam = typeof req.query.bbox === 'string' ? req.query.bbox : '';
    const queryParam = (req.query.q as string | undefined)?.trim().toLowerCase();

    let filtered = stateMeters;

    if (queryParam) {
      filtered = filtered.filter(
        (m) =>
          m.streetZh.toLowerCase().includes(queryParam) ||
          m.streetSc.toLowerCase().includes(queryParam) ||
          m.streetEn.toLowerCase().includes(queryParam) ||
          m.districtZh.toLowerCase().includes(queryParam) ||
          m.districtSc.toLowerCase().includes(queryParam) ||
          m.districtEn.toLowerCase().includes(queryParam) ||
          (m.subDistrictZh && m.subDistrictZh.toLowerCase().includes(queryParam)) ||
          (m.subDistrictSc && m.subDistrictSc.toLowerCase().includes(queryParam)) ||
          (m.subDistrictEn && m.subDistrictEn.toLowerCase().includes(queryParam)) ||
          (m.sectionOfStreetZh && m.sectionOfStreetZh.toLowerCase().includes(queryParam)) ||
          (m.sectionOfStreetEn && m.sectionOfStreetEn.toLowerCase().includes(queryParam)) ||
          m.meterPoleId.toLowerCase().includes(queryParam) ||
          m.id.toLowerCase().includes(queryParam)
      );
    } else if (districtParam && districtParam !== 'all') {
      filtered = filtered.filter((m) => m.districtKey === districtParam);
    } else if (latStr && lngStr) {
      const userLat = parseFloat(latStr);
      const userLng = parseFloat(lngStr);
      const radiusKm = radiusKmStr ? parseFloat(radiusKmStr) : 4.5;
      if (!Number.isNaN(userLat) && !Number.isNaN(userLng) && radiusKm > 0) {
        filtered = filtered.filter((m) => {
          const dist = haversineDistanceKm([userLng, userLat], m.coordinates);
          return dist <= radiusKm;
        });
      }
    } else if (bboxParam) {
      const parts = bboxParam.split(',').map(Number);
      if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
        const [west, south, east, north] = parts;
        const pad = 0.015;
        filtered = filtered.filter(
          (m) =>
            m.coordinates[0] >= west - pad &&
            m.coordinates[0] <= east + pad &&
            m.coordinates[1] >= south - pad &&
            m.coordinates[1] <= north + pad
        );
      }
    } else {
      // Default to focused regional slice (e.g. central) to eliminate startup payload jamming
      filtered = filtered.filter((m) => m.districtKey === 'central');
    }

    res.json({
      source: 'Transport Dept HKeMeter Spatial Stream',
      totalTerritoryMeters: stateMeters.length,
      returnedCount: filtered.length,
      timestamp: new Date().toISOString(),
      data: filtered,
    });
  });

  app.get('/api/roads', (_req, res) => {
    res.json({
      source: 'TD Strategic Road Network Speed Map',
      timestamp: new Date().toISOString(),
      data: stateRoads,
    });
  });

  app.get('/api/tunnels', (_req, res) => {
    res.json({
      source: 'TD Cross-Harbour Journey Time Indicators',
      timestamp: new Date().toISOString(),
      data: stateTunnels,
    });
  });

  app.get('/api/cctv', (_req, res) => {
    res.json({
      source: 'TD Live Traffic CCTV Snapshot Registry',
      timestamp: new Date().toISOString(),
      data: stateCctv,
    });
  });

  // High-speed Edge Proxy for Transport Department CCTV JPEG Snapshots
  app.get('/api/cctv-snapshot/:id', async (req, res) => {
    const cleanId = (req.params.id || '').trim().toUpperCase();
    if (!ALLOWED_CCTV_ID_REGEX.test(cleanId)) {
      res.status(400).json({ error: 'Invalid Transport Department CCTV camera ID' });
      return;
    }
    const frame = await fetchTdCctvSnapshot(cleanId);
    if (frame) {
      res.setHeader('Content-Type', frame.contentType);
      res.setHeader('Cache-Control', 'public, max-age=50');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(frame.buffer);
      return;
    }
    res.redirect(302, `https://tdcctv.data.one.gov.hk/${encodeURIComponent(cleanId)}.JPG`);
  });

  app.get('/api/incidents', (_req, res) => {
    res.json({
      source: 'TD Special Traffic News & Incident Feed',
      timestamp: new Date().toISOString(),
      data: stateIncidents,
    });
  });

  let lastManualSimTickAt = 0;
  app.post('/api/simulate-tick', (_req, res) => {
    const now = Date.now();
    if (now - lastManualSimTickAt < 5000) {
      res.status(429).json({ error: 'Rate limit exceeded. Try again in 5 seconds.' });
      return;
    }
    lastManualSimTickAt = now;

    const next = simulateTelemetryTick(
      upstreamGovReachable ? [] : stateCarparks,
      upstreamMeterReachable ? [] : stateMeters,
      stateRoads,
      stateTunnels
    );
    if (!upstreamGovReachable) {
      stateCarparks = next.carparks;
    }
    if (!upstreamMeterReachable) {
      stateMeters = next.meters;
    }
    stateRoads = next.roads;
    stateTunnels = next.tunnels;
    res.json({
      timestamp: new Date().toISOString(),
      upstreamGovReachable,
      roads: stateRoads,
      tunnels: stateTunnels,
    });
  });

  // Google Maps Platform Routes API Integration Proxy (Server-side Only)
  const serverGoogleApiKey = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
  const routeRateLimiter = new Map<string, { count: number; resetAt: number }>();
  const serverRouteCache = new Map<string, { data: unknown; expiresAt: number }>();

  app.post('/api/routes/calculate', async (req, res) => {
    const { origin, destination, language } = req.body || {};
    if (
      !Array.isArray(origin) ||
      origin.length !== 2 ||
      !Array.isArray(destination) ||
      destination.length !== 2 ||
      typeof origin[0] !== 'number' ||
      typeof origin[1] !== 'number' ||
      typeof destination[0] !== 'number' ||
      typeof destination[1] !== 'number' ||
      !isWithinHongKongBounds(origin as [number, number]) ||
      !isWithinHongKongBounds(destination as [number, number])
    ) {
      res.status(400).json({ error: 'Origin and destination must be valid Hong Kong [lng, lat] coordinate pairs' });
      return;
    }

    const safeLang = language === 'en' || language === 'zh-CN' ? language : 'zh-HK';
    const cacheKey = `${origin[0].toFixed(4)},${origin[1].toFixed(4)}->${destination[0].toFixed(4)},${destination[1].toFixed(4)}:${safeLang}`;
    const now = Date.now();

    // 1. Serve cached route first without consuming rate-limit quota
    const cachedRoute = serverRouteCache.get(cacheKey);
    if (cachedRoute && now < cachedRoute.expiresAt) {
      res.json(cachedRoute.data);
      return;
    }

    // 2. Workshop-safe per-IP rate limit (120 uncached routes/min per IP)
    const forwardedFor = req.headers['x-forwarded-for'];
    const clientIp =
      (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : '') ||
      req.ip ||
      'unknown';
    const rate = routeRateLimiter.get(clientIp);
    if (!rate || now > rate.resetAt) {
      if (routeRateLimiter.size >= 2000) {
        routeRateLimiter.clear();
      }
      routeRateLimiter.set(clientIp, { count: 1, resetAt: now + 60_000 });
    } else if (rate.count >= 120) {
      res.status(429).json({ error: 'Too many route requests. Please wait a minute.' });
      return;
    } else {
      rate.count += 1;
    }

    // 3. Try Google Maps Platform Routes API v2 via server-side key
    if (serverGoogleApiKey) {
      const googleResult = await fetchGoogleRoutesApi({
        origin: origin as [number, number],
        destination: destination as [number, number],
        apiKey: serverGoogleApiKey,
        language: safeLang,
      });

      if (googleResult && googleResult.success && googleResult.coordinates.length >= 2) {
        if (!serverRouteCache.has(cacheKey) && serverRouteCache.size >= 500) {
          const oldestKey = serverRouteCache.keys().next().value;
          if (oldestKey) serverRouteCache.delete(oldestKey);
        }
        serverRouteCache.set(cacheKey, { data: googleResult, expiresAt: now + 180_000 });
        res.json(googleResult);
        return;
      }
    }

    res.json({
      provider: 'osrm_td_hybrid',
      message: 'Transport Department live traffic & OSRM engine',
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HK Park & Charge 3D Edge Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
