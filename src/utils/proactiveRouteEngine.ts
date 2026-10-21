import {
  CarparkFacility,
  SmartMeterSpot,
  RoadSegment,
  TunnelCrossingMonitor,
  LocaleKey,
  calculateDistanceKm,
  pickLocaleText,
} from '../data/hkParkingData';

export type DriverIntentMode = 'smart_auto' | 'ev_charging' | 'parking_only' | 'curbside_meter';

export type GpsPermissionStatus = 'prompt' | 'requesting' | 'granted' | 'simulated' | 'denied';

export interface UserGpsState {
  coordinates: [number, number]; // [lng, lat]
  accuracyMeters: number;
  status: GpsPermissionStatus;
  labelZh: string;
  labelSc: string;
  labelEn: string;
  updatedAt: string;
}

export interface ProactiveSuggestionItem {
  id: string;
  category: 'ev_dock' | 'carpark' | 'smart_meter';
  badgeZh: string;
  badgeSc: string;
  badgeEn: string;
  reasonZh: string;
  reasonSc: string;
  reasonEn: string;
  carpark?: CarparkFacility;
  meter?: SmartMeterSpot;
  straightDistanceKm: number;
  routeDistanceKm: number;
  estimatedDriveMins: number;
  trafficPenaltyMins: number;
  queueWaitMins: number;
  totalEtaMins: number;
  estimatedBaseCostHk: number; // Default 2 hrs parking + 30kWh EV (if EV mode)
  trafficCondition: 'good' | 'average' | 'bad';
  score: number;
}

export interface RouteStepInstruction {
  stepIndex: number;
  instructionZh: string;
  instructionSc: string;
  instructionEn: string;
  distanceKm: number;
  durationMins: number;
  roadSpeedKmh: number;
  trafficStatus: 'good' | 'average' | 'bad';
}

export interface CalculatedRoutePlan {
  originCoords: [number, number];
  destinationCoords: [number, number];
  destinationNameZh: string;
  destinationNameSc: string;
  destinationNameEn: string;
  geometryCoords: [number, number][];
  roadDistanceKm: number;
  freeFlowDriveMins: number;
  trafficDelayMins: number;
  entranceQueueMins: number;
  totalEtaMins: number;
  averageRouteSpeedKmh: number;
  trafficCondition: 'good' | 'average' | 'bad';
  crossHarbourTunnel: {
    used: boolean;
    tunnelNameZh: string;
    tunnelNameSc: string;
    tunnelNameEn: string;
    tunnelTravelMins: number;
    tollHk: number;
  } | null;
  costBreakdown: {
    durationHours: number;
    chargingKwh: number;
    parkingFeeHk: number;
    evChargingFeeHk: number;
    evRatePerKwhHk: number;
    estimatedChargeMins: number;
    tunnelTollHk: number;
    totalEstimatedCostHk: number;
    promoApplied: boolean;
  };
  steps: RouteStepInstruction[];
  isRealOsrmGeometry: boolean;
  routingProvider: 'google_maps' | 'osrm_td_hybrid' | 'fallback_geometry';
  routeSummary?: string;
  googleError?: {
    code: string;
    message: string;
    suggestionZh: string;
    suggestionEn: string;
  };
}

export interface PresetDriverGpsAnchor {
  id: string;
  nameZh: string;
  nameSc: string;
  nameEn: string;
  coordinates: [number, number];
}

export const PRESET_DRIVER_GPS_ANCHORS: PresetDriverGpsAnchor[] = [
  {
    id: 'gps-tst',
    nameZh: '尖沙咀廣東道 (近海港城)',
    nameSc: '尖沙咀广东道 (近海港城)',
    nameEn: 'Canton Rd, Tsim Sha Tsui',
    coordinates: [114.1688, 22.2962],
  },
  {
    id: 'gps-central',
    nameZh: '中環金融街 (近 IFC 國金)',
    nameSc: '中环金融街 (近 IFC 国金)',
    nameEn: 'Finance St, Central',
    coordinates: [114.1586, 22.2849],
  },
  {
    id: 'gps-cwb',
    nameZh: '銅鑼灣勿地臣街 (近時代廣場)',
    nameSc: '铜锣湾勿地臣街 (近时代广场)',
    nameEn: 'Matheson St, Causeway Bay',
    coordinates: [114.1822, 22.2788],
  },
  {
    id: 'gps-mk',
    nameZh: '旺角亞皆老街 (近朗豪坊)',
    nameSc: '旺角亚皆老街 (近朗豪坊)',
    nameEn: 'Argyle St, Mong Kok',
    coordinates: [114.1692, 22.3186],
  },
  {
    id: 'gps-kt',
    nameZh: '觀塘開源道 (近 APM 創紀之城)',
    nameSc: '观塘开源道 (近 APM 创纪之城)',
    nameEn: 'Hoi Yuen Rd, Kwun Tong',
    coordinates: [114.2252, 22.3121],
  },
  {
    id: 'gps-shatin',
    nameZh: '沙田正街 (近新城市廣場)',
    nameSc: '沙田正街 (近新城市广场)',
    nameEn: 'Sha Tin Centre St, Sha Tin',
    coordinates: [114.1885, 22.3818],
  },
];

export function isWithinHongKongBounds(coords: [number, number]): boolean {
  const [lng, lat] = coords;
  return lng >= 113.82 && lng <= 114.45 && lat >= 22.15 && lat <= 22.56;
}

export interface GeolocationResult {
  coordinates: [number, number];
  accuracyMeters: number;
  isHighAccuracy: boolean;
}

export interface GeolocationFailure {
  code: number; // 1: PERMISSION_DENIED, 2: POSITION_UNAVAILABLE, 3: TIMEOUT, 4: NOT_SUPPORTED
  message: string;
  isPermissionDenied: boolean;
  isTimeout: boolean;
  isPositionUnavailable: boolean;
}

// Mobile-optimized Dual-Pass Geolocation Requester: Instant local region zoom on load
export function requestDualPassGeolocation(
  onSuccess: (res: GeolocationResult) => void,
  onError: (err: GeolocationFailure) => void
): void {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    onError({
      code: 4,
      message: '瀏覽器不支援 Geolocation API',
      isPermissionDenied: false,
      isTimeout: false,
      isPositionUnavailable: true,
    });
    return;
  }

  let hasDispatched = false;

  // Pass 1: Instant Low-Accuracy / Cached Position (Cell/Wi-Fi/IP - delivers user region in < 250ms)
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      hasDispatched = true;
      onSuccess({
        coordinates: [
          Number(pos.coords.longitude.toFixed(5)),
          Number(pos.coords.latitude.toFixed(5)),
        ],
        accuracyMeters: Math.round(pos.coords.accuracy || 25),
        isHighAccuracy: false,
      });

      // Refinement Pass: High Accuracy (GPS hardware satellite lock for exact street/meter position)
      try {
        navigator.geolocation.getCurrentPosition(
          (posRefined) => {
            onSuccess({
              coordinates: [
                Number(posRefined.coords.longitude.toFixed(5)),
                Number(posRefined.coords.latitude.toFixed(5)),
              ],
              accuracyMeters: Math.round(posRefined.coords.accuracy || 12),
              isHighAccuracy: true,
            });
          },
          () => {
            // Ignore refined pass failures if initial position was already acquired
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        );
      } catch {}
    },
    (fastErr) => {
      if (fastErr.code === 1) {
        // User explicitly denied permission
        onError({
          code: 1,
          message: 'GPS 定位授權被拒絕',
          isPermissionDenied: true,
          isTimeout: false,
          isPositionUnavailable: false,
        });
        return;
      }

      // Pass 2: Fallback to High Accuracy if fast pass timed out or was empty
      navigator.geolocation.getCurrentPosition(
        (posPass2) => {
          if (!hasDispatched) {
            hasDispatched = true;
            onSuccess({
              coordinates: [
                Number(posPass2.coords.longitude.toFixed(5)),
                Number(posPass2.coords.latitude.toFixed(5)),
              ],
              accuracyMeters: Math.round(posPass2.coords.accuracy || 18),
              isHighAccuracy: true,
            });
          }
        },
        (errPass2) => {
          if (!hasDispatched) {
            onError({
              code: errPass2.code,
              message:
                errPass2.code === 1
                  ? 'GPS 定位授權被拒絕'
                  : errPass2.code === 3
                  ? 'GPS 衛星搜尋超時，請在空曠處重試'
                  : '無法獲取目前位置訊號',
              isPermissionDenied: errPass2.code === 1,
              isTimeout: errPass2.code === 3,
              isPositionUnavailable: errPass2.code === 2,
            });
          }
        },
        { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 }
      );
    },
    { enableHighAccuracy: false, timeout: 2500, maximumAge: 300000 }
  );
}

// Parse EV tariff string like "HK$3.4/kWh" or "免費充電 (Free)" into numeric HK$/kWh
export function parseEvTariffPerKwh(tariffStr: string): number {
  if (!tariffStr) return 3.2;
  if (tariffStr.includes('免費') || tariffStr.toLowerCase().includes('free')) {
    return 0;
  }
  const match = tariffStr.match(/(\d+(\.\d+)?)/);
  if (match) {
    const val = parseFloat(match[1]);
    if (!Number.isNaN(val) && val > 0 && val < 20) {
      return val;
    }
  }
  return 3.2;
}

// Check if origin and destination cross Victoria Harbour
function isHongKongIsland(coords: [number, number]): boolean {
  const [lng, lat] = coords;
  // HK Island roughly lat < 22.293 and lng between 114.11 and 114.26
  return lat < 22.293 && lng >= 114.11 && lng <= 114.26;
}

export function detectOptimalCrossHarbourTunnel(
  origin: [number, number],
  destination: [number, number],
  tunnels: TunnelCrossingMonitor[]
): {
  tunnel: TunnelCrossingMonitor;
  directionToHk: boolean;
  travelMins: number;
  tollHk: number;
} | null {
  const originOnIsland = isHongKongIsland(origin);
  const destOnIsland = isHongKongIsland(destination);

  if (originOnIsland === destOnIsland) {
    return null;
  }

  const directionToHk = !originOnIsland && destOnIsland;

  // Score each tunnel by total distance + live travel time
  let bestTunnel = tunnels[0];
  let bestScore = Infinity;

  for (const tun of tunnels) {
    const d1 = calculateDistanceKm(origin, tun.coordinates);
    const d2 = calculateDistanceKm(tun.coordinates, destination);
    const waitMins = directionToHk ? tun.toHkMins : tun.toKlnMins;
    const score = (d1 + d2) * 1.6 + waitMins;
    if (score < bestScore) {
      bestScore = score;
      bestTunnel = tun;
    }
  }

  if (!bestTunnel) return null;

  const travelMins = directionToHk ? bestTunnel.toHkMins : bestTunnel.toKlnMins;
  // HK Time-Varying Toll approximation (HK$20 - HK$40 depending on congestion/peak)
  const status = directionToHk ? bestTunnel.toHkStatus : bestTunnel.toKlnStatus;
  const tollHk = status === 'bad' ? 40 : status === 'average' ? 30 : 20;

  return {
    tunnel: bestTunnel,
    directionToHk,
    travelMins,
    tollHk,
  };
}

// Estimate road distance, driving time, and traffic delay for a candidate facility
export function evaluateRouteMetricsToTarget(
  origin: [number, number],
  targetCoords: [number, number],
  adjacentRoadSpeedKmh: number,
  queueWaitMins: number,
  tunnels: TunnelCrossingMonitor[]
) {
  const straightDistanceKm = Math.max(0.15, calculateDistanceKm(origin, targetCoords));
  const crossing = detectOptimalCrossHarbourTunnel(origin, targetCoords, tunnels);

  // Urban HK road winding factor ~1.34x (or via tunnel if cross-harbour)
  let routeDistanceKm = straightDistanceKm * 1.34;
  if (crossing) {
    const leg1 = calculateDistanceKm(origin, crossing.tunnel.coordinates);
    const leg2 = calculateDistanceKm(crossing.tunnel.coordinates, targetCoords);
    routeDistanceKm = Math.max(straightDistanceKm * 1.25, (leg1 + leg2) * 1.28);
  }

  const effectiveSpeedKmh = Math.max(12, Math.min(55, (adjacentRoadSpeedKmh + 34) / 2));
  const exactFreeFlowMins = Math.max(1.5, (routeDistanceKm / 42) * 60);
  const exactDriveMins = Math.max(1.5, (routeDistanceKm / effectiveSpeedKmh) * 60);
  const tunnelExtraMins = crossing ? Math.max(0, crossing.travelMins - 4) : 0;

  // Unrounded continuous ETA prevents 1 km/h speed jitter from crossing Math.round boundaries and flipping ranks
  const exactTrafficPenaltyMins = Math.max(0, exactDriveMins - exactFreeFlowMins) + tunnelExtraMins;
  const exactTotalEtaMins = exactFreeFlowMins + exactTrafficPenaltyMins + queueWaitMins;

  const freeFlowMins = Math.max(2, Math.round(exactFreeFlowMins));
  const actualDriveMins = Math.max(2, Math.round(exactDriveMins));
  const trafficPenaltyMins = Math.max(0, actualDriveMins - freeFlowMins) + tunnelExtraMins;
  const totalEtaMins = freeFlowMins + trafficPenaltyMins + queueWaitMins;

  const trafficCondition: 'good' | 'average' | 'bad' =
    adjacentRoadSpeedKmh < 20 || queueWaitMins >= 10
      ? 'bad'
      : adjacentRoadSpeedKmh <= 35 || trafficPenaltyMins >= 5
      ? 'average'
      : 'good';

  return {
    straightDistanceKm,
    routeDistanceKm,
    freeFlowMins,
    estimatedDriveMins: freeFlowMins + trafficPenaltyMins,
    trafficPenaltyMins,
    queueWaitMins,
    totalEtaMins,
    exactTotalEtaMins,
    effectiveSpeedKmh: Math.round(effectiveSpeedKmh),
    trafficCondition,
    crossing,
  };
}

function stableTieBreak(a: ProactiveSuggestionItem, b: ProactiveSuggestionItem): number {
  const scoreDiff = a.score - b.score;
  if (Math.abs(scoreDiff) > 1e-4) return scoreDiff;
  const distDiff = a.straightDistanceKm - b.straightDistanceKm;
  if (Math.abs(distDiff) > 1e-4) return distDiff;
  return a.id.localeCompare(b.id);
}

// Step 2: Proactively rank and pick the best options around user's GPS
export function computeProactiveSuggestions(
  userCoords: [number, number],
  carparks: CarparkFacility[],
  meters: SmartMeterSpot[],
  tunnels: TunnelCrossingMonitor[],
  intentMode: DriverIntentMode = 'smart_auto',
  evPowerFilter: 'all' | 'dc_super' | 'ac_medium' = 'all'
): ProactiveSuggestionItem[] {
  const suggestions: ProactiveSuggestionItem[] = [];

  // 1. Evaluate EV Charging Docks (strictly honoring evPowerFilter & smooth continuous bonuses)
  const evCandidates = carparks
    .filter((cp) => {
      if (!cp.evInfo.hasEv) return false;
      if (evPowerFilter === 'dc_super') {
        return cp.evInfo.dcAvailable > 0 && cp.evInfo.dcMaxKw >= 60;
      }
      if (evPowerFilter === 'ac_medium') {
        return cp.evInfo.acAvailable > 0;
      }
      return cp.evInfo.dcAvailable > 0 || cp.evInfo.acAvailable > 0;
    })
    .map((cp) => {
      const m = evaluateRouteMetricsToTarget(
        userCoords,
        cp.coordinates,
        cp.adjacentRoadSpeedKmh,
        cp.queueRisk ? cp.estimatedWaitMins : 0,
        tunnels
      );
      const ratePerKwh = parseEvTariffPerKwh(cp.evInfo.tariffHk);
      const estimatedBaseCostHk = Math.round(
        cp.hourlyFeeHk * 1 + ratePerKwh * 30 + (m.crossing ? m.crossing.tollHk : 0)
      );
      // Smooth continuous bonuses (no step cliffs at 4 plugs or 150kW)
      const dcBonus =
        cp.evInfo.dcAvailable > 0
          ? -Math.min(3.0, 0.8 + cp.evInfo.dcAvailable * 0.45)
          : 1.5;
      const powerBonus =
        cp.evInfo.dcMaxKw >= 60
          ? -Math.min(1.5, (cp.evInfo.dcMaxKw / 250) * 1.5)
          : 0;
      const score =
        m.exactTotalEtaMins * 1.35 + m.routeDistanceKm * 2.2 + dcBonus + powerBonus;

      return {
        id: `sug-ev-${cp.id}`,
        category: 'ev_dock' as const,
        badgeZh: '⚡ 首選最近超充站',
        badgeSc: '⚡ 首选最近超充站',
        badgeEn: '⚡ Best Closest EV Dock',
        reasonZh: `距你 ${m.routeDistanceKm.toFixed(1)}km · 空閒 DC ${cp.evInfo.dcAvailable}槍 (${cp.evInfo.dcMaxKw}kW) · 路況${m.trafficCondition === 'good' ? '暢順' : m.trafficCondition === 'average' ? '正常' : '略擠'}`,
        reasonSc: `距你 ${m.routeDistanceKm.toFixed(1)}km · 空闲 DC ${cp.evInfo.dcAvailable}枪 (${cp.evInfo.dcMaxKw}kW) · 路况${m.trafficCondition === 'good' ? '畅顺' : m.trafficCondition === 'average' ? '正常' : '略挤'}`,
        reasonEn: `${m.routeDistanceKm.toFixed(1)}km away · ${cp.evInfo.dcAvailable} DC plugs (${cp.evInfo.dcMaxKw}kW) · Traffic ${m.trafficCondition}`,
        carpark: cp,
        straightDistanceKm: m.straightDistanceKm,
        routeDistanceKm: m.routeDistanceKm,
        estimatedDriveMins: m.estimatedDriveMins,
        trafficPenaltyMins: m.trafficPenaltyMins,
        queueWaitMins: m.queueWaitMins,
        totalEtaMins: m.totalEtaMins,
        estimatedBaseCostHk,
        trafficCondition: m.trafficCondition,
        score,
      };
    })
    .sort(stableTieBreak);

  // 2. Evaluate Zero-Queue / Closest Available Carparks (smooth abundance bonus, no 25-space cliff)
  const parkingCandidates = carparks
    .filter((cp) => cp.availableSpaces >= 3)
    .map((cp) => {
      const m = evaluateRouteMetricsToTarget(
        userCoords,
        cp.coordinates,
        cp.adjacentRoadSpeedKmh,
        cp.queueRisk ? cp.estimatedWaitMins : 0,
        tunnels
      );
      const estimatedBaseCostHk = Math.round(
        cp.hourlyFeeHk * 2 + (m.crossing ? m.crossing.tollHk : 0)
      );
      const queuePenalty = cp.queueRisk ? 14 : 0;
      const abundanceBonus = -Math.min(2.0, (cp.availableSpaces / 30) * 2.0);
      const score =
        m.exactTotalEtaMins * 1.4 +
        m.routeDistanceKm * 2.4 +
        queuePenalty +
        abundanceBonus +
        cp.hourlyFeeHk * 0.08;

      return {
        id: `sug-cp-${cp.id}`,
        category: 'carpark' as const,
        badgeZh: '🅿️ 最近免排隊泊車',
        badgeSc: '🅿️ 最近免排队泊车',
        badgeEn: '🅿️ Closest Smooth Carpark',
        reasonZh: `距你 ${m.routeDistanceKm.toFixed(1)}km · 即時空位 ${cp.availableSpaces}個 · 時租 HK$${cp.hourlyFeeHk}`,
        reasonSc: `距你 ${m.routeDistanceKm.toFixed(1)}km · 实时空位 ${cp.availableSpaces}个 · 时租 HK$${cp.hourlyFeeHk}`,
        reasonEn: `${m.routeDistanceKm.toFixed(1)}km away · ${cp.availableSpaces} spaces · HK$${cp.hourlyFeeHk}/hr`,
        carpark: cp,
        straightDistanceKm: m.straightDistanceKm,
        routeDistanceKm: m.routeDistanceKm,
        estimatedDriveMins: m.estimatedDriveMins,
        trafficPenaltyMins: m.trafficPenaltyMins,
        queueWaitMins: m.queueWaitMins,
        totalEtaMins: m.totalEtaMins,
        estimatedBaseCostHk,
        trafficCondition: m.trafficCondition,
        score,
      };
    })
    .sort(stableTieBreak);

  // 3. Evaluate Closest Vacant Curbside Smart Meters (order-independent Haversine corridor clustering)
  const closestByCorridor = new Map<string, { mt: SmartMeterSpot; distKm: number }>();
  for (let i = 0; i < meters.length; i++) {
    const mt = meters[i];
    if (mt.occupied || mt.meterStatus === 'OU') continue;
    if (mt.vehicleTypeCode && mt.vehicleTypeCode !== 'A') continue;
    const distKm = calculateDistanceKm(userCoords, mt.coordinates);
    const key = mt.corridorGroupId !== undefined ? String(mt.corridorGroupId) : mt.streetEn;
    const existing = closestByCorridor.get(key);
    if (
      !existing ||
      distKm < existing.distKm - 1e-5 ||
      (Math.abs(distKm - existing.distKm) <= 1e-5 && mt.id.localeCompare(existing.mt.id) < 0)
    ) {
      closestByCorridor.set(key, { mt, distKm });
    }
  }

  const topCorridorMeters = Array.from(closestByCorridor.values())
    .sort((a, b) => a.distKm - b.distKm || a.mt.id.localeCompare(b.mt.id))
    .slice(0, 12)
    .map((x) => x.mt);

  const meterCandidates = topCorridorMeters
    .map((mt) => {
      const m = evaluateRouteMetricsToTarget(userCoords, mt.coordinates, 36, 0, tunnels);
      const estimatedBaseCostHk = Math.round(mt.ratePer15MinHk * 4); // 1 hr curbside
      const score =
        m.exactTotalEtaMins * 1.2 + m.routeDistanceKm * 3.0 + estimatedBaseCostHk * 0.04;
      return {
        id: `sug-mt-${mt.id}`,
        category: 'smart_meter' as const,
        badgeZh: '🪙 最近路邊空置咪錶',
        badgeSc: '🪙 最近路边空置咪表',
        badgeEn: '🪙 Closest Vacant Meter',
        reasonZh: `距你 ${m.routeDistanceKm.toFixed(1)}km · ${mt.districtZh} · 路邊即泊 HK$${(mt.ratePer15MinHk * 4).toFixed(0)}/小時`,
        reasonSc: `距你 ${m.routeDistanceKm.toFixed(1)}km · ${mt.districtSc} · 路边即泊 HK$${(mt.ratePer15MinHk * 4).toFixed(0)}/小时`,
        reasonEn: `${m.routeDistanceKm.toFixed(1)}km away · ${mt.districtEn} · HK$${(mt.ratePer15MinHk * 4).toFixed(0)}/hr`,
        meter: mt,
        straightDistanceKm: m.straightDistanceKm,
        routeDistanceKm: m.routeDistanceKm,
        estimatedDriveMins: m.estimatedDriveMins,
        trafficPenaltyMins: m.trafficPenaltyMins,
        queueWaitMins: 0,
        totalEtaMins: m.totalEtaMins,
        estimatedBaseCostHk,
        trafficCondition: m.trafficCondition,
        score,
      };
    })
    .sort(stableTieBreak);

  if (intentMode === 'ev_charging') {
    return evCandidates.slice(0, 3).map((item, idx) => ({
      ...item,
      badgeZh: idx === 0 ? '⚡ 最佳超充首選' : idx === 1 ? '⚡ 次選高速充電' : '⚡ 備選充電場站',
      badgeSc: idx === 0 ? '⚡ 最佳超充首选' : idx === 1 ? '⚡ 次选高速充电' : '⚡ 备选充电场站',
      badgeEn: idx === 0 ? '⚡ #1 Best EV Dock' : idx === 1 ? '⚡ #2 Fast EV Hub' : '⚡ #3 Alt EV Hub',
    }));
  }

  if (intentMode === 'parking_only') {
    return parkingCandidates.slice(0, 3).map((item, idx) => ({
      ...item,
      badgeZh: idx === 0 ? '🅿️ 最快免排隊首選' : idx === 1 ? '🅿️ 次選充足車位' : '🅿️ 抵泊備選車場',
      badgeSc: idx === 0 ? '🅿️ 最快免排队首选' : idx === 1 ? '🅿️ 次选充足车位' : '🅿️ 抵泊备选车场',
      badgeEn: idx === 0 ? '🅿️ #1 Best Carpark' : idx === 1 ? '🅿️ #2 Abundant Spaces' : '🅿️ #3 Alt Carpark',
    }));
  }

  if (intentMode === 'curbside_meter') {
    return meterCandidates.slice(0, 3);
  }

  // 'smart_auto': Fixed 3-role contract:
  // Slot #1 = Best EV Supercharger, Slot #2 = Best Smooth Carpark (distinct from #1), Slot #3 = Closest Vacant Smart Meter (within 5km)
  if (evCandidates.length > 0) {
    suggestions.push(evCandidates[0]);
  }
  const distinctCarpark =
    parkingCandidates.find((p) => p.carpark?.id !== evCandidates[0]?.carpark?.id) ??
    parkingCandidates[0];
  if (distinctCarpark) {
    suggestions.push(distinctCarpark);
  }
  if (meterCandidates.length > 0 && meterCandidates[0].routeDistanceKm <= 5.0) {
    suggestions.push(meterCandidates[0]);
  } else if (evCandidates.length > 1) {
    suggestions.push({
      ...evCandidates[1],
      badgeZh: '⚡ 備選超快充站',
      badgeSc: '⚡ 备选超快充站',
      badgeEn: '⚡ Alt EV Supercharger',
    });
  }

  return suggestions.slice(0, 3);
}

// Generate realistic intermediate street waypoints when offline or while OSRM resolves
export function buildFallbackStreetGeometry(
  origin: [number, number],
  destination: [number, number],
  tunnels: TunnelCrossingMonitor[]
): [number, number][] {
  const crossing = detectOptimalCrossHarbourTunnel(origin, destination, tunnels);
  const points: [number, number][] = [origin];

  const addSegmentedLeg = (start: [number, number], end: [number, number]) => {
    const dLng = end[0] - start[0];
    const dLat = end[1] - start[1];
    // L-shaped + arterial curve intermediate points that follow urban grid alignment
    const mid1: [number, number] = [
      Number((start[0] + dLng * 0.35).toFixed(5)),
      Number((start[1] + dLat * 0.18).toFixed(5)),
    ];
    const mid2: [number, number] = [
      Number((start[0] + dLng * 0.72).toFixed(5)),
      Number((start[1] + dLat * 0.82).toFixed(5)),
    ];
    points.push(mid1, mid2);
  };

  if (crossing) {
    addSegmentedLeg(origin, crossing.tunnel.coordinates);
    points.push(crossing.tunnel.coordinates);
    addSegmentedLeg(crossing.tunnel.coordinates, destination);
  } else {
    addSegmentedLeg(origin, destination);
  }

  points.push(destination);
  return points;
}

// Fetch real street-level shortest route from OSRM public API with fast timeout
export async function fetchOsrmShortestRoute(
  origin: [number, number],
  destination: [number, number]
): Promise<{ coordinates: [number, number][]; distanceKm: number; durationMins: number } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2800);
    const url = `https://router.project-osrm.org/route/v1/driving/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route || !Array.isArray(route.geometry?.coordinates)) return null;

    return {
      coordinates: route.geometry.coordinates as [number, number][],
      distanceKm: Math.max(0.2, Number((route.distance / 1000).toFixed(2))),
      durationMins: Math.max(2, Math.round(route.duration / 60)),
    };
  } catch {
    return null;
  }
}

export interface UnifiedRouteGeometry {
  coordinates: [number, number][];
  distanceKm: number;
  durationMins: number;
  provider: 'google_maps' | 'osrm_td_hybrid' | 'fallback_geometry';
  routeSummary?: string;
  steps?: { instruction: string; distanceMeters: number; durationSeconds: number }[];
  googleError?: {
    code: string;
    message: string;
    suggestionZh: string;
    suggestionEn: string;
  };
}

const routeMemoryCache = new Map<string, UnifiedRouteGeometry>();
const inflightRoutePromises = new Map<string, Promise<UnifiedRouteGeometry | null>>();
const failedRouteCooldownMap = new Map<string, number>();

/**
 * Fetch unified route with Google Maps Platform priority and seamless OSRM/TD hybrid fallback.
 * Includes in-memory caching, in-flight deduplication, and rate-limit cooldown protection.
 */
export async function fetchSmartUnifiedRoute(
  origin: [number, number],
  destination: [number, number],
  locale: LocaleKey = 'zh-HK'
): Promise<UnifiedRouteGeometry | null> {
  const routeKey = `${origin[0].toFixed(4)},${origin[1].toFixed(4)}->${destination[0].toFixed(4)},${destination[1].toFixed(4)}:${locale}`;

  const cached = routeMemoryCache.get(routeKey);
  if (cached) {
    return cached;
  }

  const lastFailedAt = failedRouteCooldownMap.get(routeKey);
  if (lastFailedAt && Date.now() - lastFailedAt < 30000) {
    return null;
  }

  const existingInflight = inflightRoutePromises.get(routeKey);
  if (existingInflight) {
    return existingInflight;
  }

  const fetchPromise = (async (): Promise<UnifiedRouteGeometry | null> => {
    try {
      // 1. First attempt: Google Maps Routes API v2 via Edge Proxy
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5500);
        const res = await fetch('/api/routes/calculate', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            origin,
            destination,
            language: locale === 'en' ? 'en' : locale === 'zh-CN' ? 'zh-CN' : 'zh-HK',
          }),
        });
        clearTimeout(timer);

        if (res.ok) {
          const data = await res.json();
          if (
            data.provider === 'google_maps' &&
            Array.isArray(data.coordinates) &&
            data.coordinates.length >= 2
          ) {
            const result: UnifiedRouteGeometry = {
              coordinates: data.coordinates,
              distanceKm: data.distanceKm,
              durationMins: data.durationMins,
              provider: 'google_maps',
              routeSummary: data.routeSummary || 'Google Maps 實時路況最優推薦路線',
              steps: data.steps,
            };
            routeMemoryCache.set(routeKey, result);
            return result;
          }
        }
      } catch {
        // Edge server proxy unreachable or timed out
      }

      // 2. Fallback attempt: OSRM + TD live speeds
      const osrmFallback = await fetchOsrmShortestRoute(origin, destination);
      if (osrmFallback) {
        const result: UnifiedRouteGeometry = {
          coordinates: osrmFallback.coordinates,
          distanceKm: osrmFallback.distanceKm,
          durationMins: osrmFallback.durationMins,
          provider: 'osrm_td_hybrid',
        };
        routeMemoryCache.set(routeKey, result);
        return result;
      }

      failedRouteCooldownMap.set(routeKey, Date.now());
      return null;
    } finally {
      inflightRoutePromises.delete(routeKey);
    }
  })();

  inflightRoutePromises.set(routeKey, fetchPromise);
  return fetchPromise;
}

// Step 3: Build full Traffic-Aware Route & Total Cost Plan
export function buildTrafficAwareRoutePlan(params: {
  originCoords: [number, number];
  carpark?: CarparkFacility | null;
  meter?: SmartMeterSpot | null;
  tunnels: TunnelCrossingMonitor[];
  roads: RoadSegment[];
  unifiedGeometry?: UnifiedRouteGeometry | null;
  parkingHours: number;
  chargingKwh: number;
  locale: LocaleKey;
}): CalculatedRoutePlan | null {
  const {
    originCoords,
    carpark,
    meter,
    tunnels,
    unifiedGeometry,
    parkingHours,
    chargingKwh,
    locale,
  } = params;

  if (!carpark && !meter) return null;

  const destCoords: [number, number] = carpark ? carpark.coordinates : meter!.coordinates;
  const destNameZh = carpark ? carpark.nameZh : `${meter!.streetZh} (${meter!.id})`;
  const destNameSc = carpark ? carpark.nameSc : `${meter!.streetSc} (${meter!.id})`;
  const destNameEn = carpark ? carpark.nameEn : `${meter!.streetEn} (${meter!.id})`;

  const adjacentSpeed = carpark ? carpark.adjacentRoadSpeedKmh : 36;
  const queueWaitMins = carpark && carpark.queueRisk ? carpark.estimatedWaitMins : 0;

  const baseEval = evaluateRouteMetricsToTarget(
    originCoords,
    destCoords,
    adjacentSpeed,
    queueWaitMins,
    tunnels
  );

  const isGoogle = unifiedGeometry?.provider === 'google_maps';
  const roadDistanceKm = unifiedGeometry && unifiedGeometry.distanceKm > 0
    ? unifiedGeometry.distanceKm
    : baseEval.routeDistanceKm;

  let freeFlowDriveMins: number;
  let trafficDelayMins: number;
  let totalEtaMins: number;

  if (isGoogle && unifiedGeometry) {
    // Google Maps Routes API returns true TRAFFIC_AWARE duration
    const totalGoogleMins = Math.max(2, unifiedGeometry.durationMins);
    freeFlowDriveMins = Math.max(1, Math.round(totalGoogleMins * 0.82));
    trafficDelayMins = Math.max(0, totalGoogleMins - freeFlowDriveMins);
    totalEtaMins = totalGoogleMins + queueWaitMins;
  } else {
    freeFlowDriveMins = unifiedGeometry && unifiedGeometry.distanceKm > 0
      ? Math.max(2, Math.round((unifiedGeometry.distanceKm / 42) * 60))
      : baseEval.freeFlowMins;
    const speedFactor =
      adjacentSpeed < 18 ? 1.55 : adjacentSpeed < 28 ? 1.3 : adjacentSpeed < 38 ? 1.12 : 1.0;
    const rawTrafficMins = Math.round(freeFlowDriveMins * (speedFactor - 1));
    const tunnelDelay = baseEval.crossing ? Math.max(0, baseEval.crossing.travelMins - 4) : 0;
    trafficDelayMins = Math.max(0, rawTrafficMins + tunnelDelay);
    totalEtaMins = freeFlowDriveMins + trafficDelayMins + queueWaitMins;
  }

  const geometryCoords =
    unifiedGeometry && unifiedGeometry.coordinates.length >= 2
      ? unifiedGeometry.coordinates
      : buildFallbackStreetGeometry(originCoords, destCoords, tunnels);

  // Cost Calculation
  let parkingFeeHk = 0;
  let promoApplied = false;
  if (carpark) {
    const rawHourly = carpark.hourlyFeeHk * parkingHours;
    const promoMatch = carpark.dayParkPromo.match(/HK\$(\d+)/);
    const promoCap = promoMatch ? parseInt(promoMatch[1], 10) : null;
    if (parkingHours >= 4 && promoCap && promoCap < rawHourly) {
      parkingFeeHk = promoCap;
      promoApplied = true;
    } else {
      parkingFeeHk = rawHourly;
    }
  } else if (meter) {
    parkingFeeHk = Math.round(meter.ratePer15MinHk * 4 * parkingHours);
  }

  let evRatePerKwhHk = 0;
  let evChargingFeeHk = 0;
  let estimatedChargeMins = 0;

  if (carpark && carpark.evInfo.hasEv && chargingKwh > 0) {
    evRatePerKwhHk = parseEvTariffPerKwh(carpark.evInfo.tariffHk);
    evChargingFeeHk = Math.round(evRatePerKwhHk * chargingKwh);
    const effectiveKw =
      carpark.evInfo.dcAvailable > 0 && carpark.evInfo.dcMaxKw > 0
        ? carpark.evInfo.dcMaxKw * 0.78
        : Math.max(7, carpark.evInfo.acMaxKw * 0.9);
    estimatedChargeMins = Math.max(5, Math.round((chargingKwh / effectiveKw) * 60));
  }

  const tunnelTollHk = baseEval.crossing ? baseEval.crossing.tollHk : 0;
  const totalEstimatedCostHk = parkingFeeHk + evChargingFeeHk + tunnelTollHk;

  // Build steps breakdown
  let steps: RouteStepInstruction[] = [];

  if (isGoogle && unifiedGeometry?.steps && unifiedGeometry.steps.length > 0) {
    steps = unifiedGeometry.steps.map((st, i) => ({
      stepIndex: i + 1,
      instructionZh: st.instruction,
      instructionSc: st.instruction,
      instructionEn: st.instruction,
      distanceKm: Number((st.distanceMeters / 1000).toFixed(2)),
      durationMins: Math.max(1, Math.round(st.durationSeconds / 60)),
      roadSpeedKmh: adjacentSpeed,
      trafficStatus: 'good',
    }));

    // Add final parking entrance step
    steps.push({
      stepIndex: steps.length + 1,
      instructionZh:
        queueWaitMins > 0
          ? `抵達 ${pickLocaleText(locale, destNameZh, destNameSc, destNameEn)} 入口（預計排隊等候約 ${queueWaitMins} 分鐘）`
          : `直達 ${pickLocaleText(locale, destNameZh, destNameSc, destNameEn)}（入口暢順免排隊）`,
      instructionSc:
        queueWaitMins > 0
          ? `抵达 ${destNameSc} 入口（预计排队等候约 ${queueWaitMins} 分钟）`
          : `直达 ${destNameSc}（入口畅顺免排队）`,
      instructionEn:
        queueWaitMins > 0
          ? `Arrive at ${destNameEn} entrance (~${queueWaitMins}m queue wait)`
          : `Arrive at ${destNameEn} (Smooth zero-queue entry)`,
      distanceKm: 0.1,
      durationMins: Math.max(1, queueWaitMins || 1),
      roadSpeedKmh: adjacentSpeed,
      trafficStatus: queueWaitMins > 0 ? 'bad' : 'good',
    });
  } else {
    // 3-step hybrid summary route breakdown
    steps = [
      {
        stepIndex: 1,
        instructionZh: '由你的 GPS 當前位置出發，沿主幹道前往目標區域',
        instructionSc: '由你的 GPS 当前位置出发，沿主干道前往目标区域',
        instructionEn: 'Depart from your live GPS location via primary arterial road',
        distanceKm: Number((roadDistanceKm * 0.45).toFixed(2)),
        durationMins: Math.max(1, Math.round(freeFlowDriveMins * 0.45)),
        roadSpeedKmh: 42,
        trafficStatus: 'good',
      },
    ];

    if (baseEval.crossing) {
      steps.push({
        stepIndex: 2,
        instructionZh: `經 ${baseEval.crossing.tunnel.nameZh} 過海（即時過海行車約 ${baseEval.crossing.travelMins} 分鐘）`,
        instructionSc: `经 ${baseEval.crossing.tunnel.nameSc} 过海（实时过海行车约 ${baseEval.crossing.travelMins} 分钟）`,
        instructionEn: `Cross harbour via ${baseEval.crossing.tunnel.nameEn} (~${baseEval.crossing.travelMins} mins)`,
        distanceKm: Number((roadDistanceKm * 0.3).toFixed(2)),
        durationMins: baseEval.crossing.travelMins,
        roadSpeedKmh: baseEval.crossing.tunnel.toHkStatus === 'bad' ? 18 : 34,
        trafficStatus: baseEval.crossing.directionToHk
          ? baseEval.crossing.tunnel.toHkStatus
          : baseEval.crossing.tunnel.toKlnStatus,
      });
    } else {
      steps.push({
        stepIndex: 2,
        instructionZh: carpark
          ? `駛入 ${carpark.adjacentRoadNameZh}`
          : '駛入目標街區路段',
        instructionSc: carpark
          ? `驶入 ${carpark.adjacentRoadNameSc}`
          : '驶入目标街区路段',
        instructionEn: carpark
          ? `Continue onto ${carpark.adjacentRoadNameEn}`
          : 'Continue onto target street block',
        distanceKm: Number((roadDistanceKm * 0.38).toFixed(2)),
        durationMins: Math.max(1, Math.round(freeFlowDriveMins * 0.4 + trafficDelayMins)),
        roadSpeedKmh: adjacentSpeed,
        trafficStatus: baseEval.trafficCondition,
      });
    }

    steps.push({
      stepIndex: 3,
      instructionZh:
        queueWaitMins > 0
          ? `抵達 ${pickLocaleText(locale, destNameZh, destNameSc, destNameEn)} 入口（預計排隊等候約 ${queueWaitMins} 分鐘）`
          : `直達 ${pickLocaleText(locale, destNameZh, destNameSc, destNameEn)}（入口暢順免排隊）`,
      instructionSc:
        queueWaitMins > 0
          ? `抵达 ${destNameSc} 入口（预计排队等候约 ${queueWaitMins} 分钟）`
          : `直达 ${destNameSc}（入口畅顺免排队）`,
      instructionEn:
        queueWaitMins > 0
          ? `Arrive at ${destNameEn} entrance (~${queueWaitMins}m queue wait)`
          : `Arrive at ${destNameEn} (Smooth zero-queue entry)`,
      distanceKm: Number((roadDistanceKm * 0.17).toFixed(2)),
      durationMins: Math.max(1, Math.round(freeFlowDriveMins * 0.15) + queueWaitMins),
      roadSpeedKmh: adjacentSpeed,
      trafficStatus: queueWaitMins > 0 ? 'bad' : 'good',
    });
  }

  return {
    originCoords,
    destinationCoords: destCoords,
    destinationNameZh: destNameZh,
    destinationNameSc: destNameSc,
    destinationNameEn: destNameEn,
    geometryCoords,
    roadDistanceKm: Number(roadDistanceKm.toFixed(2)),
    freeFlowDriveMins,
    trafficDelayMins,
    entranceQueueMins: queueWaitMins,
    totalEtaMins,
    averageRouteSpeedKmh: baseEval.effectiveSpeedKmh,
    trafficCondition: baseEval.trafficCondition,
    crossHarbourTunnel: baseEval.crossing
      ? {
          used: true,
          tunnelNameZh: baseEval.crossing.tunnel.shortZh,
          tunnelNameSc: baseEval.crossing.tunnel.shortSc,
          tunnelNameEn: baseEval.crossing.tunnel.shortEn,
          tunnelTravelMins: baseEval.crossing.travelMins,
          tollHk: baseEval.crossing.tollHk,
        }
      : null,
    costBreakdown: {
      durationHours: parkingHours,
      chargingKwh,
      parkingFeeHk,
      evChargingFeeHk,
      evRatePerKwhHk,
      estimatedChargeMins,
      tunnelTollHk,
      totalEstimatedCostHk,
      promoApplied,
    },
    steps,
    isRealOsrmGeometry: Boolean(unifiedGeometry && unifiedGeometry.coordinates.length >= 2),
    routingProvider: unifiedGeometry?.provider || 'fallback_geometry',
    routeSummary: unifiedGeometry?.routeSummary,
    googleError: unifiedGeometry?.googleError,
  };
}

