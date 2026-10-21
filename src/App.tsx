import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  Navigation,
  Zap,
  AlertTriangle,
  Compass,
  Layers,
  Search,
  RefreshCw,
  Download,
  ChevronUp,
  ChevronDown,
  X,
  CheckCircle2,
  ArrowRight,
  SlidersHorizontal,
  Camera,
  Radio,
  Globe,
  MapPin,
  Info,
  Crosshair,
  Route,
  Settings,
  ExternalLink,
  Monitor,
  Smartphone,
  Sun,
  Moon,
} from 'lucide-react';
import {
  CarparkFacility,
  SmartMeterSpot,
  RoadSegment,
  TdCctvCamera,
  TunnelCrossingMonitor,
  TrafficIncidentNotice,
  DistrictKey,
  ViewportBBox,
  QuickFilterKey,
  EvPowerFilter,
  LocaleKey,
  DISTRICT_PRESETS,
  INITIAL_ROADS,
  INITIAL_CCTV_CAMERAS,
  INITIAL_TUNNEL_MONITORS,
  INITIAL_TRAFFIC_INCIDENTS,
  UI_TRANSLATIONS,
  buildInitialCarparks,
  buildInitialSmartMeters,
  simulateTelemetryTick,
  calculateDistanceKm,
  isPointInBBox,
  detectViewportRegionLabel,
  detectNearestDistrictKey,
  matchesEvPowerFilter,
  pickLocaleText,
} from './data/hkParkingData';
import { HkDigitalTwinMap } from './components/HkDigitalTwinMap';
import { TdCctvSnapshotView } from './components/TdCctvSnapshotView';
import { AboutSubPage } from './components/AboutSubPage';
import { SetupModal } from './components/SetupModal';
import { ProactiveGpsCopilotPanel } from './components/ProactiveGpsCopilotPanel';
import {
  UserGpsState,
  DriverIntentMode,
  ProactiveSuggestionItem,
  PresetDriverGpsAnchor,
  PRESET_DRIVER_GPS_ANCHORS,
  isWithinHongKongBounds,
  computeProactiveSuggestions,
  buildTrafficAwareRoutePlan,
  fetchOsrmShortestRoute,
  fetchSmartUnifiedRoute,
  UnifiedRouteGeometry,
  requestDualPassGeolocation,
} from './utils/proactiveRouteEngine';
import {
  CompactSmartMeterCatalog,
  unpackSmartMeterCatalog,
  applyOccupancyStringToMeters,
  aggregateSmartMetersByCorridor,
  getSmartMeterOccupancyColor,
} from './utils/tdSmartMeterService';
import { generateStandaloneSingleFileHtml } from './utils/exportStandaloneHtml';

interface InitialUserRegion {
  coords: [number, number];
  district: Exclude<DistrictKey, 'all'>;
  labelZh: string;
  labelSc: string;
  labelEn: string;
}

function getInitialUserRegion(): InitialUserRegion {
  try {
    const saved = localStorage.getItem('hk_last_user_origin');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (
        parsed &&
        Array.isArray(parsed.coords) &&
        parsed.coords.length === 2 &&
        isWithinHongKongBounds(parsed.coords)
      ) {
        return {
          coords: [parsed.coords[0], parsed.coords[1]],
          district: (parsed.userDistrict || detectNearestDistrictKey(parsed.coords)) as Exclude<DistrictKey, 'all'>,
          labelZh: parsed.labelZh || '上次定位',
          labelSc: parsed.labelSc || '上次定位',
          labelEn: parsed.labelEn || 'Recent Location',
        };
      }
    }
  } catch {}

  // Focused default local neighborhood: Central & Western Core at street level
  return {
    coords: [114.1585, 22.2818],
    district: 'central',
    labelZh: '中環核心區',
    labelSc: '中环核心区',
    labelEn: 'Central District',
  };
}

export default function App() {
  const [initialRegion] = useState<InitialUserRegion>(() => getInitialUserRegion());
  const DEFAULT_ANCHOR_COORDS = initialRegion.coords;

  // Trilingual Language State (繁體中文 / 簡體中文 / English)
  const [locale, setLocale] = useState<LocaleKey>('zh-HK');
  const t = UI_TRANSLATIONS[locale];

  // Dual-Mode Telemetry State: Funneled to user's localized region only on startup to eliminate loading jam
  const [carparks, setCarparks] = useState<CarparkFacility[]>(() => buildInitialCarparks());
  const [meters, setMeters] = useState<SmartMeterSpot[]>(() => buildInitialSmartMeters());
  const [roads, setRoads] = useState<RoadSegment[]>(() => INITIAL_ROADS);
  const [tunnels, setTunnels] = useState<TunnelCrossingMonitor[]>(() => INITIAL_TUNNEL_MONITORS);
  const [cctvCameras] = useState<TdCctvCamera[]>(() => INITIAL_CCTV_CAMERAS);
  const [incidents] = useState<TrafficIncidentNotice[]>(() => INITIAL_TRAFFIC_INCIDENTS);

  const [dataMode, setDataMode] = useState<'mode_a_edge' | 'mode_b_sim'>('mode_a_edge');
  const [upstreamLive, setUpstreamLive] = useState<boolean>(false);
  const [autoLiveTick, setAutoLiveTick] = useState<boolean>(true);
  const [fullCatalogLoaded, setFullCatalogLoaded] = useState<boolean>(false);

  // Navigation, Filters & View State: Default to user's local district
  const [activeDistrict, setActiveDistrict] = useState<DistrictKey>(() => initialRegion.district);
  const [quickFilter, setQuickFilter] = useState<QuickFilterKey>('all');
  const [evPowerFilter, setEvPowerFilter] = useState<EvPowerFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [meterViewMode, setMeterViewMode] = useState<'corridors' | 'bays'>('corridors');
  const [meterVehicleFilter, setMeterVehicleFilter] = useState<'ALL' | 'A' | 'G' | 'C'>('ALL');
  const [meterListLimit, setMeterListLimit] = useState<number>(80);
  const [carparkListLimit, setCarparkListLimit] = useState<number>(60);
  const [inspectedMeterLiveDetail, setInspectedMeterLiveDetail] = useState<{
    id: string;
    occupancyChangedAt: string | null;
    corridorBaysCount: number;
    corridorVacantCount: number;
    siblings: SmartMeterSpot[];
  } | null>(null);

  // 3D Map, Viewport Bounding-Box & Camera Controls: Zoomed in to user's localized region
  const [is3DView, setIs3DView] = useState<boolean>(true);
  // Map Color Mode (Conventional Light vs Dark Digital Twin) - Default: Conventional Light
  const [mapTheme, setMapTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('hk_map_theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {}
    return 'light';
  });

  const handleSelectMapTheme = useCallback((theme: 'light' | 'dark') => {
    setMapTheme(theme);
    try {
      localStorage.setItem('hk_map_theme', theme);
    } catch {}
  }, []);
  const [showRoadsLayer, setShowRoadsLayer] = useState<boolean>(false);
  const [showMetersLayer, setShowMetersLayer] = useState<boolean>(true);
  const [showCctvLayer, setShowCctvLayer] = useState<boolean>(true);
  const [currentZoom, setCurrentZoom] = useState<number>(15.8);
  const [viewportCenter, setViewportCenter] = useState<[number, number]>(() => initialRegion.coords);
  const [viewportBBox, setViewportBBox] = useState<ViewportBBox | null>(null);
  const [viewportSyncEnabled, setViewportSyncEnabled] = useState<boolean>(true);
  const [districtMatrixOpen, setDistrictMatrixOpen] = useState<boolean>(false);
  const [cameraTarget, setCameraTarget] = useState<{
    center: [number, number];
    zoom: number;
    pitch: number;
    bearing: number;
    timestamp: number;
  } | null>(null);

  // Selection: Do not default to Harbour City; let user explore their immediate region
  const [selectedCarparkId, setSelectedCarparkId] = useState<string | null>(null);
  const [selectedMeterId, setSelectedMeterId] = useState<string | null>(null);
  const [selectedCctvId, setSelectedCctvId] = useState<string | null>(null);
  const [cctvDrawerOpen, setCctvDrawerOpen] = useState<boolean>(false);
  const [incidentsDrawerOpen, setIncidentsDrawerOpen] = useState<boolean>(false);
  const [mobileSheetExpanded, setMobileSheetExpanded] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<'auto_best' | 'ev_dock' | 'carparks' | 'meters'>('auto_best');
  const [aboutPageOpen, setAboutPageOpen] = useState<boolean>(false);
  const [setupModalOpen, setSetupModalOpen] = useState<boolean>(false);
  const [exportModalOpen, setExportModalOpen] = useState<boolean>(false);
  const [copiedHtml, setCopiedHtml] = useState<boolean>(false);

  // Proactive 3-Step GPS Co-Pilot, Auto-Suggestion & Shortest Route/Cost State
  const [userGps, setUserGps] = useState<UserGpsState | null>(null);
  const [gpsPromptDismissed, setGpsPromptDismissed] = useState<boolean>(false);
  const [isPickingMapOrigin, setIsPickingMapOrigin] = useState<boolean>(false);
  const [intentMode, setIntentMode] = useState<DriverIntentMode>('smart_auto');
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);
  const [plannedParkingHours, setPlannedParkingHours] = useState<number>(2);
  const [plannedChargingKwh, setPlannedChargingKwh] = useState<number>(30);
  const [copilotCollapsed, setCopilotCollapsed] = useState<boolean>(false);
  const [isGpsLoading, setIsGpsLoading] = useState<boolean>(false);
  const [gpsErrorMessage, setGpsErrorMessage] = useState<string | null>(null);
  const [isGpsPermissionDenied, setIsGpsPermissionDenied] = useState<boolean>(false);
  const [unifiedRouteGeometry, setUnifiedRouteGeometry] = useState<
    (UnifiedRouteGeometry & { key: string }) | null
  >(null);

  // Mobile Device Detection & Dedicated Mobile Mode
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.innerWidth < 768 ||
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    );
  });
  const [userOverrideDesktop, setUserOverrideDesktop] = useState<boolean>(false);
  const activeMobileMode = isMobile && !userOverrideDesktop;

  useEffect(() => {
    const handleResize = () => {
      const mobile =
        window.innerWidth < 768 ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(mobile);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const referenceOriginCoords: [number, number] = useMemo(
    () => (userGps ? userGps.coordinates : DEFAULT_ANCHOR_COORDS),
    [userGps, DEFAULT_ANCHOR_COORDS]
  );

  // Maintain latest refs so callbacks & timers do not recreate on every telemetry tick
  const carparksRef = useRef(carparks);
  carparksRef.current = carparks;
  const metersRef = useRef(meters);
  metersRef.current = meters;
  const roadsRef = useRef(roads);
  roadsRef.current = roads;
  const tunnelsRef = useRef(tunnels);
  tunnelsRef.current = tunnels;
  const referenceOriginCoordsRef = useRef(referenceOriginCoords);
  referenceOriginCoordsRef.current = referenceOriginCoords;
  const viewportCenterRef = useRef(viewportCenter);
  viewportCenterRef.current = viewportCenter;
  const hasAutoRequestedGpsRef = useRef(false);

  // When activeMobileMode activates: reset to 2D view, hide CCTV & road traffic clutter
  useEffect(() => {
    if (activeMobileMode) {
      setIs3DView(false);
      setShowCctvLayer(false);
      setShowRoadsLayer(false);
      setCctvDrawerOpen(false);
      setIncidentsDrawerOpen(false);
      setDistrictMatrixOpen(false);
      setSetupModalOpen(false);
      setAboutPageOpen(false);
    }
  }, [activeMobileMode]);

  // High-performance regional funneling: Smart meters are loaded strictly for the active region (30-150 spots)
  // via fetchDualModeData, completely eliminating the 1.3MB bulk catalog download on startup.

  // Fetch live inspector details & sibling bays when a specific Smart Meter is selected
  useEffect(() => {
    if (!selectedMeterId) {
      setInspectedMeterLiveDetail(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/meters/${encodeURIComponent(selectedMeterId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && data.meter) {
          setInspectedMeterLiveDetail({
            id: data.meter.id,
            occupancyChangedAt: data.meter.occupancyChangedAt || null,
            corridorBaysCount: data.corridorBaysCount || 0,
            corridorVacantCount: data.corridorVacantCount || 0,
            siblings: Array.isArray(data.siblings) ? data.siblings : [],
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedMeterId]);

  // Tracking anchor for spatial stream checks
  const lastSpatialFetchCenterRef = useRef<[number, number]>(referenceOriginCoords);

  // Dual-Mode Data Layer Fetch with 10KM Spatial Funneling (Mode A: `/api/*` -> Fallback Mode B)
  const fetchDualModeData = useCallback(
    async (forcedOrigin?: [number, number], forcedDistrict?: DistrictKey) => {
      if (dataMode === 'mode_b_sim') {
        const next = simulateTelemetryTick(
          carparksRef.current,
          [],
          roadsRef.current,
          tunnelsRef.current
        );
        setCarparks(next.carparks);
        setRoads(next.roads);
        setTunnels(next.tunnels);
        return;
      }

      try {
        const targetDist = forcedDistrict ?? activeDistrict;
        const origin = forcedOrigin ?? referenceOriginCoordsRef.current;
        const cpQueryParts: string[] = [];
        const meterQueryParts: string[] = [];

        if (activeMobileMode) {
          // In mobile mode, strictly query 3.5KM proximity around the user
          cpQueryParts.push(`lng=${origin[0].toFixed(5)}&lat=${origin[1].toFixed(5)}&radiusKm=3.5`);
          meterQueryParts.push(`lng=${origin[0].toFixed(5)}&lat=${origin[1].toFixed(5)}&radiusKm=3.5`);
        } else if (origin) {
          // Query radial proximity around origin so cross-district border facilities are always evaluated consistently
          cpQueryParts.push(`lng=${origin[0].toFixed(5)}&lat=${origin[1].toFixed(5)}&radiusKm=8.0`);
          meterQueryParts.push(`lng=${origin[0].toFixed(5)}&lat=${origin[1].toFixed(5)}&radiusKm=4.5`);
        } else if (targetDist !== 'all') {
          cpQueryParts.push(`district=${targetDist}`);
          meterQueryParts.push(`district=${targetDist}`);
        }

        const cpUrl = cpQueryParts.length > 0 ? `/api/carparks?${cpQueryParts.join('&')}` : '/api/carparks?radiusKm=2.0';
        const meterUrl = meterQueryParts.length > 0 ? `/api/meters?${meterQueryParts.join('&')}` : '/api/meters?radiusKm=2.0';

        const [cpRes, meterRes, occRes, rdRes, tnRes] = await Promise.all([
          fetch(cpUrl),
          fetch(meterUrl),
          fetch('/api/meters/occupancy'),
          fetch('/api/roads'),
          fetch('/api/tunnels'),
        ]);

        if (!cpRes.ok || !rdRes.ok) {
          throw new Error('Edge proxy unavailable');
        }

        const [cpJson, meterJson, occJson, rdJson, tnJson] = await Promise.all([
          cpRes.json(),
          meterRes.ok ? meterRes.json() : Promise.resolve(null),
          occRes.ok ? occRes.json() : Promise.resolve(null),
          rdRes.json(),
          tnRes.ok ? tnRes.json() : Promise.resolve({ data: null }),
        ]);

        if (Array.isArray(cpJson.data) && cpJson.data.length > 0) {
          setCarparks((prev) => {
            const map = new Map<string, CarparkFacility>();
            for (const c of prev) map.set(c.id, c);
            for (const c of cpJson.data) map.set(c.id, c);
            return Array.from(map.values());
          });
          if (meterJson && Array.isArray(meterJson.data) && meterJson.data.length > 0) {
            setMeters((prev) => {
              const map = new Map<string, SmartMeterSpot>();
              for (const m of prev) {
                if (!m.id.startsWith('sm-')) {
                  map.set(m.id, m);
                }
              }
              for (const m of meterJson.data) {
                map.set(m.id, m);
              }
              let list = Array.from(map.values());
              // Only apply raw index-based occupancyString when full 20,699 catalog is loaded in order
              if (
                list.length >= 20000 &&
                occJson &&
                typeof occJson.occupancyString === 'string' &&
                occJson.occupancyString.length >= 20000
              ) {
                list = applyOccupancyStringToMeters(list, occJson.occupancyString);
              }
              return list;
            });
          }
          setRoads(rdJson.data);
          if (Array.isArray(tnJson.data)) {
            setTunnels(tnJson.data);
          }
          setUpstreamLive(
            Boolean(cpJson.upstreamGovReachable || occJson?.upstreamMeterReachable)
          );
        }
      } catch {
        setDataMode('mode_b_sim');
        setCarparks((prevCp) => {
          const next = simulateTelemetryTick(
            prevCp,
            [],
            roadsRef.current,
            tunnelsRef.current
          );
          setRoads(next.roads);
          setTunnels(next.tunnels);
          return next.carparks;
        });
      }
    },
    [dataMode, activeDistrict, activeMobileMode]
  );

  useEffect(() => {
    fetchDualModeData(referenceOriginCoordsRef.current, activeDistrict);
  }, [activeDistrict, fetchDualModeData]);

  // Universal Search across districts: queries /api/carparks?q=... and /api/meters?q=... and merges results
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) return;
    const timeout = setTimeout(async () => {
      try {
        const [cpRes, mRes] = await Promise.all([
          fetch(`/api/carparks?q=${encodeURIComponent(q)}`),
          fetch(`/api/meters?q=${encodeURIComponent(q)}`),
        ]);
        if (cpRes.ok) {
          const json = await cpRes.json();
          if (Array.isArray(json.data) && json.data.length > 0) {
            setCarparks((prev) => {
              const map = new Map<string, CarparkFacility>();
              for (const c of prev) map.set(c.id, c);
              for (const c of json.data) map.set(c.id, c);
              return Array.from(map.values());
            });
          }
        }
        if (mRes.ok) {
          const mJson = await mRes.json();
          if (Array.isArray(mJson.data) && mJson.data.length > 0) {
            setMeters((prev) => {
              const map = new Map<string, SmartMeterSpot>();
              for (const m of prev) {
                if (!m.id.startsWith('sm-')) map.set(m.id, m);
              }
              for (const m of mJson.data) map.set(m.id, m);
              return Array.from(map.values());
            });
          }
        }
      } catch {
        // ignore search network error
      }
    }, 280);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    if (!autoLiveTick) return;
    const timer = setInterval(() => {
      if (dataMode === 'mode_a_edge') {
        fetchDualModeData();
      } else {
        const next = simulateTelemetryTick(
          carparksRef.current,
          [],
          roadsRef.current,
          tunnelsRef.current
        );
        setCarparks(next.carparks);
        setRoads(next.roads);
        setTunnels(next.tunnels);
      }
    }, 6500);
    return () => clearInterval(timer);
  }, [autoLiveTick, dataMode, fetchDualModeData]);

  const handleManualPulse = () => {
    if (dataMode === 'mode_a_edge') {
      fetchDualModeData();
    } else {
      const next = simulateTelemetryTick(
        carparksRef.current,
        [],
        roadsRef.current,
        tunnelsRef.current
      );
      setCarparks(next.carparks);
      setRoads(next.roads);
      setTunnels(next.tunnels);
    }
  };

  const dataSourceDisplay = useMemo(() => {
    if (dataMode === 'mode_b_sim') {
      return pickLocaleText(
        locale,
        `Mode B · 全港 ${meters.length.toLocaleString()} 個咪錶及車流引擎`,
        `Mode B · 全港 ${meters.length.toLocaleString()} 个咪表及车流引擎`,
        `Mode B · ${meters.length.toLocaleString()} HK Meters & Traffic Sim`
      );
    }
    return upstreamLive
      ? pickLocaleText(
          locale,
          `Mode A · DATA.GOV.HK 實時 (${meters.length.toLocaleString()} 咪錶)`,
          `Mode A · DATA.GOV.HK 实时 (${meters.length.toLocaleString()} 咪表)`,
          `Mode A · DATA.GOV.HK Live (${meters.length.toLocaleString()} Meters)`
        )
      : pickLocaleText(
          locale,
          'Mode A · Edge Proxy 實時數據流',
          'Mode A · Edge Proxy 实时数据流',
          'Mode A · Edge Proxy Live Stream'
        );
  }, [dataMode, upstreamLive, locale, meters.length]);

  // Synchronize CCTV camera speeds with live road speeds
  const liveCctvCameras = useMemo(() => {
    return cctvCameras.map((cam) => {
      const linkedCarpark = carparks.find((c) => cam.linkedCarparkIds.includes(c.id));
      if (!linkedCarpark) return cam;
      const spd = linkedCarpark.adjacentRoadSpeedKmh;
      const trafficStatus: TdCctvCamera['trafficStatus'] =
        spd > 40 ? 'good' : spd >= 20 ? 'average' : 'bad';
      return {
        ...cam,
        currentSpeedKmh: spd,
        trafficStatus,
      };
    });
  }, [cctvCameras, carparks]);

  // Handle Map Viewport Drag / Pan / Zoom (300ms Debounced from MapLibre)
  const handleViewportChange = useCallback(
    (vp: { center: [number, number]; bbox: ViewportBBox; zoom: number }) => {
      setViewportCenter(vp.center);
      setViewportBBox(vp.bbox);
      setCurrentZoom(vp.zoom);

      // If user drags towards another district, smoothly switch local district and stream data
      if (activeDistrict !== 'all') {
        const detectedDistrict = detectNearestDistrictKey(vp.center);
        if (detectedDistrict !== activeDistrict) {
          const curPreset = DISTRICT_PRESETS.find((d) => d.key === activeDistrict);
          const newPreset = DISTRICT_PRESETS.find((d) => d.key === detectedDistrict);
          const distToCur = curPreset ? calculateDistanceKm(vp.center, curPreset.center) : 999;
          const distToNew = newPreset ? calculateDistanceKm(vp.center, newPreset.center) : 999;
          if (distToNew < distToCur - 0.2 || distToCur > 2.8) {
            setActiveDistrict(detectedDistrict);
            lastSpatialFetchCenterRef.current = vp.center;
            fetchDualModeData(vp.center, detectedDistrict);
            return;
          }
        }
      }

      // Proximity stream: if map center shifted by > 2.4 KM from last fetch anchor, stream localized data for new area
      const distFromLastFetch = calculateDistanceKm(vp.center, lastSpatialFetchCenterRef.current);
      if (distFromLastFetch > 2.4) {
        lastSpatialFetchCenterRef.current = vp.center;
        fetchDualModeData(vp.center, activeDistrict);
      }
    },
    [activeDistrict, fetchDualModeData]
  );

  const currentViewportRegionName = useMemo(
    () => detectViewportRegionLabel(viewportCenter, locale),
    [viewportCenter, locale]
  );

  // Compute live counts for each EV Spec option in the current scope
  const evSpecCounts = useMemo(() => {
    const scopeCarparks = carparks.filter((cp) => {
      if (activeDistrict !== 'all' && cp.districtKey !== activeDistrict) {
        const inViewport = viewportBBox ? isPointInBBox(cp.coordinates, viewportBBox, 0.025) : false;
        if (!inViewport) return false;
      }
      if (
        viewportSyncEnabled &&
        activeDistrict === 'all' &&
        !searchQuery.trim() &&
        viewportBBox &&
        !isPointInBBox(cp.coordinates, viewportBBox, 0.025)
      ) {
        return false;
      }
      return true;
    });
    const list = scopeCarparks.length > 0 ? scopeCarparks : carparks;
    return {
      all: list.length,
      dc_super: list.filter((c) => matchesEvPowerFilter(c, 'dc_super')).length,
      ac_medium: list.filter((c) => matchesEvPowerFilter(c, 'ac_medium')).length,
    };
  }, [carparks, activeDistrict, viewportSyncEnabled, searchQuery, viewportBBox]);

  // Filtered Carparks (All-HK Territory-Wide + Dynamic Viewport Bounding-Box + EV Spec Mode Sorting)
  const filteredCarparks = useMemo(() => {
    const isSearching = searchQuery.trim().length > 0;
    const baseFiltered = carparks.filter((cp) => {
      if (!isSearching && activeDistrict !== 'all' && cp.districtKey !== activeDistrict) {
        // Show if in active district OR if physically within current visible map viewport/proximity
        const inViewport = viewportBBox ? isPointInBBox(cp.coordinates, viewportBBox, 0.02) : false;
        const closeToCenter = calculateDistanceKm(viewportCenter, cp.coordinates) < 3.8;
        if (!inViewport && !closeToCenter) return false;
      }
      if (quickFilter === 'available' && cp.availableSpaces < 5) return false;
      if (
        quickFilter === 'ev_dc' &&
        (!cp.evInfo?.hasEv || cp.evInfo.dcFastCount === 0 || cp.evInfo.dcAvailable === 0)
      ) {
        return false;
      }
      if (quickFilter === 'no_queue' && (cp.queueRisk || cp.availableSpaces < 5)) {
        return false;
      }
      if (!matchesEvPowerFilter(cp, evPowerFilter)) return false;

      if (isSearching) {
        const q = searchQuery.trim().toLowerCase();
        const match =
          cp.nameZh.toLowerCase().includes(q) ||
          cp.nameSc.toLowerCase().includes(q) ||
          cp.nameEn.toLowerCase().includes(q) ||
          cp.districtZh.toLowerCase().includes(q) ||
          cp.districtSc.toLowerCase().includes(q) ||
          cp.districtEn.toLowerCase().includes(q) ||
          cp.addressZh.toLowerCase().includes(q) ||
          cp.addressEn.toLowerCase().includes(q) ||
          Boolean(cp.evInfo?.operator && cp.evInfo.operator.toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });

    // If Viewport BBox Sync is enabled and no manual search is active, filter to current dragged viewport
    let result = baseFiltered;
    if (activeMobileMode && !isSearching) {
      const near2Km = baseFiltered.filter((cp) => {
        const d = calculateDistanceKm(referenceOriginCoords, cp.coordinates);
        return d <= 2.2;
      });
      if (near2Km.length > 0) {
        result = near2Km;
      }
    } else if (viewportSyncEnabled && activeDistrict === 'all' && !isSearching && viewportBBox) {
      const inViewport = baseFiltered.filter((cp) =>
        isPointInBBox(cp.coordinates, viewportBBox, 0.025)
      );
      if (inViewport.length > 0) {
        result = inViewport;
      }
    }

    return [...result].sort((a, b) => {
      const distA = calculateDistanceKm(referenceOriginCoords, a.coordinates);
      const distB = calculateDistanceKm(referenceOriginCoords, b.coordinates);
      return distA - distB;
    });
  }, [
    carparks,
    activeDistrict,
    quickFilter,
    evPowerFilter,
    searchQuery,
    viewportSyncEnabled,
    viewportBBox,
    referenceOriginCoords,
    activeMobileMode,
  ]);

  // Territory-Wide Filtered Smart Meters (rendered directly on MapLibre WebGL so NO locations are missing)
  const territoryFilteredMeters = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return meters.filter((m) => {
      if (!q && activeDistrict !== 'all' && m.districtKey !== activeDistrict) {
        const inViewport = viewportBBox ? isPointInBBox(m.coordinates, viewportBBox, 0.02) : false;
        const closeToCenter = calculateDistanceKm(viewportCenter, m.coordinates) < 3.8;
        if (!inViewport && !closeToCenter) return false;
      }
      if (quickFilter === 'available' && m.occupied) return false;
      if (meterVehicleFilter !== 'ALL' && (m.vehicleTypeCode || 'A') !== meterVehicleFilter) {
        return false;
      }
      if (q) {
        return (
          m.streetZh.toLowerCase().includes(q) ||
          m.streetSc.toLowerCase().includes(q) ||
          m.streetEn.toLowerCase().includes(q) ||
          m.districtZh.toLowerCase().includes(q) ||
          m.districtSc.toLowerCase().includes(q) ||
          m.districtEn.toLowerCase().includes(q) ||
          (m.subDistrictZh && m.subDistrictZh.toLowerCase().includes(q)) ||
          (m.subDistrictEn && m.subDistrictEn.toLowerCase().includes(q)) ||
          (m.sectionOfStreetZh && m.sectionOfStreetZh.toLowerCase().includes(q)) ||
          (m.sectionOfStreetEn && m.sectionOfStreetEn.toLowerCase().includes(q)) ||
          m.id.toLowerCase().includes(q) ||
          m.meterPoleId.toLowerCase().includes(q)
        );
      }

      // Mobile Mode: strictly funnel smart meters to 2KM around user location
      if (activeMobileMode && !q) {
        const distKm = calculateDistanceKm(referenceOriginCoords, m.coordinates);
        if (distKm > 2.2) return false;
      } else if (activeDistrict === 'all') {
        // Funnel smart meters: if territory overview, restrict to active viewport to avoid WebGL overload
        if (viewportBBox) {
          if (!isPointInBBox(m.coordinates, viewportBBox, 0.02)) return false;
        } else if (referenceOriginCoords) {
          if (calculateDistanceKm(referenceOriginCoords, m.coordinates) > 3.5) return false;
        }
      }

      return true;
    });
  }, [
    meters,
    activeDistrict,
    quickFilter,
    meterVehicleFilter,
    searchQuery,
    viewportBBox,
    referenceOriginCoords,
    activeMobileMode,
  ]);

  // Sidebar / Viewport Smart Meters (sorted by closeness to referenceOriginCoords)
  const filteredMeters = useMemo(() => {
    let pool = territoryFilteredMeters;
    if (
      viewportSyncEnabled &&
      activeDistrict === 'all' &&
      !searchQuery.trim() &&
      viewportBBox
    ) {
      const inBox = territoryFilteredMeters.filter((m) =>
        isPointInBBox(m.coordinates, viewportBBox, 0.025)
      );
      if (inBox.length > 0) {
        pool = inBox;
      }
    }

    const [refLng, refLat] = referenceOriginCoords;
    return [...pool].sort((a, b) => {
      const dA =
        (a.coordinates[0] - refLng) * (a.coordinates[0] - refLng) +
        (a.coordinates[1] - refLat) * (a.coordinates[1] - refLat);
      const dB =
        (b.coordinates[0] - refLng) * (b.coordinates[0] - refLng) +
        (b.coordinates[1] - refLat) * (b.coordinates[1] - refLat);
      return dA - dB;
    });
  }, [
    territoryFilteredMeters,
    viewportSyncEnabled,
    activeDistrict,
    searchQuery,
    viewportBBox,
    referenceOriginCoords,
  ]);

  // Street Corridor Summaries (1,732 official street sections across HK)
  const filteredMeterCorridors = useMemo(() => {
    const corridors = aggregateSmartMetersByCorridor(filteredMeters);
    const [refLng, refLat] = referenceOriginCoords;
    return corridors.sort((a, b) => {
      const dA =
        (a.centerCoordinates[0] - refLng) * (a.centerCoordinates[0] - refLng) +
        (a.centerCoordinates[1] - refLat) * (a.centerCoordinates[1] - refLat);
      const dB =
        (b.centerCoordinates[0] - refLng) * (b.centerCoordinates[0] - refLng) +
        (b.centerCoordinates[1] - refLat) * (b.centerCoordinates[1] - refLat);
      return dA - dB;
    });
  }, [filteredMeters, referenceOriginCoords]);

  // Aggregate KPI metrics
  const kpiMetrics = useMemo(() => {
    const totalAvailableSpaces = filteredCarparks.reduce((acc, c) => acc + c.availableSpaces, 0);
    const totalDcAvailable = filteredCarparks.reduce(
      (acc, c) => acc + (c.evInfo?.dcAvailable || 0),
      0
    );
    const queueAlertCount = filteredCarparks.filter((c) => c.queueRisk).length;
    let vacantMetersCount = 0;
    for (let i = 0; i < filteredMeters.length; i++) {
      if (!filteredMeters[i].occupied) vacantMetersCount++;
    }
    let territoryVacantMeters = 0;
    for (let i = 0; i < meters.length; i++) {
      if (!meters[i].occupied) territoryVacantMeters++;
    }
    return {
      totalAvailableSpaces,
      totalDcAvailable,
      queueAlertCount,
      vacantMetersCount,
      territoryVacantMeters,
      territoryTotalMeters: meters.length,
    };
  }, [filteredCarparks, filteredMeters, meters]);

  const selectedCarpark = useMemo(
    () => carparks.find((c) => c.id === selectedCarparkId) ?? null,
    [carparks, selectedCarparkId]
  );

  const selectedMeter = useMemo(
    () => meters.find((m) => m.id === selectedMeterId) ?? null,
    [meters, selectedMeterId]
  );

  // Compute street-section vacancy count (Vacant / Total Bays) & Occupancy Rate for the selected Smart Meter dot
  const selectedMeterSectionStats = useMemo(() => {
    if (!selectedMeter) return null;
    let totalBays = 0;
    let vacantBays = 0;
    const sectionBays: SmartMeterSpot[] = [];
    for (let i = 0; i < meters.length; i++) {
      const m = meters[i];
      if (
        m.districtKey === selectedMeter.districtKey &&
        m.streetEn === selectedMeter.streetEn &&
        (m.sectionOfStreetEn || '') === (selectedMeter.sectionOfStreetEn || '')
      ) {
        totalBays++;
        if (!m.occupied) vacantBays++;
        sectionBays.push(m);
      }
    }
    const safeTotal = totalBays || 1;
    const occupiedBays = Math.max(0, safeTotal - vacantBays);
    const occupancyRatePct = Math.round((occupiedBays / safeTotal) * 100);
    const occupancyColor = getSmartMeterOccupancyColor(occupancyRatePct);
    const centerCoordinates =
      sectionBays.length > 0
        ? sectionBays[Math.floor(sectionBays.length / 2)].coordinates
        : selectedMeter.coordinates;
    return {
      totalBays: safeTotal,
      vacantBays,
      occupiedBays,
      occupancyRatePct,
      occupancyColor,
      centerCoordinates,
    };
  }, [meters, selectedMeter]);

  const selectedCctv = useMemo(() => {
    if (selectedCctvId) {
      return liveCctvCameras.find((c) => c.id === selectedCctvId) ?? null;
    }
    if (selectedCarpark) {
      return liveCctvCameras.find((c) => c.id === selectedCarpark.cctvCameraId) ?? null;
    }
    return null;
  }, [liveCctvCameras, selectedCctvId, selectedCarpark]);

  // STEP 2: Automatically compute Top 3 Closest EV Charging Docks / Carparks / Meters around User's GPS
  const proactiveSuggestions = useMemo(() => {
    return computeProactiveSuggestions(
      referenceOriginCoords,
      carparks,
      meters,
      tunnels,
      intentMode,
      evPowerFilter
    );
  }, [referenceOriginCoords, carparks, meters, tunnels, intentMode, evPowerFilter]);

  const selectedDestCoords = selectedCarpark?.coordinates ?? selectedMeter?.coordinates ?? null;
  const routeCacheKey = selectedDestCoords
    ? `${referenceOriginCoords[0].toFixed(4)},${referenceOriginCoords[1].toFixed(4)}->${selectedDestCoords[0].toFixed(4)},${selectedDestCoords[1].toFixed(4)}`
    : null;

  // Fetch Google Maps Routes API / OSRM hybrid shortest route ONLY when primitive coordinate key changes
  useEffect(() => {
    if (!routeCacheKey || !selectedDestCoords) {
      setUnifiedRouteGeometry(null);
      return;
    }

    if (unifiedRouteGeometry?.key === routeCacheKey) return;

    let cancelled = false;
    const originSnapshot: [number, number] = [referenceOriginCoords[0], referenceOriginCoords[1]];
    const destSnapshot: [number, number] = [selectedDestCoords[0], selectedDestCoords[1]];

    fetchSmartUnifiedRoute(originSnapshot, destSnapshot, locale).then((res) => {
      if (!cancelled && res) {
        setUnifiedRouteGeometry({
          ...res,
          key: routeCacheKey,
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [routeCacheKey, locale]);

  // STEP 3: Build live traffic-aware shortest route & total cost plan
  const activeRoutePlan = useMemo(() => {
    if (!selectedCarpark && !selectedMeter) return null;
    const matchingUnified =
      routeCacheKey && unifiedRouteGeometry?.key === routeCacheKey ? unifiedRouteGeometry : null;

    return buildTrafficAwareRoutePlan({
      originCoords: referenceOriginCoords,
      carpark: selectedCarpark,
      meter: selectedMeter,
      tunnels,
      roads,
      unifiedGeometry: matchingUnified,
      parkingHours: plannedParkingHours,
      chargingKwh: plannedChargingKwh,
      locale,
    });
  }, [
    referenceOriginCoords,
    selectedCarpark,
    selectedMeter,
    tunnels,
    roads,
    routeCacheKey,
    unifiedRouteGeometry,
    plannedParkingHours,
    plannedChargingKwh,
    locale,
  ]);

  const activeGoogleMapsNavUrl = useMemo(() => {
    if (!activeRoutePlan || !activeRoutePlan.geometryCoords?.length) return null;
    const destCoords = selectedMeter
      ? selectedMeterSectionStats?.centerCoordinates ?? selectedMeter.coordinates
      : selectedCarpark
      ? selectedCarpark.coordinates
      : activeRoutePlan.destinationCoords;
    return `https://www.google.com/maps/dir/?api=1&origin=${referenceOriginCoords[1]},${referenceOriginCoords[0]}&destination=${destCoords[1]},${destCoords[0]}&travelmode=driving`;
  }, [activeRoutePlan, selectedCarpark, selectedMeter, selectedMeterSectionStats, referenceOriginCoords]);

  // Apply new GPS coordinates and automatically select the #1 closest suggested option
  const applyNewUserGpsOrigin = useCallback(
    (
      coords: [number, number],
      status: UserGpsState['status'],
      labelZh: string,
      labelSc: string,
      labelEn: string,
      accuracyMeters = 18,
      detectedDistrict?: DistrictKey
    ) => {
      const nowStr = new Date().toLocaleTimeString('zh-HK', { hour12: false });
      setUserGps({
        coordinates: coords,
        accuracyMeters,
        status,
        labelZh,
        labelSc,
        labelEn,
        updatedAt: nowStr,
      });
      setGpsPromptDismissed(true);
      setIsPickingMapOrigin(false);
      setCopilotCollapsed(false);

      const targetDistrict =
        (detectedDistrict && detectedDistrict !== 'all' ? detectedDistrict : null) ||
        detectNearestDistrictKey(coords);
      setActiveDistrict(targetDistrict);

      // Persist to localStorage for zero-wait load on next visit
      try {
        localStorage.setItem(
          'hk_last_user_origin',
          JSON.stringify({
            coords,
            userDistrict: targetDistrict,
            labelZh,
            labelSc,
            labelEn,
            timestamp: Date.now(),
          })
        );
      } catch {}

      // Strictly center and zoom into the user's immediate localized region (zoom: 16.0 for 2KM in mobile)
      setCameraTarget({
        center: coords,
        zoom: activeMobileMode ? 16.0 : 15.8,
        pitch: activeMobileMode ? 0 : is3DView ? 52 : 0,
        bearing: 0,
        timestamp: Date.now(),
      });

      lastSpatialFetchCenterRef.current = coords;
      void fetchDualModeData(coords, targetDistrict).finally(() => {
        const syncedSuggestions = computeProactiveSuggestions(
          coords,
          carparksRef.current,
          metersRef.current,
          tunnelsRef.current,
          intentMode,
          evPowerFilter
        );
        if (syncedSuggestions.length > 0) {
          const best = syncedSuggestions[0];
          setSelectedSuggestionId(best.id);
          if (best.carpark) {
            setSelectedCarparkId(best.carpark.id);
            setSelectedMeterId(null);
          } else if (best.meter) {
            setSelectedMeterId(best.meter.id);
            setSelectedCarparkId(null);
          }
        }
      });
    },
    [activeMobileMode, intentMode, evPowerFilter, is3DView, fetchDualModeData]
  );

  // STEP 1: Request Browser Geolocation Permission with Mobile-Optimized Dual-Pass & Loading Feedback
  const handleRequestBrowserGps = useCallback(() => {
    setIsGpsLoading(true);
    setGpsErrorMessage(null);
    setIsGpsPermissionDenied(false);

    requestDualPassGeolocation(
      (res) => {
        setIsGpsLoading(false);
        setGpsErrorMessage(null);
        setIsGpsPermissionDenied(false);
        const rawCoords = res.coordinates;
        if (isWithinHongKongBounds(rawCoords)) {
          const regionNameZh = detectViewportRegionLabel(rawCoords, 'zh-HK');
          const regionNameSc = detectViewportRegionLabel(rawCoords, 'zh-CN');
          const regionNameEn = detectViewportRegionLabel(rawCoords, 'en');
          const detectedDistrict = detectNearestDistrictKey(rawCoords);
          applyNewUserGpsOrigin(
            rawCoords,
            'granted',
            `實時 GPS (${regionNameZh})`,
            `实时 GPS (${regionNameSc})`,
            `Live GPS (${regionNameEn})`,
            res.accuracyMeters,
            detectedDistrict
          );
        } else {
          // Browser GPS succeeded, but user's physical IP/GPS is outside Hong Kong -> Anchor at current HK viewport center so routing works in HK
          const currentCenter = viewportCenterRef.current;
          const fallbackCoords: [number, number] = isWithinHongKongBounds(currentCenter)
            ? currentCenter
            : initialRegion.coords;
          const fallbackDistrict = detectNearestDistrictKey(fallbackCoords);
          const regionNameZh = detectViewportRegionLabel(fallbackCoords, 'zh-HK');
          const regionNameSc = detectViewportRegionLabel(fallbackCoords, 'zh-CN');
          const regionNameEn = detectViewportRegionLabel(fallbackCoords, 'en');
          applyNewUserGpsOrigin(
            fallbackCoords,
            'granted',
            `GPS 已授權 · 香港導航錨點 (${regionNameZh})`,
            `GPS 已授权 · 香港导航锚点 (${regionNameSc})`,
            `GPS Authorized · HK Anchor (${regionNameEn})`,
            res.accuracyMeters,
            fallbackDistrict
          );
        }
      },
      (err) => {
        setIsGpsLoading(false);
        setIsGpsPermissionDenied(err.isPermissionDenied);
        if (err.isPermissionDenied) {
          setGpsErrorMessage(
            pickLocaleText(
              locale,
              'GPS 定位授權未開啟。iPhone (iOS) 用戶請至手機「設定 > Chrome > 位置」改為「使用 App 期間」，或點選下方香港駕駛起點。',
              'GPS 定位权限未开启。iPhone (iOS) 用户请至手机「设置 > Chrome > 位置」改为「使用 App 期间」，或点选下方香港驾驶起点。',
              'Location permission denied. On iPhone, open Settings > Chrome > Location > While Using App.'
            )
          );
        } else if (err.isTimeout) {
          setGpsErrorMessage(
            pickLocaleText(
              locale,
              'GPS 衛星訊號搜尋超時（室內或收訊較弱）。請移至窗邊重試，或直接點選下方香港駕駛起點。',
              'GPS 卫星讯号搜寻超时（室内或收讯较弱）。请移至窗边重试，或直接点选下方香港驾驶起点。',
              'GPS satellite lock timed out. Please retry near a window or select an HK origin below.'
            )
          );
        } else {
          setGpsErrorMessage(
            pickLocaleText(
              locale,
              '無法獲取裝置 GPS 訊號。請點選「重新嘗試」或直接選擇下方香港起點進行體驗。',
              '无法获取装置 GPS 讯号。请点选「重新尝试」或直接选择下方香港起点进行体验。',
              'Unable to acquire device GPS signal. Please tap Retry or select an HK origin below.'
            )
          );
        }
      }
    );
  }, [initialRegion, applyNewUserGpsOrigin, locale]);

  // Auto-detect user geolocation ONCE when app is loaded
  useEffect(() => {
    if (hasAutoRequestedGpsRef.current) return;
    hasAutoRequestedGpsRef.current = true;
    handleRequestBrowserGps();
  }, [handleRequestBrowserGps]);

  const handleSelectPresetGps = useCallback(
    (preset: PresetDriverGpsAnchor) => {
      applyNewUserGpsOrigin(
        preset.coordinates,
        'simulated',
        preset.nameZh,
        preset.nameSc,
        preset.nameEn
      );
    },
    [applyNewUserGpsOrigin]
  );

  const handlePickMapOrigin = useCallback(
    (coords: [number, number]) => {
      const regionNameZh = detectViewportRegionLabel(coords, 'zh-HK');
      const regionNameSc = detectViewportRegionLabel(coords, 'zh-CN');
      const regionNameEn = detectViewportRegionLabel(coords, 'en');
      applyNewUserGpsOrigin(
        coords,
        'simulated',
        `自訂起點 (${regionNameZh})`,
        `自订起点 (${regionNameSc})`,
        `Custom Origin (${regionNameEn})`
      );
    },
    [applyNewUserGpsOrigin]
  );

  const handleSelectProactiveSuggestion = (sug: ProactiveSuggestionItem) => {
    setSelectedSuggestionId(sug.id);
    if (sug.category === 'ev_dock' && plannedChargingKwh === 0) {
      setPlannedChargingKwh(30);
    }
    if (sug.carpark) {
      setSelectedMeterId(null);
      setSelectedCctvId(null);
      setSelectedCarparkId(sug.carpark.id);
      const midLng = Number(((referenceOriginCoords[0] + sug.carpark.coordinates[0]) / 2).toFixed(5));
      const midLat = Number(((referenceOriginCoords[1] + sug.carpark.coordinates[1]) / 2).toFixed(5));
      const distKm = sug.straightDistanceKm;
      const autoZoom = distKm < 1.2 ? 15.4 : distKm < 3.5 ? 14.3 : distKm < 8 ? 13.2 : 12.2;
      setCameraTarget({
        center: [midLng, midLat],
        zoom: autoZoom,
        pitch: is3DView ? 55 : 0,
        bearing: is3DView ? -15 : 0,
        timestamp: Date.now(),
      });
    } else if (sug.meter) {
      setSelectedCarparkId(null);
      setSelectedCctvId(null);
      setSelectedMeterId(sug.meter.id);
      setShowMetersLayer(true);
      const midLng = Number(((referenceOriginCoords[0] + sug.meter.coordinates[0]) / 2).toFixed(5));
      const midLat = Number(((referenceOriginCoords[1] + sug.meter.coordinates[1]) / 2).toFixed(5));
      setCameraTarget({
        center: [midLng, midLat],
        zoom: 15.8,
        pitch: is3DView ? 50 : 0,
        bearing: 0,
        timestamp: Date.now(),
      });
    }
  };

  const handleFrameActiveRouteOnMap = () => {
    if (!activeRoutePlan) return;
    const midLng = Number(
      ((activeRoutePlan.originCoords[0] + activeRoutePlan.destinationCoords[0]) / 2).toFixed(5)
    );
    const midLat = Number(
      ((activeRoutePlan.originCoords[1] + activeRoutePlan.destinationCoords[1]) / 2).toFixed(5)
    );
    const distKm = calculateDistanceKm(
      activeRoutePlan.originCoords,
      activeRoutePlan.destinationCoords
    );
    const autoZoom = distKm < 1.2 ? 15.4 : distKm < 3.5 ? 14.3 : distKm < 8 ? 13.2 : 12.2;
    setCameraTarget({
      center: [midLng, midLat],
      zoom: autoZoom,
      pitch: is3DView ? 54 : 0,
      bearing: is3DView ? -12 : 0,
      timestamp: Date.now(),
    });
  };

  // District Fly-To handler
  const handleSelectDistrict = (key: DistrictKey) => {
    setAboutPageOpen(false);
    setSetupModalOpen(false);
    setActiveDistrict(key);
    setDistrictMatrixOpen(false);
    const preset = DISTRICT_PRESETS.find((d) => d.key === key);
    if (preset) {
      setCameraTarget({
        center: preset.center,
        zoom: key === 'all' ? 11.45 : preset.zoom,
        pitch: preset.pitch,
        bearing: preset.bearing,
        timestamp: Date.now(),
      });
      lastSpatialFetchCenterRef.current = preset.center;
      fetchDualModeData(preset.center, key);
    }
  };

  // Quick Filter Click handler
  const handleSelectQuickFilter = (filter: QuickFilterKey) => {
    setQuickFilter(filter);
    if (filter === 'ev_dc') {
      setEvPowerFilter('dc_super');
    } else if (filter === 'all') {
      setEvPowerFilter('all');
    }
    if (filter === 'meters') {
      setShowMetersLayer(true);
      const targetCenter =
        selectedCarpark?.coordinates ??
        DISTRICT_PRESETS.find((d) => d.key === activeDistrict)?.center ?? [114.1704, 22.2975];
      setCameraTarget({
        center: targetCenter,
        zoom: 16.3,
        pitch: is3DView ? 48 : 0,
        bearing: is3DView ? -12 : 0,
        timestamp: Date.now(),
      });
    }
  };

  // EV Spec Filter Click handler (updates 3D Pillars, Map Badges, and selected facility)
  const handleSelectEvPowerFilter = (spec: EvPowerFilter) => {
    setEvPowerFilter(spec);
    if (quickFilter === 'meters') {
      setQuickFilter('all');
    } else if (spec === 'ac_medium' && quickFilter === 'ev_dc') {
      setQuickFilter('all');
    } else if (spec === 'dc_super' && quickFilter === 'all') {
      // Keep quickFilter compatible
    }

    // Check if current selected carpark matches the new EV Spec; if not, select the nearest matching carpark
    const currentSelected = carparks.find((c) => c.id === selectedCarparkId);
    if (!currentSelected || !matchesEvPowerFilter(currentSelected, spec)) {
      const candidates = carparks
        .filter((c) => {
          if (activeDistrict !== 'all' && c.districtKey !== activeDistrict) return false;
          return matchesEvPowerFilter(c, spec);
        })
        .sort(
          (a, b) =>
            calculateDistanceKm(viewportCenter, a.coordinates) -
            calculateDistanceKm(viewportCenter, b.coordinates)
        );
      if (candidates.length > 0) {
        setSelectedCarparkId(candidates[0].id);
        setSelectedMeterId(null);
      }
    }
  };

  // Select Carpark & Fly-To
  const handleSelectCarpark = (cp: CarparkFacility | null) => {
    if (!cp) {
      setSelectedCarparkId(null);
      return;
    }
    setSelectedMeterId(null);
    setSelectedCctvId(null);
    setSelectedCarparkId(cp.id);
    setCameraTarget({
      center: cp.coordinates,
      zoom: 16.2,
      pitch: is3DView ? 60 : 0,
      bearing: is3DView ? -20 : 0,
      timestamp: Date.now(),
    });
  };

  // Select Curbside Smart Meter Street Section & Fly-To its single Dot
  const handleSelectMeter = (meter: SmartMeterSpot | null) => {
    if (!meter) {
      setSelectedMeterId(null);
      return;
    }
    setSelectedCarparkId(null);
    setSelectedCctvId(null);
    setSelectedMeterId(meter.id);
    const sectionBays = meters.filter(
      (m) =>
        m.districtKey === meter.districtKey &&
        m.streetEn === meter.streetEn &&
        (m.sectionOfStreetEn || '') === (meter.sectionOfStreetEn || '')
    );
    const targetCoords =
      sectionBays.length > 0
        ? sectionBays[Math.floor(sectionBays.length / 2)].coordinates
        : meter.coordinates;
    setCameraTarget({
      center: targetCoords,
      zoom: 16.8,
      pitch: is3DView ? 50 : 0,
      bearing: 0,
      timestamp: Date.now(),
    });
  };

  // Select TD CCTV Camera & Fly-To
  const handleSelectCctv = (cam: TdCctvCamera) => {
    setSelectedMeterId(null);
    setSelectedCctvId(cam.id);
    if (cam.linkedCarparkIds.length > 0) {
      setSelectedCarparkId(cam.linkedCarparkIds[0]);
    } else {
      setSelectedCarparkId(null);
    }
    setCameraTarget({
      center: cam.coordinates,
      zoom: 16.1,
      pitch: is3DView ? 58 : 0,
      bearing: is3DView ? -15 : 0,
      timestamp: Date.now(),
    });
  };

  // Select Cross-Harbour Tunnel Monitor & Fly-To Portal CCTV
  const handleSelectTunnel = (tunnel: TunnelCrossingMonitor) => {
    const cam = liveCctvCameras.find((c) => c.id === tunnel.cctvCameraId);
    if (cam) {
      handleSelectCctv(cam);
    } else {
      setCameraTarget({
        center: tunnel.coordinates,
        zoom: 15.6,
        pitch: is3DView ? 56 : 0,
        bearing: 0,
        timestamp: Date.now(),
      });
    }
  };

  // Select Traffic Incident Notice & Fly-To Affected Carpark
  const handleSelectIncident = (inc: TrafficIncidentNotice) => {
    setIncidentsDrawerOpen(false);
    const targetCpId = inc.affectedCarparkIds[0];
    const foundCp = targetCpId ? carparks.find((c) => c.id === targetCpId) : null;
    if (foundCp) {
      handleSelectCarpark(foundCp);
    } else {
      setCameraTarget({
        center: inc.coordinates,
        zoom: 16.0,
        pitch: is3DView ? 58 : 0,
        bearing: 0,
        timestamp: Date.now(),
      });
    }
  };

  // Download Standalone Single-File HTML (`index.html`)
  const handleDownloadStandaloneHtml = () => {
    const html = generateStandaloneSingleFileHtml(
      carparks,
      meters,
      roads,
      liveCctvCameras,
      tunnels,
      incidents
    );
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'index.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyStandaloneHtml = async () => {
    const html = generateStandaloneSingleFileHtml(
      carparks,
      meters,
      roads,
      liveCctvCameras,
      tunnels,
      incidents
    );
    await navigator.clipboard.writeText(html);
    setCopiedHtml(true);
    setTimeout(() => setCopiedHtml(false), 2500);
  };

  return (
    <div className="h-screen h-[100dvh] min-h-[100dvh] max-h-[100dvh] w-screen overflow-hidden flex flex-col bg-slate-950 text-slate-100 select-none">
      {/* Top Bar Contract: 3 Zones separated by gap-8 */}
      {activeMobileMode ? (
        <header className="h-12 px-3 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/80 flex items-center justify-between z-30 shrink-0 select-none pt-[env(safe-area-inset-top,0px)] box-content">
          {/* Mobile Title */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-cyan-400 flex items-center justify-center font-black text-slate-950 text-xs shadow-md">
              P
            </div>
            <div className="text-xs font-bold text-white tracking-tight leading-none">
              {pickLocaleText(locale, '泊快充 3D', '泊快充 3D', 'ParkPulse')}
            </div>
          </div>

          {/* Right Mobile Actions: About, Setup, GPS Locate, Language & Switch Desktop */}
          <div className="flex items-center gap-1 shrink-0">
            {/* About Sub-Page Trigger */}
            <button
              onClick={() => {
                setAboutPageOpen((v) => !v);
                setSetupModalOpen(false);
              }}
              className={`px-2 py-1 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1 min-h-[30px] cursor-pointer ${
                aboutPageOpen
                  ? 'bg-cyan-400 text-slate-950 border-cyan-400 font-bold'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:border-cyan-500/40'
              }`}
              title={pickLocaleText(locale, '關於本站 (About)', '关于本站 (About)', 'About')}
            >
              <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="text-[11px] font-semibold">
                {pickLocaleText(locale, '關於', '关于', 'About')}
              </span>
            </button>

            {/* Setup Modal Trigger */}
            <button
              onClick={() => {
                setSetupModalOpen((v) => !v);
                setAboutPageOpen(false);
              }}
              className={`px-2 py-1 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1 min-h-[30px] cursor-pointer ${
                setupModalOpen
                  ? 'bg-cyan-400 text-slate-950 border-cyan-400 font-bold'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:border-cyan-500/40'
              }`}
              title={pickLocaleText(locale, '設定 (Setup)', '设置 (Setup)', 'Setup')}
            >
              <Settings className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="text-[11px] font-semibold">
                {pickLocaleText(locale, '設定', '设置', 'Setup')}
              </span>
            </button>

            {/* GPS Locate Button */}
            <button
              onClick={handleRequestBrowserGps}
              disabled={isGpsLoading}
              className={`px-2 py-1 text-xs font-bold rounded-lg border transition-colors flex items-center gap-1 min-h-[30px] ${
                isGpsLoading
                  ? 'bg-cyan-500/30 text-cyan-200 border-cyan-400 cursor-wait'
                  : userGps
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50'
                  : 'bg-cyan-500/20 text-cyan-300 border-cyan-400/50 hover:bg-cyan-400 hover:text-slate-950'
              }`}
            >
              {isGpsLoading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Crosshair className="w-3.5 h-3.5" />
              )}
              <span className="text-[11px] hidden xs:inline">
                {isGpsLoading
                  ? pickLocaleText(locale, '搜尋中', '搜寻中', 'Locating')
                  : userGps
                  ? pickLocaleText(locale, '已定位', '已定位', 'GPS Active')
                  : pickLocaleText(locale, '定位', '定位', 'Locate')}
              </span>
            </button>

            {/* Language Switcher */}
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
              {(
                [
                  { key: 'zh-HK', label: '繁' },
                  { key: 'zh-CN', label: '简' },
                  { key: 'en', label: 'EN' },
                ] as { key: LocaleKey; label: string }[]
              ).map((lang) => (
                <button
                  key={lang.key}
                  onClick={() => setLocale(lang.key)}
                  className={`px-1.5 py-1 text-[10px] font-bold rounded-md transition-colors ${
                    locale === lang.key
                      ? 'bg-cyan-400 text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>

            {/* Toggle Desktop Mode */}
            <button
              onClick={() => setUserOverrideDesktop(true)}
              title={pickLocaleText(locale, '切換至桌面版佈局', '切换至桌面版布局', 'Switch to Desktop')}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>
      ) : (
        <header className="h-14 px-5 bg-slate-950/92 backdrop-blur-md border-b border-slate-800/80 flex items-center justify-between gap-8 z-30 shrink-0">
          {/* Zone 1: Modern Tech Brand Wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              handleSelectDistrict('all');
            }}
            className="flex items-center gap-2.5 whitespace-nowrap shrink-0 group"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400/20 to-blue-600/30 border border-cyan-400/50 flex items-center justify-center shadow-lg shadow-cyan-500/10 group-hover:border-cyan-300 transition-colors">
              <Zap className="w-4 h-4 text-cyan-400 fill-cyan-400/30" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-base font-extrabold tracking-tight text-white font-sans">
                Park<span className="text-cyan-400">Pulse</span>
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/35 font-mono">
                HK
              </span>
              <span className="text-xs font-semibold text-slate-300 hidden sm:inline pl-1.5 border-l border-slate-800">
                {pickLocaleText(locale, '泊快充 3D', '泊快充 3D', '3D Smart Twin')}
              </span>
            </div>
          </a>

          {/* Zone 2: Live Viewport Radar Indicator + Core Quick-Jumps + 18-District Teleport Matrix Trigger */}
          <nav className="hidden lg:flex items-center gap-4 text-xs font-medium text-slate-300">
            {/* Live Regional Viewport Indicator */}
            <button
              onClick={() => {
                if (activeDistrict === 'all') {
                  const target = detectNearestDistrictKey(viewportCenter);
                  handleSelectDistrict(target);
                } else {
                  handleSelectDistrict('all');
                }
              }}
              title={pickLocaleText(
                locale,
                '目前顯示所在區域（點擊切換：所在區域 / 全港總覽）',
                '目前显示所在区域（点击切换：所在区域 / 全港总览）',
                'Focusing on local region (Click to toggle Local Region vs All-HK)'
              )}
              className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                activeDistrict !== 'all'
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                {pickLocaleText(locale, '所在區域:', '所在区域:', 'Region:')}{' '}
                <strong className="text-white">{currentViewportRegionName}</strong>
              </span>
            </button>

            {DISTRICT_PRESETS.slice(1, 5).map((preset) => (
              <button
                key={preset.key}
                onClick={() => handleSelectDistrict(preset.key)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  activeDistrict === preset.key
                    ? 'text-cyan-400 border-cyan-400 font-semibold'
                    : 'text-slate-400 border-transparent hover:text-white'
                }`}
              >
                {pickLocaleText(locale, preset.labelZh, preset.labelSc, preset.labelEn)}
              </button>
            ))}

            <button
              onClick={() => {
                setAboutPageOpen(false);
                setSetupModalOpen(false);
                setDistrictMatrixOpen((v) => !v);
                setCctvDrawerOpen(false);
                setIncidentsDrawerOpen(false);
              }}
              className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                districtMatrixOpen || !['all', 'central', 'cwb', 'tst', 'mongkok'].includes(activeDistrict)
                  ? 'bg-cyan-400 text-slate-950 border-cyan-400 shadow-sm'
                  : 'bg-slate-900 border-slate-700 text-cyan-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>
                {pickLocaleText(
                  locale,
                  '跨區瞬移 / 全港熱力表',
                  '跨区瞬移 / 全港热力表',
                  'Quick Teleport & HK Heatmap'
                )}
              </span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </nav>

          {/* Zone 3: Proactive GPS Trigger, About Sub-Page Toggle & Primary Export Action */}
          <div className="flex items-center gap-2 shrink-0">
            {isMobile && (
              <button
                onClick={() => setUserOverrideDesktop(false)}
                className="px-2 py-1 text-xs font-semibold rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 flex items-center gap-1"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>{pickLocaleText(locale, '返回移動模式', '返回移动模式', 'Mobile')}</span>
              </button>
            )}

            <button
              onClick={handleRequestBrowserGps}
              disabled={isGpsLoading}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                isGpsLoading
                  ? 'bg-cyan-500/30 text-cyan-200 border-cyan-400 cursor-wait'
                  : userGps
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/50'
                  : 'bg-cyan-500/15 text-cyan-300 border-cyan-400/50 hover:bg-cyan-400 hover:text-slate-950'
              }`}
            >
              {isGpsLoading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Crosshair className="w-3.5 h-3.5" />
              )}
              <span>
                {isGpsLoading
                  ? pickLocaleText(locale, 'GPS 搜尋中...', 'GPS 搜寻中...', 'Locating...')
                  : userGps
                  ? pickLocaleText(locale, '📍 已定位 · 重新推薦', '📍 已定位 · 重新推荐', '📍 GPS Active')
                  : pickLocaleText(locale, '📍 GPS 智能推薦', '📍 GPS 智能推荐', '📍 GPS Auto-Suggest')}
              </span>
            </button>

            <button
              onClick={() => {
                setAboutPageOpen((v) => !v);
                setSetupModalOpen(false);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                aboutPageOpen
                  ? 'bg-orange-500 text-white border-orange-400 shadow-sm'
                  : 'bg-slate-900/90 text-slate-200 border-slate-700 hover:border-cyan-400 hover:text-cyan-300'
              }`}
            >
              <Info className="w-3.5 h-3.5 text-cyan-400" />
              <span>{pickLocaleText(locale, '關於 About', '关于 About', 'About')}</span>
            </button>

            <button
              onClick={() => {
                setSetupModalOpen((v) => !v);
                setAboutPageOpen(false);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                setupModalOpen
                  ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-sm font-bold'
                  : 'bg-slate-900/90 text-slate-200 border-slate-700 hover:border-cyan-400 hover:text-cyan-300'
              }`}
            >
              <Settings className="w-3.5 h-3.5 text-cyan-400" />
              <span>{pickLocaleText(locale, '設定 Setup', '设置 Setup', 'Setup')}</span>
            </button>

            <button
              onClick={() => setExportModalOpen(true)}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 rounded-lg hover:bg-cyan-300 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t.exportBtn}</span>
            </button>
          </div>
        </header>
      )}

      {/* Main 3D Spatial Viewport & Semantic DOM Overlays */}
      <main className="relative flex-1 w-full h-full overflow-hidden">
        {/* 3D MapLibre Digital Twin Canvas */}
        <HkDigitalTwinMap
          carparks={filteredCarparks}
          allCarparks={carparks}
          meters={territoryFilteredMeters}
          roads={roads}
          cctvCameras={liveCctvCameras}
          locale={locale}
          evPowerFilter={evPowerFilter}
          quickFilter={quickFilter}
          selectedCarparkId={selectedCarparkId}
          selectedMeterId={selectedMeterId}
          selectedCctvId={selectedCctvId}
          is3DView={is3DView}
          showRoadsLayer={showRoadsLayer}
          showMetersLayer={showMetersLayer}
          showCctvLayer={showCctvLayer}
          cameraTarget={cameraTarget}
          onSelectCarpark={handleSelectCarpark}
          onSelectMeter={handleSelectMeter}
          onSelectCctv={handleSelectCctv}
          onZoomChange={setCurrentZoom}
          onViewportChange={handleViewportChange}
          userGpsLocation={referenceOriginCoords}
          activeRouteCoords={activeRoutePlan?.geometryCoords ?? null}
          isPickingMapOrigin={isPickingMapOrigin}
          onPickMapOrigin={handlePickMapOrigin}
          initialCenter={initialRegion.coords}
          initialZoom={activeMobileMode ? 16.0 : 15.8}
          isMobile={activeMobileMode}
          mapTheme={mapTheme}
        />

        {/* Top Floating Hybrid HUD Toolbar (Streamlined single clean row with filters moved under Settings - Desktop Only) */}
        {!activeMobileMode && (
          <div className="absolute top-3 left-3 right-3 lg:left-[404px] z-20 flex flex-col gap-2 pointer-events-none">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Left: Cross-Harbour Tunnels Travel Time Monitors (CHT / EHC / WHC) */}
            <div className="pointer-events-auto flex items-center gap-1.5 p-1.5 bg-slate-950/90 backdrop-blur-md border border-slate-800/90 rounded-xl shadow-xl overflow-x-auto max-w-full">
              <span className="text-[11px] font-semibold text-slate-400 px-1.5 whitespace-nowrap hidden xl:inline">
                {t.tunnelBarTitle}:
              </span>
              {tunnels.map((tun) => {
                const hkColor =
                  tun.toHkStatus === 'bad'
                    ? 'text-rose-400 font-bold'
                    : tun.toHkStatus === 'average'
                    ? 'text-amber-300 font-semibold'
                    : 'text-emerald-400 font-semibold';
                const klnColor =
                  tun.toKlnStatus === 'bad'
                    ? 'text-rose-400 font-bold'
                    : tun.toKlnStatus === 'average'
                    ? 'text-amber-300 font-semibold'
                    : 'text-emerald-400 font-semibold';

                return (
                  <button
                    key={tun.id}
                    onClick={() => handleSelectTunnel(tun)}
                    className="px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/40 transition-colors flex items-center gap-2 text-xs whitespace-nowrap shrink-0"
                  >
                    <span className="font-bold text-white">
                      {pickLocaleText(locale, tun.shortZh, tun.shortSc, tun.shortEn)}
                    </span>
                    <span className={`font-mono-tabular text-[11px] ${hkColor}`}>
                      {t.toHkShort} {tun.toHkMins}
                      {t.minsUnit}
                    </span>
                    <span aria-hidden="true" className="text-slate-700">
                      ·
                    </span>
                    <span className={`font-mono-tabular text-[11px] ${klnColor}`}>
                      {t.toKlnShort} {tun.toKlnMins}
                      {t.minsUnit}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Right: Active Filter Indicator, Settings/Filter Shortcut, Camera, Layers & Trilingual Controls */}
            <div className="pointer-events-auto flex items-center gap-1.5 p-1 bg-slate-950/90 backdrop-blur-md border border-slate-800/90 rounded-xl shadow-2xl">
              {/* Active Filter Chip (visible when filter is active; allows one-click clear) */}
              {(quickFilter !== 'all' || evPowerFilter !== 'all') && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 text-xs font-semibold whitespace-nowrap">
                  <span>
                    {quickFilter === 'available'
                      ? t.filterAvailable
                      : quickFilter === 'meters'
                      ? t.filterMeters
                      : quickFilter === 'ev_dc'
                      ? t.filterEvDc
                      : quickFilter === 'no_queue'
                      ? t.filterNoQueue
                      : evPowerFilter === 'dc_super'
                      ? '⚡ DC 超充'
                      : '🔌 AC 中充'}
                  </span>
                  <button
                    onClick={() => {
                      handleSelectQuickFilter('all');
                      handleSelectEvPowerFilter('all');
                    }}
                    title={pickLocaleText(locale, '清除篩選', '清除筛选', 'Clear filter')}
                    className="p-0.5 hover:bg-cyan-400/30 rounded text-cyan-300 hover:text-white cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Direct Settings & Filter Modal Button */}
              <button
                onClick={() => {
                  setSetupModalOpen(true);
                  setAboutPageOpen(false);
                }}
                title={pickLocaleText(
                  locale,
                  '篩選設施與系統設定 (Settings & Filters)',
                  '筛选设施与系统设置 (Settings & Filters)',
                  'Settings & Filters'
                )}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-900/90 text-cyan-300 border border-slate-800 hover:border-cyan-400 hover:bg-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                <span className="hidden sm:inline">
                  {pickLocaleText(locale, '車位篩選 / 設定', '车位筛选 / 设置', 'Filters / Setup')}
                </span>
              </button>

              {/* Trilingual Switcher (繁 / 簡 / EN) */}
              <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                <Globe className="w-3.5 h-3.5 text-slate-400 ml-1.5 mr-1 hidden sm:inline" />
                {(
                  [
                    { key: 'zh-HK', label: '繁' },
                    { key: 'zh-CN', label: '简' },
                    { key: 'en', label: 'EN' },
                  ] as { key: LocaleKey; label: string }[]
                ).map((lang) => (
                  <button
                    key={lang.key}
                    onClick={() => setLocale(lang.key)}
                    className={`px-2 py-1 text-[11px] font-bold rounded-md transition-colors whitespace-nowrap ${
                      locale === lang.key
                        ? 'bg-cyan-400 text-slate-950'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>

              {/* Quick Map Color Theme Toggle (Conventional Light vs Dark Digital Twin) */}
              <button
                onClick={() => handleSelectMapTheme(mapTheme === 'light' ? 'dark' : 'light')}
                title={pickLocaleText(
                  locale,
                  mapTheme === 'light' ? '切換至夜間數碼孿生深色地圖' : '切換至日間常規淺色地圖',
                  mapTheme === 'light' ? '切换至夜间数码孪生深色地图' : '切换至日间常规浅色地图',
                  mapTheme === 'light' ? 'Switch to Dark Digital Twin Map' : 'Switch to Conventional Light Map'
                )}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  mapTheme === 'light'
                    ? 'bg-amber-400/20 text-amber-300 border border-amber-400/50 hover:bg-amber-400/30'
                    : 'bg-slate-900 text-slate-300 border border-slate-800 hover:text-white hover:border-cyan-500/40'
                }`}
              >
                {mapTheme === 'light' ? (
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Moon className="w-3.5 h-3.5 text-cyan-400" />
                )}
                <span className="hidden sm:inline">
                  {mapTheme === 'light'
                    ? pickLocaleText(locale, '日間常規', '日间常规', 'Light Map')
                    : pickLocaleText(locale, '夜間孿生', '夜间孪生', 'Dark Map')}
                </span>
              </button>

              <button
                onClick={() => setIs3DView((v) => !v)}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  is3DView
                    ? 'bg-slate-800 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{is3DView ? t.view3D : t.view2D}</span>
              </button>

              <button
                onClick={() => setShowMetersLayer((v) => !v)}
                title={pickLocaleText(
                  locale,
                  `顯示 / 隱藏智能咪錶圖層`,
                  `显示 / 隐藏智能咪表图层`,
                  `Toggle smart meter layer`
                )}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  showMetersLayer
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="hidden md:inline">
                  {pickLocaleText(locale, '智能咪錶', '智能咪表', 'Meters')}
                </span>
              </button>

              <button
                onClick={() => {
                  setCctvDrawerOpen((v) => !v);
                  setIncidentsDrawerOpen(false);
                }}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  cctvDrawerOpen
                    ? 'bg-cyan-400 text-slate-950 shadow-sm'
                    : 'bg-slate-800/90 text-cyan-300 border border-cyan-500/40 hover:bg-slate-800'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{t.layerCctv}</span>
                <span className="font-mono-tabular text-[11px] font-bold">
                  ({liveCctvCameras.length})
                </span>
              </button>

              <button
                onClick={() => {
                  setIncidentsDrawerOpen((v) => !v);
                  setCctvDrawerOpen(false);
                }}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  incidentsDrawerOpen
                    ? 'bg-rose-500 text-white'
                    : 'bg-rose-950/70 text-rose-300 border border-rose-500/40 hover:bg-rose-900/70'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t.incidentBtn}</span>
                <span className="font-mono-tabular text-[11px] font-bold">
                  ({incidents.length})
                </span>
              </button>

              <button
                onClick={handleManualPulse}
                className="px-2 py-1.5 text-xs font-medium text-slate-200 hover:text-cyan-300 hover:bg-slate-900 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1"
                title={t.refreshBtn}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Collapsible 18-District Live Vacancy Heatmap & Instant 3D Teleport Matrix Drawer */}
          {districtMatrixOpen && (
            <div className="pointer-events-auto max-w-4xl bg-slate-950/95 backdrop-blur-xl border border-cyan-500/40 rounded-2xl p-4 shadow-2xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <div>
                  <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
                    <MapPin className="w-4 h-4 text-cyan-400" />
                    <span>
                      {pickLocaleText(
                        locale,
                        `全港 18 區即時車位與 ${kpiMetrics.territoryTotalMeters.toLocaleString()} 個智能咪錶熱力表 (18-District Live Heatmap)`,
                        `全港 18 区实时车位与 ${kpiMetrics.territoryTotalMeters.toLocaleString()} 个智能咪表热力表 (18-District Live Heatmap)`,
                        `Hong Kong 18-District Live Carpark & ${kpiMetrics.territoryTotalMeters.toLocaleString()} Smart Meter Heatmap`
                      )}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {pickLocaleText(
                      locale,
                      '💡 涵蓋全港 18 區所有運輸署 HKeMeter 智能咪錶及商場車場，點擊下方任何區域一鍵飛越直達：',
                      '💡 涵盖全港 18 区所有运输署 HKeMeter 智能咪表及商场车场，点击下方任何区域一键飞越直达：',
                      '💡 Covers all 18 HK districts & official TD HKeMeter locations. Click any district to teleport:'
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSelectDistrict('all')}
                    className="px-3 py-1.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-bold transition-colors whitespace-nowrap"
                  >
                    {pickLocaleText(
                      locale,
                      '🌐 縮放至全港鳥瞰全景',
                      '🌐 缩放至全港鸟瞰全景',
                      '🌐 Bird’s-Eye Full HK View'
                    )}
                  </button>
                  <button
                    onClick={() => setDistrictMatrixOpen(false)}
                    className="p-1 text-slate-400 hover:text-white rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[62vh] overflow-y-auto custom-scrollbar pr-1">
                {DISTRICT_PRESETS.filter((d) => d.key !== 'all').map((preset) => {
                  const distCarparks = carparks.filter((c) => c.districtKey === preset.key);
                  const totalVacant = distCarparks.reduce((acc, c) => acc + c.availableSpaces, 0);
                  const totalDc = distCarparks.reduce(
                    (acc, c) => acc + (c.evInfo?.dcAvailable || 0),
                    0
                  );
                  const hasQueue = distCarparks.some((c) => c.queueRisk);
                  let distMetersTotal = 0;
                  let distMetersVacant = 0;
                  for (let i = 0; i < meters.length; i++) {
                    if (meters[i].districtKey === preset.key) {
                      distMetersTotal++;
                      if (!meters[i].occupied) distMetersVacant++;
                    }
                  }
                  const isCurrent = activeDistrict === preset.key;

                  return (
                    <button
                      key={preset.key}
                      onClick={() => handleSelectDistrict(preset.key)}
                      className={`text-left p-2.5 rounded-xl border transition-all flex flex-col justify-between gap-1.5 ${
                        isCurrent
                          ? 'bg-cyan-500/20 border-cyan-400 shadow-md'
                          : 'bg-slate-900/90 border-slate-800 hover:border-cyan-500/50 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-white truncate">
                          {pickLocaleText(locale, preset.labelZh, preset.labelSc, preset.labelEn)}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 shrink-0">
                          {preset.regionGroup === 'hk_island'
                            ? pickLocaleText(locale, '港島', '港岛', 'HK')
                            : preset.regionGroup === 'kowloon'
                            ? pickLocaleText(locale, '九龍', '九龙', 'KLN')
                            : pickLocaleText(locale, '新界', '新界', 'NT')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono-tabular">
                        <span className="text-emerald-400 font-bold">
                          🅿️ {totalVacant} {t.spacesUnit}
                        </span>
                        <span className="text-cyan-300 font-semibold">⚡ {totalDc} DC</span>
                      </div>
                      <div className="flex items-center justify-between text-[10px] font-mono-tabular text-slate-300">
                        <span className="text-emerald-300">
                          🟢 {pickLocaleText(locale, '咪錶', '咪表', 'Meters')}: {distMetersVacant}/
                          {distMetersTotal}
                        </span>
                        {hasQueue ? (
                          <span className="text-rose-400 font-semibold">
                            {pickLocaleText(locale, '⚠️ 排隊', '⚠️ 排队', '⚠️ Queue')}
                          </span>
                        ) : (
                          <span className="text-emerald-400">
                            {pickLocaleText(locale, '✓ 暢順', '✓ 畅顺', '✓ Smooth')}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Collapsible Live All-HK Entrance & Tunnel CCTV Matrix Wall Drawer */}
          {cctvDrawerOpen && (
            <div className="pointer-events-auto max-w-4xl bg-slate-950/95 backdrop-blur-xl border border-cyan-500/40 rounded-2xl p-3.5 shadow-2xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
                  <Camera className="w-4 h-4 text-cyan-400" />
                  <span>
                    {pickLocaleText(
                      locale,
                      '全港實時路面及車場入口閉路電視矩陣 (TD Live CCTV Matrix)',
                      '全港实时路面及车场入口闭路电视矩阵 (TD Live CCTV Matrix)',
                      'HK Live Carpark Entrance & Tunnel CCTV Matrix'
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowCctvLayer((v) => !v)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                      showCctvLayer
                        ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    {pickLocaleText(
                      locale,
                      showCctvLayer ? '地圖鏡頭標記：顯示中' : '地圖鏡頭標記：已隱藏',
                      showCctvLayer ? '地图镜头标记：显示中' : '地图镜头标记：已隐藏',
                      showCctvLayer ? 'Map Pins: Visible' : 'Map Pins: Hidden'
                    )}
                  </button>
                  <button
                    onClick={() => setCctvDrawerOpen(false)}
                    className="p-1 text-slate-400 hover:text-white rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[60vh] overflow-y-auto custom-scrollbar pr-1">
                {liveCctvCameras.map((cam) => (
                  <div
                    key={cam.id}
                    onClick={() => {
                      handleSelectCctv(cam);
                      setCctvDrawerOpen(false);
                    }}
                    className="cursor-pointer rounded-xl border border-slate-800 hover:border-cyan-400/70 transition-all overflow-hidden bg-slate-900/80"
                  >
                    <TdCctvSnapshotView
                      camera={cam}
                      allCameras={liveCctvCameras}
                      locale={locale}
                      compact={true}
                      onSelectCamera={handleSelectCctv}
                      onFlyToCamera={(c) => {
                        handleSelectCctv(c);
                        setCctvDrawerOpen(false);
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Collapsible TD Special Traffic News & Incident Alerts Drawer */}
          {incidentsDrawerOpen && (
            <div className="pointer-events-auto max-w-2xl bg-slate-950/95 backdrop-blur-xl border border-rose-500/40 rounded-2xl p-3.5 shadow-2xl space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2 text-xs font-bold text-rose-300">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>{t.incidentsModalTitle}</span>
                </div>
                <button
                  onClick={() => setIncidentsDrawerOpen(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                {incidents.map((inc) => (
                  <div
                    key={inc.id}
                    onClick={() => handleSelectIncident(inc)}
                    className="p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 hover:border-rose-500/50 cursor-pointer transition-colors flex flex-col justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[10px] font-bold uppercase ${
                            inc.severity === 'high' ? 'text-rose-400' : 'text-amber-300'
                          }`}
                        >
                          {inc.severity === 'high'
                            ? pickLocaleText(locale, '嚴重擠塞通報', '严重拥堵通报', 'HIGH ALERT')
                            : pickLocaleText(locale, '特別交通提示', '特别交通提示', 'TRAFFIC NOTICE')}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono-tabular">
                          {inc.reportedTime}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-white mt-0.5">
                        {pickLocaleText(locale, inc.titleZh, inc.titleSc, inc.titleEn)}
                      </h4>
                      <p className="text-[11px] text-slate-300 mt-1 line-clamp-2">
                        {pickLocaleText(locale, inc.detailZh, inc.detailSc, inc.detailEn)}
                      </p>
                    </div>
                    <div className="text-[11px] font-semibold text-cyan-400 flex items-center gap-1">
                      <span>{t.locateIncidentBtn}</span>
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        )}

        {/* Left Docked Intelligence Panel (Desktop) */}
        {!activeMobileMode && (
          <aside
            className={`
              absolute left-0 right-0 bottom-0 lg:top-3 lg:bottom-3 lg:left-3 lg:right-auto lg:w-[388px]
              bg-slate-950/94 backdrop-blur-xl border-t lg:border border-slate-800/90 lg:rounded-2xl
              z-20 flex flex-col shadow-2xl transition-transform duration-200
              ${mobileSheetExpanded ? 'h-[76vh] lg:h-auto' : 'h-[42vh] lg:h-auto'}
            `}
          >
            {/* Mobile Drag / Expand Handle */}
            <button
              onClick={() => setMobileSheetExpanded((v) => !v)}
              className="lg:hidden w-full py-2 flex items-center justify-center gap-1.5 border-b border-slate-800/70 text-xs font-medium text-slate-400 hover:text-white"
            >
              {mobileSheetExpanded ? (
                <>
                  <ChevronDown className="w-4 h-4" />
                  <span>{t.collapseSheet}</span>
                </>
              ) : (
                <>
                  <ChevronUp className="w-4 h-4" />
                  <span>
                    {t.expandSheet} ({filteredCarparks.length})
                  </span>
                </>
              )}
            </button>

            {/* Scrollable Unified Sidebar Content (Proactive GPS Co-Pilot + Search + KPIs + Facility List) */}
            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
              {/* Proactive 3-Step GPS Co-Pilot: (1) GPS Permission, (2) Closest EV/Parking Suggestions, (3) Shortest Route, Traffic ETA & Cost Calculator */}
              <ProactiveGpsCopilotPanel
                locale={locale}
                userGps={userGps}
                gpsPromptDismissed={gpsPromptDismissed}
                isPickingMapOrigin={isPickingMapOrigin}
                intentMode={intentMode}
                suggestions={proactiveSuggestions}
                activeRoutePlan={activeRoutePlan}
                selectedSuggestionId={selectedSuggestionId}
                plannedParkingHours={plannedParkingHours}
                plannedChargingKwh={plannedChargingKwh}
                copilotCollapsed={copilotCollapsed}
                isGpsLoading={isGpsLoading}
                gpsErrorMessage={gpsErrorMessage}
                isGpsPermissionDenied={isGpsPermissionDenied}
                onClearGpsError={() => setGpsErrorMessage(null)}
                onRequestBrowserGps={handleRequestBrowserGps}
                onSelectPresetGps={handleSelectPresetGps}
                onTogglePickMapOrigin={() => setIsPickingMapOrigin((v) => !v)}
                onDismissPrompt={() => setGpsPromptDismissed(true)}
                onChangeIntentMode={(mode) => {
                  setIntentMode(mode);
                  if (mode === 'ev_charging') {
                    setPlannedChargingKwh((prev) => (prev === 0 ? 30 : prev));
                  }
                }}
                onSelectSuggestion={handleSelectProactiveSuggestion}
                onChangeParkingHours={setPlannedParkingHours}
                onChangeChargingKwh={setPlannedChargingKwh}
                onToggleCollapse={() => setCopilotCollapsed((v) => !v)}
                onFrameRouteOnMap={handleFrameActiveRouteOnMap}
              />

              {/* Search & Filter Header (Mode A / Sim is cleanly relocated to Setup) */}
              <div className="p-3.5 border-b border-slate-800/80 space-y-2.5 shrink-0">
                {/* Live Viewport Drag Follow Status Bar + Quick Regional Teleport Trigger */}
                <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800/90 text-[11px]">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <span className="text-slate-400 truncate">
                      {activeDistrict !== 'all'
                        ? pickLocaleText(locale, '當前分區:', '当前分区:', 'District:')
                        : pickLocaleText(locale, '📍 10KM 範圍 (即時串流):', '📍 10KM 范围 (实时串流):', '📍 10KM Proximity:')}{' '}
                      <strong className="text-white">{currentViewportRegionName}</strong> (
                      {filteredCarparks.length})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => {
                        setViewportSyncEnabled((v) => !v);
                        setActiveDistrict('all');
                      }}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors ${
                        viewportSyncEnabled && activeDistrict === 'all'
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-slate-800 border-slate-700 text-slate-300'
                      }`}
                    >
                      {viewportSyncEnabled && activeDistrict === 'all'
                        ? pickLocaleText(locale, '視區自動跟隨', '视区自动跟随', 'Auto-Follow')
                        : pickLocaleText(locale, '全港列表', '全港列表', 'All HK')}
                    </button>
                    <button
                      onClick={() => setDistrictMatrixOpen((v) => !v)}
                      className="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-400 hover:text-slate-950 transition-colors"
                    >
                      {pickLocaleText(locale, '跨區瞬移', '跨区瞬移', 'Teleport')}
                    </button>
                  </div>
                </div>

                {/* Search Input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t.searchPlaceholder}
                    className="w-full pl-8 pr-8 py-2 bg-slate-900/90 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* 4-Column Tabular KPI Strip */}
                <div className="grid grid-cols-4 gap-2 pt-1">
                  <div className="p-2 rounded-lg bg-slate-900/70 border border-slate-800/70">
                    <div className="text-[10px] text-slate-400 truncate">{t.kpiSpaces}</div>
                    <div className="font-mono-tabular text-sm font-bold text-emerald-400 mt-0.5">
                      {kpiMetrics.totalAvailableSpaces}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-900/70 border border-slate-800/70">
                    <div className="text-[10px] text-slate-400 truncate">{t.kpiDc}</div>
                    <div className="font-mono-tabular text-sm font-bold text-cyan-400 mt-0.5">
                      {kpiMetrics.totalDcAvailable}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-900/70 border border-slate-800/70">
                    <div className="text-[10px] text-slate-400 truncate">{t.kpiMeters}</div>
                    <div className="font-mono-tabular text-sm font-bold text-emerald-300 mt-0.5">
                      {kpiMetrics.vacantMetersCount}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-900/70 border border-slate-800/70">
                    <div className="text-[10px] text-slate-400 truncate">{t.kpiQueue}</div>
                    <div className="font-mono-tabular text-sm font-bold text-rose-400 mt-0.5">
                      {kpiMetrics.queueAlertCount}
                    </div>
                  </div>
                </div>
              </div>

              {/* Facility List */}
              <div className="p-3 space-y-2.5">
              {quickFilter === 'meters' ? (
                <>
                  {/* Official TD HKeMeter Street Section Header + Vehicle Type Filter */}
                  <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-emerald-300">
                        {pickLocaleText(
                          locale,
                          '運輸署街道智能咪錶段 (HKeMeter)',
                          '运输署街道智能咪表段 (HKeMeter)',
                          'TD Street Smart Meter Sections'
                        )}
                      </span>
                      <span className="font-mono-tabular text-[11px] text-slate-300">
                        {pickLocaleText(locale, '空置', '空置', 'Vacant')}{' '}
                        <strong className="text-emerald-400">
                          {kpiMetrics.territoryVacantMeters.toLocaleString()}
                        </strong>{' '}
                        / {kpiMetrics.territoryTotalMeters.toLocaleString()}
                      </span>
                    </div>

                    {/* Vehicle Type Filter (All / Private Car A / Goods Vehicle G / Coach C) */}
                    <div className="flex items-center justify-between gap-1 pt-0.5">
                      {(
                        [
                          {
                            code: 'ALL',
                            label: pickLocaleText(locale, '全部車種', '全部车种', 'All Types'),
                          },
                          {
                            code: 'A',
                            label: pickLocaleText(locale, '私家車 (A)', '私家车 (A)', 'Cars (A)'),
                          },
                          {
                            code: 'G',
                            label: pickLocaleText(locale, '貨車 (G)', '货车 (G)', 'Goods (G)'),
                          },
                          {
                            code: 'C',
                            label: pickLocaleText(locale, '旅遊巴 (C)', '旅游巴 (C)', 'Coach (C)'),
                          },
                        ] as { code: 'ALL' | 'A' | 'G' | 'C'; label: string }[]
                      ).map((vt) => (
                        <button
                          key={vt.code}
                          type="button"
                          onClick={() => {
                            setMeterVehicleFilter(vt.code);
                            setMeterListLimit(80);
                          }}
                          className={`flex-1 py-1 px-1.5 rounded text-[10px] font-semibold border transition-colors whitespace-nowrap ${
                            meterVehicleFilter === vt.code
                              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                              : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {vt.label}
                        </button>
                      ))}
                    </div>
                    {/* Occupancy Rate Color Legend */}
                    <div className="flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg bg-slate-950/80 border border-slate-800/80 text-[10px] font-mono-tabular text-slate-300">
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-[#00f59b]" />
                        <span>
                          {pickLocaleText(locale, '<50% 佔用 (充裕)', '<50% 占用 (充裕)', '<50% Full')}
                        </span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-[#f59e0b]" />
                        <span>
                          {pickLocaleText(locale, '50-79% 佔用', '50-79% 占用', '50-79% Full')}
                        </span>
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-[#ef4444]" />
                        <span>
                          {pickLocaleText(locale, '≥80% 佔用 (緊張)', '≥80% 占用 (紧张)', '≥80% Full')}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-1 text-[11px] text-slate-400">
                    <span>
                      {pickLocaleText(
                        locale,
                        '每條街道段以單一圓點標示 (顏色代表佔用率)',
                        '每条街道段以单一圆点标示 (颜色代表占用率)',
                        '1 Dot per street section (Colored by Occupancy %)'
                      )}
                    </span>
                    <span className="font-mono-tabular">
                      {Math.min(meterListLimit, filteredMeterCorridors.length)} /{' '}
                      {filteredMeterCorridors.length.toLocaleString()}
                    </span>
                  </div>

                  {filteredMeterCorridors.slice(0, meterListLimit).map((corridor) => {
                    const streetName = pickLocaleText(
                      locale,
                      corridor.streetZh,
                      corridor.streetSc,
                      corridor.streetEn
                    );
                    const sectionName = pickLocaleText(
                      locale,
                      corridor.sectionZh,
                      corridor.sectionSc,
                      corridor.sectionEn
                    );
                    const distName = pickLocaleText(
                      locale,
                      corridor.districtZh,
                      corridor.districtSc,
                      corridor.districtEn
                    );
                    const subDistName = pickLocaleText(
                      locale,
                      corridor.subDistrictZh,
                      corridor.subDistrictSc,
                      corridor.subDistrictEn
                    );
                    const distKm = calculateDistanceKm(
                      referenceOriginCoords,
                      corridor.centerCoordinates
                    );
                    const isCorridorSelected =
                      selectedMeter &&
                      corridor.sampleSpots.some((s) => s.id === selectedMeter.id);
                    const occTone =
                      corridor.occupancyRatePct >= 80
                        ? 'text-rose-400'
                        : corridor.occupancyRatePct >= 50
                        ? 'text-amber-300'
                        : 'text-emerald-400';

                    return (
                      <div
                        key={corridor.corridorKey}
                        onClick={() => {
                          const targetSpot =
                            corridor.sampleSpots.find((s) => !s.occupied) ||
                            corridor.sampleSpots[0];
                          if (targetSpot) {
                            handleSelectMeter(targetSpot);
                          }
                        }}
                        className={`p-3 rounded-xl border transition-colors cursor-pointer ${
                          isCorridorSelected
                            ? 'bg-slate-900 border-cyan-400'
                            : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                              <span
                                className="h-2.5 w-2.5 rounded-full shrink-0 border border-slate-950"
                                style={{ backgroundColor: corridor.occupancyColor }}
                              />
                              <span className="truncate">{streetName}</span>
                              <span className="text-[10px] font-mono-tabular px-1.5 py-0.2 rounded bg-slate-800 text-cyan-300 shrink-0">
                                {corridor.vehicleTypeCode}類
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-300 truncate mt-0.5">
                              📍{' '}
                              {subDistName && subDistName !== distName
                                ? `${distName} · ${subDistName}`
                                : distName}
                              {sectionName ? ` · ${sectionName}` : ''}
                            </div>
                          </div>
                          <div className="text-right shrink-0 font-mono-tabular">
                            <div className={`text-sm font-bold ${occTone}`}>
                              {corridor.vacantBays} / {corridor.totalBays}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {pickLocaleText(locale, '空置/總數', '空置/总数', 'Vacant/Total')} ·{' '}
                              <span className={occTone}>{corridor.occupancyRatePct}% Full</span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-1.5 text-[10px] text-slate-400 truncate font-mono-tabular">
                          Pole #{corridor.sampleMeter.meterPoleId} · 🕒{' '}
                          {pickLocaleText(
                            locale,
                            corridor.operatingHours,
                            corridor.operatingHoursSc,
                            corridor.operatingHoursEn
                          )}
                        </div>

                        <div className="mt-1.5 pt-1.5 border-t border-slate-800/70 flex items-center justify-between text-[11px] text-slate-400 font-mono-tabular">
                          <span>
                            {distKm.toFixed(2)} km · Max {corridor.maxDurationMins}m · HK$
                            {corridor.ratePer15MinHk.toFixed(1)}/15m
                          </span>
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${corridor.centerCoordinates[1]},${corridor.centerCoordinates[0]}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-cyan-400 hover:text-cyan-300 font-sans font-semibold flex items-center gap-1"
                          >
                            <span>{t.navigateBtn}</span>
                            <Navigation className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    );
                  })}

                  {filteredMeterCorridors.length > meterListLimit && (
                    <button
                      type="button"
                      onClick={() => setMeterListLimit((prev) => prev + 120)}
                      className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-cyan-300 transition-colors"
                    >
                      {pickLocaleText(
                        locale,
                        `載入更多街道咪錶段 (尚有 ${(
                          filteredMeterCorridors.length - meterListLimit
                        ).toLocaleString()} 段)`,
                        `加载更多街道咪表段 (尚有 ${(
                          filteredMeterCorridors.length - meterListLimit
                        ).toLocaleString()} 段)`,
                        `Load More Street Sections (${(
                          filteredMeterCorridors.length - meterListLimit
                        ).toLocaleString()} more)`
                      )}
                    </button>
                  )}
                </>
              ) : filteredCarparks.length === 0 ? (
                <div className="py-12 px-4 text-center space-y-2">
                  <p className="text-sm font-semibold text-slate-300">
                    {pickLocaleText(
                      locale,
                      '沒有符合篩選條件的停車場',
                      '没有符合筛选条件的停车场',
                      'No carparks match your active filters'
                    )}
                  </p>
                  <button
                    onClick={() => {
                      setActiveDistrict('all');
                      setQuickFilter('all');
                      setEvPowerFilter('all');
                      setSearchQuery('');
                    }}
                    className="mt-2 px-3.5 py-1.5 text-xs font-semibold bg-slate-800 text-cyan-300 rounded-lg hover:bg-slate-700"
                  >
                    {pickLocaleText(locale, '重設所有篩選', '重置所有筛选', 'Reset All Filters')}
                  </button>
                </div>
              ) : (
                <>
                  {filteredCarparks
                    .slice(0, searchQuery.trim() ? 120 : carparkListLimit)
                    .map((cp) => {
                  const isSelected = cp.id === selectedCarparkId;
                  const distKm = calculateDistanceKm(referenceOriginCoords, cp.coordinates);
                  const isAbundant = cp.availableSpaces > 20;
                  const isLimited = cp.availableSpaces >= 5 && cp.availableSpaces <= 20;
                  const vacancyColor = isAbundant
                    ? 'text-emerald-400'
                    : isLimited
                    ? 'text-amber-400'
                    : 'text-rose-400';
                  const barFillColor = isAbundant
                    ? 'bg-emerald-400'
                    : isLimited
                    ? 'bg-amber-400'
                    : 'bg-rose-500';
                  const occupancyPct = Math.min(
                    100,
                    Math.max(6, Math.round((cp.availableSpaces / cp.totalSpaces) * 100))
                  );
                  const altPark = cp.alternativeParkId
                    ? carparks.find((a) => a.id === cp.alternativeParkId)
                    : undefined;

                  const cpName = pickLocaleText(locale, cp.nameZh, cp.nameSc, cp.nameEn);
                  const cpDist = pickLocaleText(locale, cp.districtZh, cp.districtSc, cp.districtEn);
                  const cpAddr = pickLocaleText(
                    locale,
                    cp.addressZh,
                    cp.addressSc || cp.addressZh,
                    cp.addressEn
                  );
                  const cpRoad = cp.adjacentRoadNameZh
                    ? pickLocaleText(
                        locale,
                        cp.adjacentRoadNameZh,
                        cp.adjacentRoadNameSc || cp.adjacentRoadNameZh,
                        cp.adjacentRoadNameEn || cp.adjacentRoadNameZh
                      )
                    : '';
                  const cpPromo = pickLocaleText(
                    locale,
                    cp.dayParkPromo,
                    cp.dayParkPromoSc,
                    cp.dayParkPromoEn
                  );

                  const linkedCam = liveCctvCameras.find((c) => c.id === cp.cctvCameraId);

                  return (
                    <div
                      key={cp.id}
                      onClick={() => handleSelectCarpark(cp)}
                      className={`p-3.5 rounded-xl border transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-slate-900/95 border-cyan-400'
                          : cp.queueRisk
                          ? 'bg-slate-900/75 border-rose-500/50 hover:border-rose-400'
                          : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      {/* Primary Title, Verified Street Address & Real-time Vacancy Count */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-xs font-semibold text-white truncate">{cpName}</h3>
                          <div className="mt-0.5 text-[11px] text-slate-300 truncate">
                            📍 {cpAddr}
                          </div>
                          {/* Clean unboxed metadata with typographic separators */}
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 font-mono-tabular">
                            <span>{cpDist}</span>
                            <span aria-hidden="true">·</span>
                            <span>{distKm.toFixed(1)} km</span>
                            <span aria-hidden="true">·</span>
                            <span>HK${cp.hourlyFeeHk}/hr</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {t.heightLimit} {cp.heightLimitM}m
                            </span>
                            {cp.cctvCameraId && (
                              <>
                                <span aria-hidden="true">·</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectCarpark(cp);
                                  }}
                                  className="text-cyan-300 hover:text-cyan-200 font-semibold underline decoration-cyan-500/50 underline-offset-2"
                                >
                                  📹 {cp.cctvCameraId}
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className={`font-mono-tabular text-base font-bold ${vacancyColor}`}>
                            {cp.availableSpaces === 0
                              ? t.fullLabel
                              : `${cp.availableSpaces} ${t.spacesUnit}`}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono-tabular">
                            {t.totalPrefix} {cp.totalSpaces}
                          </div>
                        </div>
                      </div>

                      {/* Subtle Vacancy Meter Bar */}
                      <div className="mt-2.5 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${barFillColor} transition-all duration-300`}
                          style={{ width: `${occupancyPct}%` }}
                        />
                      </div>

                      {/* EV Fast-Charge Telemetry & Operator / Tariff */}
                      <div className="mt-2.5 space-y-1 text-[11px] text-slate-300 font-mono-tabular">
                        {cp.evInfo.hasEv ? (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 truncate">
                                <Zap
                                  className={`w-3.5 h-3.5 shrink-0 ${
                                    evPowerFilter === 'ac_medium' ? 'text-purple-400' : 'text-cyan-400'
                                  }`}
                                />
                                <span
                                  className={
                                    evPowerFilter === 'dc_super'
                                      ? 'px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/50 text-cyan-200 font-bold'
                                      : 'text-cyan-300 font-semibold'
                                  }
                                >
                                  DC {cp.evInfo.dcAvailable}/{cp.evInfo.dcFastCount} (
                                  {cp.evInfo.dcMaxKw}kW)
                                </span>
                                <span aria-hidden="true" className="text-slate-600">
                                  ·
                                </span>
                                <span
                                  className={
                                    evPowerFilter === 'ac_medium'
                                      ? 'px-1.5 py-0.5 rounded bg-purple-500/20 border border-purple-400/50 text-purple-200 font-bold'
                                      : 'text-purple-300 font-medium'
                                }
                                >
                                  AC {cp.evInfo.acAvailable}/{cp.evInfo.acCount} ({cp.evInfo.acMaxKw}
                                  kW)
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
                              <span className="truncate">
                                🔌 {cp.evInfo.operator} · {cp.evInfo.connectorType}
                              </span>
                              <span className="shrink-0 text-cyan-300/90">{cp.evInfo.tariffHk}</span>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center justify-between text-[10px] text-slate-400 font-sans">
                            <span>
                              🅿️{' '}
                              {pickLocaleText(
                                locale,
                                '標準時租車位 (未設電動車充電樁)',
                                '标准时租车位 (未设电动车充电桩)',
                                'Standard Hourly Car Park (No EV Chargers)'
                              )}
                            </span>
                            {cpRoad && (
                              <span className="font-mono-tabular truncate max-w-[140px]">
                                {cpRoad} · {cp.adjacentRoadSpeedKmh} km/h
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Inline Live TD Entrance CCTV Snapshot inside the Selected Carpark Card */}
                      {isSelected && linkedCam && (
                        <div className="mt-3">
                          <TdCctvSnapshotView
                            camera={linkedCam}
                            allCameras={liveCctvCameras}
                            locale={locale}
                            compact={true}
                            onSelectCamera={handleSelectCctv}
                            onFlyToCamera={handleSelectCctv}
                          />
                        </div>
                      )}

                      {/* Entrance Queue Jam Warning Algorithm Box */}
                      {cp.queueRisk && (
                        <div className="mt-2.5 p-2 rounded-lg bg-rose-950/50 border border-rose-500/40 flex flex-col gap-1.5">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-rose-300">
                            <span className="flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                              <span>{t.queueAlertBanner}</span>
                            </span>
                            <span className="font-mono-tabular shrink-0">
                              {t.waitTimePrefix} {cp.estimatedWaitMins}
                              {t.minsUnit}
                            </span>
                          </div>
                          {altPark && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectCarpark(altPark);
                              }}
                              className="text-left text-[11px] text-cyan-300 hover:text-cyan-200 font-medium flex items-center justify-between bg-slate-950/60 px-2 py-1 rounded border border-cyan-500/30"
                            >
                              <span>
                                {t.suggestAltPrefix}
                                {
                                  pickLocaleText(
                                    locale,
                                    altPark.nameZh,
                                    altPark.nameSc,
                                    altPark.nameEn
                                  ).split(' ')[0]
                                }{' '}
                                ({altPark.availableSpaces} {t.spacesUnit})
                              </span>
                              <ArrowRight className="w-3 h-3 shrink-0" />
                            </button>
                          )}
                        </div>
                      )}

                      {/* Bottom Action Row: Promo & Direct Google Maps Deep-Link Navigation */}
                      <div className="mt-2.5 pt-2 border-t border-slate-800/70 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-400 truncate">{cpPromo}</span>
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${cp.coordinates[1]},${cp.coordinates[0]}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-400 text-cyan-300 hover:text-slate-950 border border-cyan-500/35 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 flex items-center gap-1"
                        >
                          <Navigation className="w-3 h-3" />
                          <span>{t.navigateBtn}</span>
                        </a>
                      </div>
                    </div>
                  );
                })}

                  {/* Load More Button for 588 Carpark Catalog */}
                  {filteredCarparks.length > carparkListLimit && !searchQuery.trim() && (
                    <button
                      onClick={() => setCarparkListLimit((prev) => prev + 60)}
                      className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-cyan-300 transition-colors"
                    >
                      {pickLocaleText(
                        locale,
                        `載入更多停車場 (尚有 ${(
                          filteredCarparks.length - carparkListLimit
                        ).toLocaleString()} 間)`,
                        `加载更多停车场 (尚有 ${(
                          filteredCarparks.length - carparkListLimit
                        ).toLocaleString()} 间)`,
                        `Load More Carparks (${(
                          filteredCarparks.length - carparkListLimit
                        ).toLocaleString()} more)`
                      )}
                    </button>
                  )}

                  {/* Optional Full-Territory Catalog Trigger */}
                  {carparks.length < 500 && (
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch('/api/carparks');
                          if (res.ok) {
                            const json = await res.json();
                            if (Array.isArray(json.data) && json.data.length > 0) {
                              setCarparks(json.data);
                            }
                          }
                        } catch {}
                      }}
                      className="w-full mt-2 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-[11px] font-semibold text-cyan-300 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>{pickLocaleText(locale, '載入全港所有停車場 (588+ 間)', '加载全港所有停车场 (588+ 间)', 'Load Full HK Territory (588+ Carparks)')}</span>
                    </button>
                  )}
                </>
              )}
              </div>
            </div>
          </aside>
        )}

        {/* Floating 2KM Recenter Action Button (Mobile Mode Only) */}
        {activeMobileMode && (
          <button
            onClick={() => {
              const coords = userGps ? userGps.coordinates : referenceOriginCoords;
              setCameraTarget({
                center: coords,
                zoom: 16.0,
                pitch: 0,
                bearing: 0,
                timestamp: Date.now(),
              });
            }}
            title={pickLocaleText(locale, '返回 2KM 中心', '返回 2KM 中心', 'Recenter 2KM')}
            style={{
              bottom: mobileSheetExpanded
                ? 'calc(75dvh + 14px)'
                : 'calc(104px + env(safe-area-inset-bottom, 0px))',
            }}
            className="absolute right-3.5 z-20 w-11 h-11 rounded-full bg-slate-900/95 backdrop-blur-md border border-cyan-400/80 shadow-2xl flex items-center justify-center text-cyan-300 hover:text-white hover:bg-cyan-500/25 active:scale-95 transition-all cursor-pointer"
          >
            <Crosshair className="w-5 h-5 text-cyan-400" />
          </button>
        )}

        {/* Floating Google Maps Turn-by-Turn Navigation Action Icon (Mobile Mode Only when a route is shown on the map) */}
        {activeMobileMode && activeGoogleMapsNavUrl && (
          <a
            href={activeGoogleMapsNavUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={`${t.navigateBtn} (Google Maps)`}
            aria-label={`${t.navigateBtn} (Google Maps)`}
            style={{
              bottom: mobileSheetExpanded
                ? 'calc(75dvh + 118px)'
                : 'calc(208px + env(safe-area-inset-bottom, 0px))',
            }}
            className="absolute right-3.5 z-20 w-11 h-11 rounded-full bg-cyan-400 hover:bg-cyan-300 border-2 border-white shadow-[0_0_20px_rgba(34,211,238,0.65)] flex items-center justify-center text-slate-950 active:scale-95 transition-all cursor-pointer"
          >
            <Navigation className="w-5 h-5 fill-slate-950" />
          </a>
        )}

        {/* Floating Mobile Quick Map Color Theme Toggle Button (Light / Dark) */}
        {activeMobileMode && (
          <button
            onClick={() => handleSelectMapTheme(mapTheme === 'light' ? 'dark' : 'light')}
            title={pickLocaleText(
              locale,
              mapTheme === 'light' ? '切換至夜間數碼孿生深色地圖' : '切換至日間常規淺色地圖',
              mapTheme === 'light' ? '切换至夜间数码孪生深色地图' : '切换至日间常规浅色地图',
              mapTheme === 'light' ? 'Switch to Dark Map' : 'Switch to Conventional Light Map'
            )}
            style={{
              bottom: mobileSheetExpanded
                ? 'calc(75dvh + 66px)'
                : 'calc(156px + env(safe-area-inset-bottom, 0px))',
            }}
            className={`absolute right-3.5 z-20 w-11 h-11 rounded-full backdrop-blur-md border shadow-2xl flex items-center justify-center active:scale-95 transition-all cursor-pointer ${
              mapTheme === 'light'
                ? 'bg-amber-950/90 border-amber-400/80 text-amber-300 hover:bg-amber-900/90'
                : 'bg-slate-900/95 border-cyan-400/80 text-cyan-300 hover:bg-cyan-500/25'
            }`}
          >
            {mapTheme === 'light' ? (
              <Sun className="w-5 h-5 text-amber-400" />
            ) : (
              <Moon className="w-5 h-5 text-cyan-400" />
            )}
          </button>
        )}

        {/* Dedicated Mobile 2KM Bottom Sheet (Mobile Mode Only) */}
        {activeMobileMode && (
          <div
            style={{
              height: mobileSheetExpanded
                ? '75dvh'
                : 'calc(98px + env(safe-area-inset-bottom, 0px))',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
            className="absolute left-0 right-0 bottom-0 bg-slate-950/98 backdrop-blur-xl border-t border-slate-800/90 z-30 transition-all duration-300 flex flex-col shadow-2xl"
          >
            {/* Row 1: Drag Handle & Quick Summary Bar */}
            <div
              onClick={() => setMobileSheetExpanded((v) => !v)}
              className="w-full h-[36px] px-3.5 flex items-center justify-between cursor-pointer select-none shrink-0 relative border-b border-slate-800/60"
            >
              <span className="w-9 h-1 rounded-full bg-slate-700 absolute top-1.5 left-1/2 -translate-x-1/2" />
              <div className="flex items-center gap-2 min-w-0 pr-2 pt-1">
                <div className="text-xs font-bold text-white truncate">
                  {selectedCarpark ? (
                    <span className="text-cyan-300 flex items-center gap-1.5 truncate">
                      <span className="truncate">
                        🅿️ {pickLocaleText(locale, selectedCarpark.nameZh, selectedCarpark.nameSc, selectedCarpark.nameEn)}
                      </span>
                      <span className="text-emerald-400 font-mono-tabular shrink-0">
                        ({selectedCarpark.availableSpaces} {t.spacesUnit})
                      </span>
                    </span>
                  ) : selectedMeter ? (
                    <span className="text-emerald-300 flex items-center gap-1.5 truncate">
                      <span className="truncate">
                        🟢 {pickLocaleText(locale, selectedMeter.streetZh, selectedMeter.streetSc, selectedMeter.streetEn)}
                      </span>
                      <span className="text-cyan-300 font-mono-tabular shrink-0">
                        (#{selectedMeter.meterPoleId})
                      </span>
                    </span>
                  ) : (
                    <span className="truncate text-slate-300">
                      📍 {pickLocaleText(locale, '2KM 範圍實時', '2KM 范围实时', '2KM Live')}:{' '}
                      <strong className="text-emerald-400 font-mono-tabular">{filteredCarparks.length}</strong>{' '}
                      {pickLocaleText(locale, '車場', '车场', 'Carparks')} ·{' '}
                      <strong className="text-cyan-400 font-mono-tabular">{filteredMeterCorridors.length}</strong>{' '}
                      {pickLocaleText(locale, '咪錶', '咪表', 'Meters')}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold shrink-0 pt-1">
                {activeGoogleMapsNavUrl && (
                  <a
                    href={activeGoogleMapsNavUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title={`${t.navigateBtn} (Google Maps)`}
                    aria-label={`${t.navigateBtn} (Google Maps)`}
                    className="p-1.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 flex items-center justify-center shadow-sm active:scale-95 transition-all"
                  >
                    <Navigation className="w-3.5 h-3.5 fill-slate-950" />
                  </a>
                )}
                {(selectedCarpark || selectedMeter) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectCarpark(null as any);
                      setSelectedMeterId(null);
                    }}
                    className="p-1 rounded text-slate-400 hover:text-white"
                  >
                    ✕
                  </button>
                )}
                <span className="text-[11px] text-cyan-400 font-bold">
                  {mobileSheetExpanded
                    ? pickLocaleText(locale, '收起', '收起', 'Hide')
                    : pickLocaleText(locale, '展開詳細', '展开详细', 'Expand')}
                </span>
                {mobileSheetExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-cyan-400" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5 text-cyan-400" />
                )}
              </div>
            </div>

            {/* Row 2: Persistent 4 Navigation Tabs (AUTO best, EV Dock, Carpark, Meter) */}
            <div className="px-2 py-1.5 bg-slate-900/95 border-b border-slate-800/80 shrink-0">
              <div className="grid grid-cols-4 gap-1">
                {/* 1. AUTO best */}
                <button
                  type="button"
                  onClick={() => {
                    setMobileTab('auto_best');
                    setIntentMode('smart_auto');
                    setMobileSheetExpanded(true);
                  }}
                  className={`py-1.5 px-1 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
                    mobileTab === 'auto_best'
                      ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 shadow-md font-extrabold ring-1 ring-cyan-300'
                      : 'text-slate-300 hover:text-white bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800'
                  }`}
                  title={pickLocaleText(locale, 'AUTO 智能首選', 'AUTO 智能首选', 'AUTO Best')}
                >
                  <span className="text-xs shrink-0">🌟</span>
                  <span className="truncate">{pickLocaleText(locale, 'AUTO 首選', 'AUTO 首选', 'AUTO Best')}</span>
                </button>

                {/* 2. EV Dock */}
                <button
                  type="button"
                  onClick={() => {
                    setMobileTab('ev_dock');
                    setIntentMode('ev_charging');
                    if (plannedChargingKwh === 0) setPlannedChargingKwh(30);
                    setMobileSheetExpanded(true);
                  }}
                  className={`py-1.5 px-1 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
                    mobileTab === 'ev_dock'
                      ? 'bg-gradient-to-r from-purple-400 to-indigo-500 text-white shadow-md font-extrabold ring-1 ring-purple-300'
                      : 'text-slate-300 hover:text-white bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800'
                  }`}
                  title={pickLocaleText(locale, 'EV 充電站', 'EV 充电站', 'EV Dock')}
                >
                  <span className="text-xs shrink-0">⚡</span>
                  <span className="truncate">{pickLocaleText(locale, 'EV 充電', 'EV 充电', 'EV Dock')}</span>
                </button>

                {/* 3. Carpark */}
                <button
                  type="button"
                  onClick={() => {
                    setMobileTab('carparks');
                    setIntentMode('parking_only');
                    setMobileSheetExpanded(true);
                  }}
                  className={`py-1.5 px-1 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
                    mobileTab === 'carparks'
                      ? 'bg-cyan-400 text-slate-950 shadow-md font-extrabold ring-1 ring-cyan-300'
                      : 'text-slate-300 hover:text-white bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800'
                  }`}
                  title={pickLocaleText(locale, '停車場列表', '停车场列表', 'Carpark List')}
                >
                  <span className="text-xs shrink-0">🅿️</span>
                  <span className="truncate">{pickLocaleText(locale, '停車場', '停车场', 'Carpark')}</span>
                </button>

                {/* 4. Meter */}
                <button
                  type="button"
                  onClick={() => {
                    setMobileTab('meters');
                    setIntentMode('curbside_meter');
                    setMobileSheetExpanded(true);
                  }}
                  className={`py-1.5 px-1 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
                    mobileTab === 'meters'
                      ? 'bg-emerald-400 text-slate-950 shadow-md font-extrabold ring-1 ring-emerald-300'
                      : 'text-slate-300 hover:text-white bg-slate-950/80 hover:bg-slate-800/80 border border-slate-800'
                  }`}
                  title={pickLocaleText(locale, '路邊咪錶列表', '路边咪表列表', 'Meter List')}
                >
                  <span className="text-xs shrink-0">🪙</span>
                  <span className="truncate">{pickLocaleText(locale, '咪錶', '咪表', 'Meter')}</span>
                </button>
              </div>
            </div>

            {/* Expanded Content: AUTO best / EV Dock Co-Pilot, Carparks, or Meters */}
            {mobileSheetExpanded && (
              <div className="flex-1 overflow-y-auto custom-scrollbar p-3 pb-8 space-y-3">
                {/* 1. AUTO Best Mode: Clean Mobile Card List (like Carpark & Meter) */}
                {mobileTab === 'auto_best' && (
                  <div className="space-y-2.5">
                    {/* Search Input */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={pickLocaleText(
                          locale,
                          '搜尋 2KM 智能首選車位、街道或商場...',
                          '搜寻 2KM 智能首选车位、街道或商场...',
                          'Search 2KM best parking, streets or malls...'
                        )}
                        className="w-full pl-8 pr-8 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Top Smart Recommendations + Best Closest Carparks */}
                    <div className="space-y-1.5 pt-0.5">
                      {proactiveSuggestions.map((sug, index) => {
                        const isSelected = selectedSuggestionId === sug.id;
                        const targetName = sug.carpark
                          ? pickLocaleText(locale, sug.carpark.nameZh, sug.carpark.nameSc, sug.carpark.nameEn)
                          : sug.meter
                          ? `${pickLocaleText(locale, sug.meter.streetZh, sug.meter.streetSc, sug.meter.streetEn)} (#${sug.meter.meterPoleId})`
                          : '';
                        const targetAddress = sug.carpark
                          ? pickLocaleText(locale, sug.carpark.addressZh, sug.carpark.addressSc || sug.carpark.addressZh, sug.carpark.addressEn)
                          : sug.meter
                          ? [
                              pickLocaleText(locale, sug.meter.districtZh, sug.meter.districtSc, sug.meter.districtEn),
                              sug.meter.sectionOfStreetZh ? pickLocaleText(locale, sug.meter.sectionOfStreetZh, sug.meter.sectionOfStreetSc || sug.meter.sectionOfStreetZh, sug.meter.sectionOfStreetEn || sug.meter.sectionOfStreetZh) : ''
                            ].filter(Boolean).join(' · ')
                          : '';
                        const spaces = sug.carpark ? sug.carpark.availableSpaces : (!sug.meter?.occupied ? 1 : 0);
                        const isAbundant = spaces > 20;
                        const isLimited = spaces >= 5 && spaces <= 20;
                        const vacColor = isAbundant ? 'text-emerald-400' : isLimited ? 'text-amber-400' : 'text-rose-400';

                        return (
                          <div
                            key={sug.id}
                            onClick={() => {
                              handleSelectProactiveSuggestion(sug);
                              setMobileSheetExpanded(false);
                            }}
                            className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-cyan-950/40 border-cyan-400'
                                : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold text-[10px] shrink-0 border border-cyan-500/30">
                                    #{index + 1} {pickLocaleText(locale, sug.badgeZh, sug.badgeSc, sug.badgeEn)}
                                  </span>
                                  <span className="text-xs font-bold text-white truncate">
                                    {targetName}
                                  </span>
                                </div>
                                {targetAddress && (
                                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                    📍 {targetAddress}
                                  </div>
                                )}
                                <div className="mt-1 flex items-center gap-2 text-[10px] font-mono-tabular text-slate-400">
                                  <span className="text-slate-300 font-semibold">{sug.routeDistanceKm.toFixed(1)} km</span>
                                  <span>·</span>
                                  <span className="text-emerald-400 font-bold">~{sug.totalEtaMins} {pickLocaleText(locale, '分鐘', '分钟', 'm')}</span>
                                  <span>·</span>
                                  <span>~HK${sug.estimatedBaseCostHk}</span>
                                  {sug.reasonZh && (
                                    <>
                                      <span>·</span>
                                      <span className="text-cyan-300 truncate max-w-[120px]">
                                        {pickLocaleText(locale, sug.reasonZh, sug.reasonSc, sug.reasonEn)}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="text-right shrink-0 font-mono-tabular">
                                <div className={`text-sm font-bold ${vacColor}`}>
                                  {sug.carpark ? `${sug.carpark.availableSpaces} ${t.spacesUnit}` : `${spaces} 空位`}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  {sug.carpark ? `/ ${sug.carpark.totalSpaces}` : '咪錶'}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {filteredCarparks
                        .filter((cp) => !proactiveSuggestions.some((s) => s.carpark?.id === cp.id))
                        .slice(0, 20)
                        .map((cp) => {
                          const distKm = calculateDistanceKm(referenceOriginCoords, cp.coordinates);
                          const isSel = cp.id === selectedCarparkId;
                          const isAbundant = cp.availableSpaces > 20;
                          const isLimited = cp.availableSpaces >= 5 && cp.availableSpaces <= 20;
                          const vacColor = isAbundant
                            ? 'text-emerald-400'
                            : isLimited
                            ? 'text-amber-400'
                            : 'text-rose-400';

                          return (
                            <div
                              key={cp.id}
                              onClick={() => {
                                handleSelectCarpark(cp);
                                setCameraTarget({
                                  center: cp.coordinates,
                                  zoom: 16.0,
                                  pitch: 0,
                                  bearing: 0,
                                  timestamp: Date.now(),
                                });
                                setMobileSheetExpanded(false);
                              }}
                              className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
                                isSel
                                  ? 'bg-cyan-950/40 border-cyan-400'
                                  : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-white truncate">
                                    {pickLocaleText(locale, cp.nameZh, cp.nameSc, cp.nameEn)}
                                  </div>
                                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                    📍 {pickLocaleText(locale, cp.addressZh, cp.addressSc || cp.addressZh, cp.addressEn)}
                                  </div>
                                  <div className="mt-1 flex items-center gap-2 text-[10px] font-mono-tabular text-slate-400">
                                    <span className="text-slate-300 font-semibold">{distKm.toFixed(1)} km</span>
                                    <span>·</span>
                                    <span>HK${cp.hourlyFeeHk}/hr</span>
                                    {cp.evInfo.hasEv && (
                                      <>
                                        <span>·</span>
                                        <span className="text-cyan-300">
                                          {cp.evInfo.dcFastCount > 0 ? `⚡DC ${cp.evInfo.dcAvailable}/${cp.evInfo.dcFastCount}` : `🔌AC ${cp.evInfo.acAvailable}/${cp.evInfo.acCount}`}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right shrink-0 font-mono-tabular">
                                  <div className={`text-sm font-bold ${vacColor}`}>
                                    {cp.availableSpaces} {t.spacesUnit}
                                  </div>
                                  <div className="text-[10px] text-slate-500">/ {cp.totalSpaces}</div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* 2. EV Dock Mode: Clean Mobile Card List (like Carpark & Meter) */}
                {mobileTab === 'ev_dock' && (
                  <div className="space-y-2.5">
                    {/* Search Input */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={pickLocaleText(
                          locale,
                          '搜尋 2KM 充電站、商場或營運商 (Tesla, CLP)...',
                          '搜寻 2KM 充电站、商场或运营商 (Tesla, CLP)...',
                          'Search 2KM EV docks, malls or operators...'
                        )}
                        className="w-full pl-8 pr-8 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* 2KM Sorted EV Docks List */}
                    <div className="space-y-1.5 pt-0.5">
                      {filteredCarparks
                        .filter((cp) => cp.evInfo && cp.evInfo.hasEv)
                        .slice(0, 40)
                        .map((cp, idx) => {
                          const distKm = calculateDistanceKm(referenceOriginCoords, cp.coordinates);
                          const isSel = cp.id === selectedCarparkId;
                          const dcAvail = cp.evInfo.dcAvailable;
                          const dcTotal = cp.evInfo.dcFastCount;
                          const acAvail = cp.evInfo.acAvailable;
                          const acTotal = cp.evInfo.acCount;

                          return (
                            <div
                              key={cp.id}
                              onClick={() => {
                                handleSelectCarpark(cp);
                                setCameraTarget({
                                  center: cp.coordinates,
                                  zoom: 16.0,
                                  pitch: 0,
                                  bearing: 0,
                                  timestamp: Date.now(),
                                });
                                setMobileSheetExpanded(false);
                              }}
                              className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
                                isSel
                                  ? 'bg-purple-950/40 border-purple-400'
                                  : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {idx < 3 && (
                                      <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold text-[10px] shrink-0 border border-purple-500/30">
                                        #{idx + 1} {dcTotal > 0 ? '⚡首選超充' : '🔌中充站'}
                                      </span>
                                    )}
                                    <span className="text-xs font-bold text-white truncate">
                                      {pickLocaleText(locale, cp.nameZh, cp.nameSc, cp.nameEn)}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                    📍 {pickLocaleText(locale, cp.addressZh, cp.addressSc || cp.addressZh, cp.addressEn)}
                                  </div>
                                  <div className="mt-1 flex items-center gap-2 text-[10px] font-mono-tabular text-slate-400">
                                    <span className="text-slate-300 font-semibold">{distKm.toFixed(1)} km</span>
                                    <span>·</span>
                                    <span>HK${cp.hourlyFeeHk}/hr</span>
                                    <span>·</span>
                                    <span className="text-purple-300 truncate max-w-[120px]">
                                      {cp.evInfo.operator}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-right shrink-0 font-mono-tabular">
                                  {dcTotal > 0 ? (
                                    <div className={`text-sm font-bold ${dcAvail > 0 ? 'text-cyan-400' : 'text-rose-400'}`}>
                                      ⚡ {dcAvail}/{dcTotal} 槍
                                    </div>
                                  ) : (
                                    <div className={`text-sm font-bold ${acAvail > 0 ? 'text-purple-400' : 'text-rose-400'}`}>
                                      🔌 {acAvail}/{acTotal} 位
                                    </div>
                                  )}
                                  <div className="text-[10px] text-slate-400">
                                    {dcTotal > 0 ? `${cp.evInfo.dcMaxKw}kW 超充` : `${cp.evInfo.acMaxKw}kW 中充`}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* 2. Carpark Mode: Search Input + 2KM Sorted Carparks */}
                {mobileTab === 'carparks' && (
                  <div className="space-y-2.5">
                    {/* Search Input */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={pickLocaleText(
                          locale,
                          '搜尋 2KM 內車位、街道或商場...',
                          '搜寻 2KM 内车位、街道或商场...',
                          'Search 2KM carparks, streets or malls...'
                        )}
                        className="w-full pl-8 pr-8 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* 2KM Sorted Carparks List */}
                    <div className="space-y-1.5 pt-0.5">
                    {filteredCarparks.slice(0, 40).map((cp) => {
                      const distKm = calculateDistanceKm(referenceOriginCoords, cp.coordinates);
                      const isSel = cp.id === selectedCarparkId;
                      const isAbundant = cp.availableSpaces > 20;
                      const isLimited = cp.availableSpaces >= 5 && cp.availableSpaces <= 20;
                      const vacColor = isAbundant
                        ? 'text-emerald-400'
                        : isLimited
                        ? 'text-amber-400'
                        : 'text-rose-400';

                      return (
                        <div
                          key={cp.id}
                          onClick={() => {
                            handleSelectCarpark(cp);
                            setCameraTarget({
                              center: cp.coordinates,
                              zoom: 16.0,
                              pitch: 0,
                              bearing: 0,
                              timestamp: Date.now(),
                            });
                            setMobileSheetExpanded(false);
                          }}
                          className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
                            isSel
                              ? 'bg-cyan-950/40 border-cyan-400'
                              : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white truncate">
                                {pickLocaleText(locale, cp.nameZh, cp.nameSc, cp.nameEn)}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                📍{' '}
                                {pickLocaleText(
                                  locale,
                                  cp.addressZh,
                                  cp.addressSc || cp.addressZh,
                                  cp.addressEn
                                )}
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-[10px] font-mono-tabular text-slate-400">
                                <span className="text-slate-300 font-semibold">{distKm.toFixed(1)} km</span>
                                <span>·</span>
                                <span>HK${cp.hourlyFeeHk}/hr</span>
                                {cp.evInfo.hasEv && (
                                  <>
                                    <span>·</span>
                                    <span className="text-cyan-300">
                                      {cp.evInfo.dcFastCount > 0
                                        ? `⚡DC ${cp.evInfo.dcAvailable}/${cp.evInfo.dcFastCount}`
                                        : `🔌AC ${cp.evInfo.acAvailable}/${cp.evInfo.acCount}`}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0 font-mono-tabular">
                              <div className={`text-sm font-bold ${vacColor}`}>
                                {cp.availableSpaces} {t.spacesUnit}
                              </div>
                              <div className="text-[10px] text-slate-500">/ {cp.totalSpaces}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                )}

                {/* 3. Meter Mode: Search Input + 2KM Sorted Smart Meter Corridors */}
                {mobileTab === 'meters' && (
                  <div className="space-y-2.5">
                    {/* Search Input */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={pickLocaleText(
                          locale,
                          '搜尋 2KM 內街道或咪錶編號...',
                          '搜寻 2KM 内街道或咪表编号...',
                          'Search 2KM streets or meter IDs...'
                        )}
                        className="w-full pl-8 pr-8 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="space-y-1.5 pt-0.5">
                    {filteredMeterCorridors.slice(0, 40).map((corr) => {
                      const distKm = calculateDistanceKm(referenceOriginCoords, corr.centerCoordinates);
                      const isSel = selectedMeter && corr.bays.some((s: SmartMeterSpot) => s.id === selectedMeter.id);
                      const hasVacant = corr.vacantBays > 0;

                      return (
                        <div
                          key={corr.corridorKey}
                          onClick={() => {
                            const spot = corr.sampleMeter || corr.bays[0];
                            if (spot) {
                              setSelectedCarparkId(null);
                              setSelectedMeterId(spot.id);
                              setShowMetersLayer(true);
                              setCameraTarget({
                                center: corr.centerCoordinates,
                                zoom: 16.2,
                                pitch: 0,
                                bearing: 0,
                                timestamp: Date.now(),
                              });
                              setMobileSheetExpanded(false);
                            }
                          }}
                          className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
                            isSel
                              ? 'bg-emerald-950/40 border-emerald-400'
                              : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-white truncate">
                                {pickLocaleText(locale, corr.streetZh, corr.streetSc, corr.streetEn)}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate mt-0.5">
                                📍{' '}
                                {pickLocaleText(
                                  locale,
                                  corr.districtZh,
                                  corr.districtSc,
                                  corr.districtEn
                                )}
                                {corr.sectionOfStreetZh && (
                                  <span> · {pickLocaleText(locale, corr.sectionOfStreetZh, corr.sectionOfStreetSc || corr.sectionOfStreetZh, corr.sectionOfStreetEn || corr.sectionOfStreetZh)}</span>
                                )}
                              </div>
                              <div className="mt-1 flex items-center gap-2 text-[10px] font-mono-tabular text-slate-400">
                                <span className="text-slate-300 font-semibold">{distKm.toFixed(1)} km</span>
                                <span>·</span>
                                <span>HK${corr.ratePer15MinHk}/15m</span>
                                <span>·</span>
                                <span className="truncate">{corr.operatingHours}</span>
                              </div>
                            </div>
                            <div className="text-right shrink-0 font-mono-tabular">
                              <div
                                className={`text-sm font-bold ${
                                  hasVacant ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {corr.vacantBays} {pickLocaleText(locale, '空錶', '空表', 'Vacant')}
                              </div>
                              <div className="text-[10px] text-slate-500">/ {corr.totalBays}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                )}

                {/* Bottom Quick Utilities: Prominently Display About and Setup */}
                <div className="pt-2 pb-6 mb-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAboutPageOpen(true);
                        setSetupModalOpen(false);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-200 hover:text-white flex items-center gap-1.5 font-bold transition-colors cursor-pointer"
                    >
                      <Info className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{pickLocaleText(locale, '關於本站 (About)', '关于本站 (About)', 'About')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSetupModalOpen(true);
                        setAboutPageOpen(false);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-200 hover:text-white flex items-center gap-1.5 font-bold transition-colors cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{pickLocaleText(locale, '設定 (Setup)', '设置 (Setup)', 'Setup')}</span>
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono-tabular">
                    ParkPulse HK v2.4
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Right-Side Selected Facility / Smart Meter / TD Live CCTV Inspector HUD Card (Desktop Only) */}
        {!activeMobileMode && (selectedCarpark || selectedMeter || selectedCctv) && (
          <div className="hidden md:block absolute bottom-4 right-14 w-[400px] bg-slate-950/94 backdrop-blur-xl border border-slate-800/90 rounded-2xl p-4 z-20 shadow-2xl max-h-[82vh] overflow-y-auto custom-scrollbar">
            {selectedCarpark ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] text-cyan-400 font-medium">
                      {pickLocaleText(
                        locale,
                        selectedCarpark.districtZh,
                        selectedCarpark.districtSc,
                        selectedCarpark.districtEn
                      )}{' '}
                      ·{' '}
                      {pickLocaleText(
                        locale,
                        selectedCarpark.addressZh,
                        selectedCarpark.addressSc,
                        selectedCarpark.addressEn
                      )}
                    </div>
                    <h2 className="text-sm font-bold text-white mt-0.5">
                      {pickLocaleText(
                        locale,
                        selectedCarpark.nameZh,
                        selectedCarpark.nameSc,
                        selectedCarpark.nameEn
                      )}
                    </h2>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedCarparkId(null);
                      setSelectedCctvId(null);
                    }}
                    className="p-1 text-slate-400 hover:text-white rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Live TD Entrance CCTV Snapshot Viewer */}
                {selectedCctv && (
                  <TdCctvSnapshotView
                    camera={selectedCctv}
                    allCameras={liveCctvCameras}
                    locale={locale}
                    compact={true}
                    onSelectCamera={handleSelectCctv}
                    onFlyToCamera={handleSelectCctv}
                  />
                )}

                {/* Key Telemetry Grid */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                    <div className="text-[10px] text-slate-400">{t.kpiSpaces}</div>
                    <div
                      className={`font-mono-tabular text-base font-bold mt-0.5 ${
                        selectedCarpark.availableSpaces > 20
                          ? 'text-emerald-400'
                          : selectedCarpark.availableSpaces >= 5
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {selectedCarpark.availableSpaces}{' '}
                      <span className="text-[11px] font-normal text-slate-500">
                        / {selectedCarpark.totalSpaces}
                      </span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                    <div className="text-[10px] text-slate-400">{t.filterEvDc}</div>
                    <div className="font-mono-tabular text-base font-bold text-cyan-400 mt-0.5">
                      {selectedCarpark.evInfo.dcAvailable}
                      <span className="text-[11px] font-normal text-slate-400">
                        /{selectedCarpark.evInfo.dcFastCount} ({selectedCarpark.evInfo.dcMaxKw}kW)
                      </span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                    <div className="text-[10px] text-slate-400">
                      {pickLocaleText(locale, '標準時租', '标准时租', 'Hourly Fee')}
                    </div>
                    <div className="font-mono-tabular text-base font-bold text-white mt-0.5">
                      HK${selectedCarpark.hourlyFeeHk}
                    </div>
                  </div>
                </div>

                {/* Entrance Queue Cross-Analysis Diagnostic */}
                <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800/80 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 truncate">
                      {pickLocaleText(
                        locale,
                        selectedCarpark.adjacentRoadNameZh || selectedCarpark.addressZh,
                        selectedCarpark.adjacentRoadNameSc || selectedCarpark.addressSc,
                        selectedCarpark.adjacentRoadNameEn || selectedCarpark.addressEn
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 truncate">
                      {selectedCarpark.evInfo.operator}
                    </span>
                    <span className="font-mono-tabular text-cyan-300 shrink-0">
                      {selectedCarpark.evInfo.tariffHk}
                    </span>
                  </div>
                  {selectedCarpark.queueRisk ? (
                    <div className="pt-1 text-[11px] font-semibold text-rose-400">
                      {t.queueAlertBanner} ({t.waitTimePrefix} {selectedCarpark.estimatedWaitMins}
                      {t.minsUnit})
                    </div>
                  ) : (
                    <div className="pt-1 text-[11px] text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        {pickLocaleText(
                          locale,
                          '進場暢順：入口幹道無排隊死鎖風險',
                          '进场畅顺：入口干道无排队死锁风险',
                          'Smooth Entry: No entrance queue bottleneck'
                        )}
                      </span>
                    </div>
                  )}
                </div>

                {/* Active Route & Traffic Cost Summary inside Right-Hand Inspector Card */}
                {activeRoutePlan && (
                  <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/40 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-cyan-300 flex items-center gap-1">
                        <Route className="w-3.5 h-3.5" />
                        <span>
                          {pickLocaleText(
                            locale,
                            '最短路線 · 即時路況時間及費用估算',
                            '最短路线 · 实时路况时间及费用估算',
                            'Shortest Route · Live Traffic & Cost'
                          )}
                        </span>
                      </span>
                      <button
                        onClick={handleFrameActiveRouteOnMap}
                        className="text-[10px] font-semibold text-cyan-300 underline underline-offset-2 cursor-pointer"
                      >
                        {pickLocaleText(locale, '3D 路線全景', '3D 路线全景', 'Frame Route')}
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 font-mono-tabular text-xs">
                      <div className="p-1.5 rounded-lg bg-slate-950/80 border border-slate-800">
                        <div className="text-[10px] text-slate-400 font-sans">
                          {pickLocaleText(locale, '最短距離', '最短距离', 'Distance')}
                        </div>
                        <div className="font-bold text-white">
                          {activeRoutePlan.roadDistanceKm} km
                        </div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-slate-950/80 border border-slate-800">
                        <div className="text-[10px] text-slate-400 font-sans">
                          {pickLocaleText(locale, '預計抵達', '预计抵达', 'Live ETA')}
                        </div>
                        <div className="font-bold text-emerald-400">
                          {activeRoutePlan.totalEtaMins}{' '}
                          {pickLocaleText(locale, '分鐘', '分钟', 'mins')}
                        </div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-slate-950/80 border border-cyan-500/30">
                        <div className="text-[10px] text-cyan-300 font-sans">
                          {pickLocaleText(locale, '預計總費', '预计总费', 'Est. Cost')}
                        </div>
                        <div className="font-bold text-cyan-300">
                          HK${activeRoutePlan.costBreakdown.totalEstimatedCostHk}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1 pt-0.5">
                      {activeRoutePlan.steps.map((st) => (
                        <div
                          key={st.stepIndex}
                          className="text-[11px] text-slate-300 flex items-center justify-between gap-2"
                        >
                          <span className="truncate">
                            {st.stepIndex}.{' '}
                            {pickLocaleText(
                              locale,
                              st.instructionZh,
                              st.instructionSc,
                              st.instructionEn
                            )}
                          </span>
                          <span className="font-mono-tabular text-[10px] text-slate-400 shrink-0">
                            {st.durationMins}m
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Carpark Website / Official Reservation Portal & Operating Info */}
                {(selectedCarpark.website || selectedCarpark.openingHours || selectedCarpark.contactNo) && (
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] space-y-1.5">
                    {selectedCarpark.openingHours && (
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <span className="text-slate-500">🕒</span>
                        <span>{selectedCarpark.openingHours}</span>
                      </div>
                    )}
                    {selectedCarpark.contactNo && (
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <span className="text-slate-500">📞</span>
                        <a href={`tel:${selectedCarpark.contactNo.replace(/[^0-9+\-\s()]/g, '')}`} className="hover:text-cyan-300 underline font-mono-tabular">
                          {selectedCarpark.contactNo}
                        </a>
                      </div>
                    )}
                    {selectedCarpark.website && /^https?:\/\//i.test(selectedCarpark.website) && (
                      <a
                        href={selectedCarpark.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 pt-0.5 text-cyan-400 hover:text-cyan-300 font-semibold hover:underline"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>
                          {selectedCarpark.id === 'cp-oceanpark-main'
                            ? pickLocaleText(locale, '前往海洋公園官網預約車位', '前往海洋公园官网预约车位', 'Book on Ocean Park Official Site')
                            : pickLocaleText(locale, '場地官方網站 / 預約資訊', '场地官方网站 / 预约资讯', 'Official Website / Reservation')}
                        </span>
                      </a>
                    )}
                  </div>
                )}

                {/* Deep-link Navigation CTA */}
                <div className="flex items-center gap-2">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&origin=${referenceOriginCoords[1]},${referenceOriginCoords[0]}&destination=${selectedCarpark.coordinates[1]},${selectedCarpark.coordinates[0]}&travelmode=driving`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2 px-4 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>{t.navigateBtn} (Google Maps)</span>
                  </a>
                  <button
                    onClick={() => {
                      setQuickFilter('meters');
                      setShowMetersLayer(true);
                      setCameraTarget({
                        center: selectedCarpark.coordinates,
                        zoom: 16.6,
                        pitch: is3DView ? 48 : 0,
                        bearing: 0,
                        timestamp: Date.now(),
                      });
                    }}
                    className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 whitespace-nowrap"
                  >
                    {t.viewNearbyMetersBtn}
                  </button>
                </div>
              </div>
            ) : selectedCctv ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] text-cyan-400 font-medium">
                      {t.liveCctvBadge} · {selectedCctv.id}
                    </div>
                    <h2 className="text-sm font-bold text-white mt-0.5">
                      {pickLocaleText(
                        locale,
                        selectedCctv.nameZh,
                        selectedCctv.nameSc,
                        selectedCctv.nameEn
                      )}
                    </h2>
                  </div>
                  <button
                    onClick={() => setSelectedCctvId(null)}
                    className="p-1 text-slate-400 hover:text-white rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <TdCctvSnapshotView
                  camera={selectedCctv}
                  allCameras={liveCctvCameras}
                  locale={locale}
                  compact={true}
                  onSelectCamera={handleSelectCctv}
                  onFlyToCamera={handleSelectCctv}
                />
              </div>
            ) : selectedMeter ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] text-emerald-400 font-medium flex items-center gap-1.5 flex-wrap">
                      <span>HKeMeter</span>
                      <span>·</span>
                      <span>
                        {pickLocaleText(
                          locale,
                          selectedMeter.regionZh || '',
                          selectedMeter.regionSc || '',
                          selectedMeter.regionEn || ''
                        )}
                      </span>
                      <span>·</span>
                      <span>
                        {pickLocaleText(
                          locale,
                          selectedMeter.districtZh,
                          selectedMeter.districtSc,
                          selectedMeter.districtEn
                        )}
                      </span>
                    </div>
                    <h2 className="text-sm font-bold text-white mt-0.5">
                      {pickLocaleText(
                        locale,
                        selectedMeter.streetZh,
                        selectedMeter.streetSc,
                        selectedMeter.streetEn
                      )}
                    </h2>
                    {(selectedMeter.sectionOfStreetZh || selectedMeter.sectionOfStreetEn) && (
                      <div className="text-[11px] text-slate-300 mt-0.5">
                        {pickLocaleText(
                          locale,
                          selectedMeter.sectionOfStreetZh || '',
                          selectedMeter.sectionOfStreetSc || '',
                          selectedMeter.sectionOfStreetEn || ''
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedMeterId(null)}
                    className="p-1 text-slate-400 hover:text-white rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Primary Street-Section Vacancy (Vacant / Total Bays), Occupancy Rate & Tariff Grid */}
                <div className="grid grid-cols-3 gap-2 font-mono-tabular">
                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                    <div className="text-[10px] text-slate-400 font-sans">
                      {pickLocaleText(locale, '空置 / 總錶位', '空置 / 总表位', 'Vacant / Total')}
                    </div>
                    <div
                      className={`text-sm font-bold mt-1 ${
                        (selectedMeterSectionStats?.occupancyRatePct ?? 0) >= 80
                          ? 'text-rose-400'
                          : (selectedMeterSectionStats?.occupancyRatePct ?? 0) >= 50
                          ? 'text-amber-300'
                          : 'text-emerald-400'
                      }`}
                    >
                      {selectedMeterSectionStats?.vacantBays ?? (selectedMeter.occupied ? 0 : 1)}{' '}
                      <span className="text-xs font-normal text-slate-400">
                        / {selectedMeterSectionStats?.totalBays ?? 1}
                      </span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                    <div className="text-[10px] text-slate-400 font-sans">
                      {pickLocaleText(locale, '路段佔用率', '路段占用率', 'Occupancy Rate')}
                    </div>
                    <div className="text-sm font-bold mt-1 flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            selectedMeterSectionStats?.occupancyColor ?? '#00f59b',
                        }}
                      />
                      <span
                        className={
                          (selectedMeterSectionStats?.occupancyRatePct ?? 0) >= 80
                            ? 'text-rose-400'
                            : (selectedMeterSectionStats?.occupancyRatePct ?? 0) >= 50
                            ? 'text-amber-300'
                            : 'text-emerald-400'
                        }
                      >
                        {selectedMeterSectionStats?.occupancyRatePct ?? 0}%
                      </span>
                      <span className="text-[10px] font-normal text-slate-400">
                        {pickLocaleText(locale, '已泊', '已泊', 'Full')}
                      </span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
                    <div className="text-[10px] text-slate-400 font-sans">
                      {pickLocaleText(locale, '收費 / 時限', '收费 / 时限', 'Tariff / Max')}
                    </div>
                    <div className="text-xs font-bold text-cyan-300 mt-1">
                      HK${selectedMeter.ratePer15MinHk.toFixed(1)}/{selectedMeter.timeUnitMins || 15}m
                      <span className="block text-[10px] font-normal text-slate-400">
                        Max {selectedMeter.maxDurationMins}m
                      </span>
                    </div>
                  </div>
                </div>

                {/* Street Section Occupancy Rate Progress Bar */}
                {selectedMeterSectionStats && (
                  <div className="space-y-1">
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full transition-all duration-300"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(6, selectedMeterSectionStats.occupancyRatePct)
                          )}%`,
                          backgroundColor: selectedMeterSectionStats.occupancyColor,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono-tabular text-slate-400">
                      <span>🟢 &lt;50% Full</span>
                      <span>🟡 50–79% Full</span>
                      <span>🔴 ≥80% Full</span>
                    </div>
                  </div>
                )}

                {/* Clean Operating Period & Vehicle Type Info */}
                <div className="p-2.5 rounded-xl bg-slate-900/75 border border-slate-800/90 text-[11px] space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">
                      {pickLocaleText(locale, '適用車種:', '适用车种:', 'Vehicle Type:')}
                    </span>
                    <span className="font-semibold text-cyan-300">
                      {pickLocaleText(
                        locale,
                        selectedMeter.vehicleTypeZh,
                        selectedMeter.vehicleTypeSc,
                        selectedMeter.vehicleTypeEn
                      )}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-400 shrink-0">
                      {pickLocaleText(locale, '收費時段:', '收费时段:', 'Operating Hours:')}
                    </span>
                    <span className="text-right text-slate-200 font-mono-tabular">
                      {pickLocaleText(
                        locale,
                        selectedMeter.operatingHours,
                        selectedMeter.operatingHoursSc || selectedMeter.operatingHours,
                        selectedMeter.operatingHoursEn || selectedMeter.operatingHours
                      )}
                    </span>
                  </div>
                </div>

                {/* Active Route & Cost Summary for Selected Street Section */}
                {activeRoutePlan && (
                  <div className="p-2.5 rounded-xl bg-cyan-950/30 border border-cyan-500/40 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-cyan-300 flex items-center gap-1">
                        <Route className="w-3.5 h-3.5" />
                        <span>
                          {pickLocaleText(
                            locale,
                            '前往此咪錶路段路線與預計泊車費',
                            '前往此咪表路段路线与预计泊车费',
                            'Route & Meter Cost Estimate'
                          )}
                        </span>
                      </span>
                      <button
                        onClick={handleFrameActiveRouteOnMap}
                        className="text-[10px] font-semibold text-cyan-300 underline underline-offset-2 cursor-pointer"
                      >
                        {pickLocaleText(locale, '3D 路線全景', '3D 路线全景', 'Frame Route')}
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 font-mono-tabular text-xs">
                      <div className="p-1.5 rounded-lg bg-slate-950/80 border border-slate-800">
                        <div className="text-[10px] text-slate-400 font-sans">
                          {pickLocaleText(locale, '行車距離', '行车距离', 'Distance')}
                        </div>
                        <div className="font-bold text-white">
                          {activeRoutePlan.roadDistanceKm} km
                        </div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-slate-950/80 border border-slate-800">
                        <div className="text-[10px] text-slate-400 font-sans">
                          {pickLocaleText(locale, '預計車程', '预计车程', 'Live ETA')}
                        </div>
                        <div className="font-bold text-emerald-400">
                          {activeRoutePlan.totalEtaMins}{' '}
                          {pickLocaleText(locale, '分鐘', '分钟', 'mins')}
                        </div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-slate-950/80 border border-cyan-500/30">
                        <div className="text-[10px] text-cyan-300 font-sans">
                          {pickLocaleText(locale, '預計總費', '预计总费', 'Est. Cost')}
                        </div>
                        <div className="font-bold text-cyan-300">
                          HK${activeRoutePlan.costBreakdown.totalEstimatedCostHk}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <a
                  href={`https://www.google.com/maps/dir/?api=1&origin=${referenceOriginCoords[1]},${referenceOriginCoords[0]}&destination=${
                    (selectedMeterSectionStats?.centerCoordinates ?? selectedMeter.coordinates)[1]
                  },${
                    (selectedMeterSectionStats?.centerCoordinates ?? selectedMeter.coordinates)[0]
                  }&travelmode=driving`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2 px-4 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>{t.navigateBtn} (Google Maps)</span>
                </a>
              </div>
            ) : null}
          </div>
        )}

        {/* Dedicated "About" Sub-Page View (Author Kevin LAU, App Tech Architecture, Legal Disclaimer) */}
        {aboutPageOpen && (
          <AboutSubPage locale={locale} onClose={() => setAboutPageOpen(false)} />
        )}

        {/* Dedicated "Setup" Modal / Sub-Page (DATA.GOV.HK Live vs Sim, Auto-Poll, Map Preferences, Facility & Parking Filters) */}
        <SetupModal
          isOpen={setupModalOpen}
          onClose={() => setSetupModalOpen(false)}
          locale={locale}
          dataMode={dataMode}
          setDataMode={setDataMode}
          upstreamLive={upstreamLive}
          totalMetersCount={meters.length}
          totalCarparksCount={carparks.length}
          totalCctvCount={liveCctvCameras.length}
          onManualPulse={handleManualPulse}
          autoLiveTick={autoLiveTick}
          setAutoLiveTick={setAutoLiveTick}
          viewportSyncEnabled={viewportSyncEnabled}
          setViewportSyncEnabled={setViewportSyncEnabled}
          is3DView={is3DView}
          setIs3DView={setIs3DView}
          quickFilter={quickFilter}
          onSelectQuickFilter={handleSelectQuickFilter}
          evPowerFilter={evPowerFilter}
          onSelectEvPowerFilter={handleSelectEvPowerFilter}
          mapTheme={mapTheme}
          onSelectMapTheme={handleSelectMapTheme}
        />
      </main>

      {/* Standalone Single-File HTML Export Modal */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white">
                  {pickLocaleText(
                    locale,
                    '匯出獨立單一檔案版本 (Standalone index.html)',
                    '导出独立单一文件版本 (Standalone index.html)',
                    'Export Self-Contained Single-File Bundle (index.html)'
                  )}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {pickLocaleText(
                    locale,
                    '包含完整 MapLibre GL 3D 數碼孿生引擎、OpenFreeMap 圖資、三隧過海時間、路面 CCTV、全城泊車/咪錶/EV 數據庫及繁簡英三語切換。',
                    '包含完整 MapLibre GL 3D 数码孪生引擎、OpenFreeMap 图资、三隧过海时间、路面 CCTV、全城泊车/咪表/EV 数据库及繁简英三语切换。',
                    'Includes MapLibre GL 3D Digital Twin, OpenFreeMap tiles, Cross-Harbour tunnel monitors, TD CCTV codes, HK parking/meters/EV dataset, and Trilingual switcher.'
                  )}
                </p>
              </div>
              <button
                onClick={() => setExportModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1.5 font-mono-tabular">
              <div>
                • 3D Carpark Energy Pillars: {carparks.length} HK Multi-storey Carparks &amp; EV Hubs
              </div>
              <div>
                • Curbside Smart Meters (HKeMeter): {meters.length.toLocaleString()} Official TD
                Sensor Bays across 1,732 Street Sections
              </div>
              <div>• Live TD Entrance &amp; Tunnel CCTV: {liveCctvCameras.length} Official Feeds</div>
              <div>• Cross-Harbour Tunnels (CHT / EHC / WHC) &amp; Trilingual UI (繁/简/EN)</div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={handleCopyStandaloneHtml}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition-colors"
              >
                {copiedHtml ? 'Copied HTML ✓' : 'Copy HTML Source'}
              </button>
              <button
                onClick={handleDownloadStandaloneHtml}
                className="px-4 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-xs font-bold text-slate-950 flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download index.html</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
