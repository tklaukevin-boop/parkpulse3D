import type { DistrictKey, SmartMeterSpot } from '../data/hkParkingData.ts';

/**
 * Compact Dictionary-Compressed Catalog representing all 20,699 official
 * Hong Kong Transport Department Smart Metered Parking Spaces (HKeMeter / DATA.GOV.HK).
 */
export type CompactCorridorGroupTuple = [
  string, // 0: Region En ("HONG KONG" | "KOWLOON" | "NEW TERRITORIES")
  string, // 1: Region Tc ("香港島" | "九龍" | "新界")
  string, // 2: Region Sc ("香港岛" | "九龙" | "新界")
  string, // 3: District En (18 Official HK Districts)
  string, // 4: District Tc
  string, // 5: District Sc
  string, // 6: SubDistrict En
  string, // 7: SubDistrict Tc
  string, // 8: SubDistrict Sc
  string, // 9: Street En
  string, // 10: Street Tc
  string, // 11: Street Sc
  string, // 12: SectionOfStreet En
  string, // 13: SectionOfStreet Tc
  string, // 14: SectionOfStreet Sc
  string, // 15: VehicleType ("A" | "C" | "G")
  number, // 16: LPP (Longest Parking Period in mins: 30, 60, 120, 240)
  string, // 17: OperatingPeriod code ("D", "A", "B", "H", "J", "3D", etc.)
  number, // 18: TimeUnit (mins, e.g. 15)
  number  // 19: PaymentUnit (HKD per TimeUnit, e.g. 4.0 or 2.0)
];

export type CompactSmartMeterSpotTuple = [
  string, // 0: ParkingSpaceId (e.g. "10006A")
  string, // 1: PoleId (e.g. "10006")
  number, // 2: groupIndex into groups[]
  number, // 3: Longitude (WGS84)
  number  // 4: Latitude (WGS84)
];

export interface CompactSmartMeterCatalog {
  version: string;
  syncedAt: string;
  totalSpots: number;
  totalCorridors: number;
  groups: CompactCorridorGroupTuple[];
  spots: CompactSmartMeterSpotTuple[];
  occupancyString: string; // 'V' = Vacant, 'O' = Occupied, 'U' = Out of Use
}

export interface SmartMeterCorridorSummary {
  corridorKey: string;
  districtKey: Exclude<DistrictKey, 'all'>;
  regionZh: string;
  regionSc: string;
  regionEn: string;
  districtZh: string;
  districtSc: string;
  districtEn: string;
  subDistrictZh: string;
  subDistrictSc: string;
  subDistrictEn: string;
  streetZh: string;
  streetSc: string;
  streetEn: string;
  sectionZh: string;
  sectionSc: string;
  sectionEn: string;
  sectionOfStreetZh: string;
  sectionOfStreetSc: string;
  sectionOfStreetEn: string;
  centerCoordinates: [number, number];
  totalBays: number;
  vacantBays: number;
  occupiedBays: number;
  occupancyRatePct: number;
  occupancyColor: string;
  maxDurationMins: 15 | 30 | 60 | 120 | 240;
  ratePer15MinHk: number;
  operatingHours: string;
  operatingHoursSc: string;
  operatingHoursEn: string;
  vehicleTypeCode: 'A' | 'C' | 'G';
  vehicleTypeZh: string;
  vehicleTypeSc: string;
  vehicleTypeEn: string;
  sampleMeter: SmartMeterSpot;
  sampleSpots: SmartMeterSpot[];
  bays: SmartMeterSpot[];
}

/**
 * Color code a Smart Meter street section dot by its occupancy rate percentage:
 * - >= 80% full: Red (#ef4444)
 * - 50% – 79% full: Amber (#f59e0b)
 * - < 50% full (e.g. 20% full): Green (#00f59b)
 */
export function getSmartMeterOccupancyColor(occupancyRatePct: number): string {
  if (occupancyRatePct >= 80) return '#ef4444';
  if (occupancyRatePct >= 50) return '#f59e0b';
  return '#00f59b';
}

/**
 * Decode official Hong Kong Transport Department OperatingPeriod code
 * per TD PSI Metered Parking Spaces Data Specification.
 */
export function decodeTdOperatingPeriod(codeRaw: string): {
  zhHk: string;
  zhCn: string;
  en: string;
} {
  const code = (codeRaw || 'D').trim().toUpperCase();
  const table: Record<string, { zhHk: string; zhCn: string; en: string }> = {
    A: {
      zhHk: '每日 08:00 - 24:00 (包公眾假期) [A]',
      zhCn: '每日 08:00 - 24:00 (包公众假期) [A]',
      en: 'Daily 08:00 - 24:00 (Incl. Holidays) [A]',
    },
    B: {
      zhHk: '星期一至六 08:00 - 20:00 (公眾假期除外) [B]',
      zhCn: '星期一至六 08:00 - 20:00 (公众假期除外) [B]',
      en: 'Mon-Sat 08:00 - 20:00 (Excl. Holidays) [B]',
    },
    D: {
      zhHk: '每日 08:00 - 20:00 (包公眾假期：10:00-20:00) [D]',
      zhCn: '每日 08:00 - 20:00 (包公众假期：10:00-20:00) [D]',
      en: 'Mon-Sat 08:00-20:00; Sun/Hol 10:00-20:00 [D]',
    },
    G: {
      zhHk: '星期一至六 08:00 - 24:00；日及假期 10:00 - 22:00 [G]',
      zhCn: '星期一至六 08:00 - 24:00；日及假期 10:00 - 22:00 [G]',
      en: 'Mon-Sat 08:00-24:00; Sun/Hol 10:00-22:00 [G]',
    },
    H: {
      zhHk: '星期一至六 08:00 - 22:00；日及假期 10:00 - 22:00 [H]',
      zhCn: '星期一至六 08:00 - 22:00；日及假期 10:00 - 22:00 [H]',
      en: 'Mon-Sat 08:00-22:00; Sun/Hol 10:00-22:00 [H]',
    },
    J: {
      zhHk: '星期一至六 08:00 - 24:00 (公眾假期除外) [J]',
      zhCn: '星期一至六 08:00 - 24:00 (公众假期除外) [J]',
      en: 'Mon-Sat 08:00 - 24:00 (Excl. Holidays) [J]',
    },
    P: {
      zhHk: '每日 08:00 - 20:00 (全年無休) [P]',
      zhCn: '每日 08:00 - 20:00 (全年无休) [P]',
      en: 'Daily 08:00 - 20:00 (Incl. Holidays) [P]',
    },
    Q: {
      zhHk: '每日 08:00 - 22:00 (全年無休) [Q]',
      zhCn: '每日 08:00 - 22:00 (全年无休) [Q]',
      en: 'Daily 08:00 - 22:00 (Incl. Holidays) [Q]',
    },
    S: {
      zhHk: '星期一至六 09:00 - 21:00 (公眾假期除外) [S]',
      zhCn: '星期一至六 09:00 - 21:00 (公众假期除外) [S]',
      en: 'Mon-Sat 09:00 - 21:00 (Excl. Holidays) [S]',
    },
    T: {
      zhHk: '每日 10:00 - 22:00 (包公眾假期) [T]',
      zhCn: '每日 10:00 - 22:00 (包公众假期) [T]',
      en: 'Daily 10:00 - 22:00 (Incl. Holidays) [T]',
    },
    '3A': {
      zhHk: '每日 08:00 - 24:00 (特定時段收費) [3A]',
      zhCn: '每日 08:00 - 24:00 (特定时段收费) [3A]',
      en: 'Daily 08:00 - 24:00 (Zone Tariff) [3A]',
    },
    '3B': {
      zhHk: '星期一至六 08:00 - 20:00 [3B]',
      zhCn: '星期一至六 08:00 - 20:00 [3B]',
      en: 'Mon-Sat 08:00 - 20:00 [3B]',
    },
    '3D': {
      zhHk: '每日 08:00 - 20:00 (假日 10:00-20:00) [3D]',
      zhCn: '每日 08:00 - 20:00 (假日 10:00-20:00) [3D]',
      en: 'Mon-Sat 08:00-20:00; Sun/Hol 10:00-20:00 [3D]',
    },
    '3H': {
      zhHk: '每日 08:00 - 22:00 (假日 10:00-22:00) [3H]',
      zhCn: '每日 08:00 - 22:00 (假日 10:00-22:00) [3H]',
      en: 'Mon-Sat 08:00-22:00; Sun/Hol 10:00-22:00 [3H]',
    },
    '4J': {
      zhHk: '星期一至六 08:00 - 24:00 [4J]',
      zhCn: '星期一至六 08:00 - 24:00 [4J]',
      en: 'Mon-Sat 08:00 - 24:00 [4J]',
    },
    '4N': {
      zhHk: '星期一至六 10:00 - 22:00；假日 10:00 - 22:00 [4N]',
      zhCn: '星期一至六 10:00 - 22:00；假日 10:00 - 22:00 [4N]',
      en: 'Daily 10:00 - 22:00 [4N]',
    },
    '4Q': {
      zhHk: '每日 08:00 - 22:00 [4Q]',
      zhCn: '每日 08:00 - 22:00 [4Q]',
      en: 'Daily 08:00 - 22:00 [4Q]',
    },
    '7J': {
      zhHk: '星期一至日 08:00 - 24:00 [7J]',
      zhCn: '星期一至日 08:00 - 24:00 [7J]',
      en: 'Mon-Sun 08:00 - 24:00 [7J]',
    },
  };
  return (
    table[code] ?? {
      zhHk: `標準營運時段 08:00 - 20:00 [${code}]`,
      zhCn: `标准营运时段 08:00 - 20:00 [${code}]`,
      en: `Standard Operating Hours 08:00 - 20:00 [${code}]`,
    }
  );
}

/**
 * Decode official TD VehicleType code ('A' | 'C' | 'G')
 */
export function decodeTdVehicleType(vCodeRaw: string): {
  code: 'A' | 'C' | 'G';
  zhHk: string;
  zhCn: string;
  en: string;
} {
  const upper = (vCodeRaw || 'A').trim().toUpperCase();
  if (upper === 'G') {
    return {
      code: 'G',
      zhHk: 'G類 · 貨車專用咪錶車位',
      zhCn: 'G类 · 货车专用咪表车位',
      en: 'Type G · Goods Vehicles Only',
    };
  }
  if (upper === 'C') {
    return {
      code: 'C',
      zhHk: 'C類 · 旅遊巴 / 巴士專用錶位',
      zhCn: 'C类 · 旅游巴 / 巴士专用表位',
      en: 'Type C · Coaches / Buses Only',
    };
  }
  return {
    code: 'A',
    zhHk: 'A類 · 私家車 / 輕型貨車錶位',
    zhCn: 'A类 · 私家车 / 轻型货车表位',
    en: 'Type A · Private Cars / LGVs',
  };
}

/**
 * Map official TD 18-District & SubDistrict into our regional DistrictKey
 */
export function mapTdDistrictToKey(
  districtEnRaw: string,
  subDistrictEnRaw: string,
  lat: number,
  _lng: number
): Exclude<DistrictKey, 'all'> {
  const dist = (districtEnRaw || '').trim().toUpperCase();
  const sub = (subDistrictEnRaw || '').trim().toUpperCase();

  switch (dist) {
    case 'CENTRAL & WESTERN':
      return 'central';
    case 'WAN CHAI':
      return 'cwb';
    case 'EASTERN':
      return 'eastern';
    case 'SOUTHERN':
      return 'southern';
    case 'YAU TSIM MONG':
      if (
        sub.includes('TSIM SHA TSUI') ||
        sub.includes('JORDAN') ||
        sub.includes('KING') ||
        sub.includes('KOWLOON STATION') ||
        lat < 22.3075
      ) {
        return 'tst';
      }
      return 'mongkok';
    case 'SHAM SHUI PO':
      return 'shamshuipo';
    case 'KOWLOON CITY':
      return 'kowlooncity';
    case 'WONG TAI SIN':
      return 'wongtaisin';
    case 'KWUN TONG':
      return 'kwuntong';
    case 'SHA TIN':
      return 'shatin';
    case 'TSUEN WAN':
      return 'tsuenwan';
    case 'KWAI TSING':
      return 'kwaitsing';
    case 'YUEN LONG':
      return 'yuenlong';
    case 'TUEN MUN':
      return 'tuenmun';
    case 'SAI KUNG':
      return 'tseungkwano';
    case 'TAI PO':
      return 'taipo';
    case 'NORTH':
      return 'north';
    case 'ISLANDS':
      return 'tungchung';
    default:
      return 'central';
  }
}

function normalizeMaxDuration(mins: number): 15 | 30 | 60 | 120 | 240 {
  if (mins <= 15) return 15;
  if (mins <= 30) return 30;
  if (mins <= 60) return 60;
  if (mins <= 120) return 120;
  return 240;
}

/**
 * Unpack the CompactSmartMeterCatalog into full SmartMeterSpot[] objects (~12ms for 20,699 spots).
 */
export function unpackSmartMeterCatalog(catalog: CompactSmartMeterCatalog): SmartMeterSpot[] {
  const { groups, spots, occupancyString } = catalog;
  const decodedGroups = groups.map((g, gIdx) => {
    const [
      regionEn,
      regionZh,
      regionSc,
      districtEn,
      districtZh,
      districtSc,
      subDistrictEn,
      subDistrictZh,
      subDistrictSc,
      streetEn,
      streetZh,
      streetSc,
      sectionEn,
      sectionZh,
      sectionSc,
      vTypeRaw,
      lppMins,
      opCode,
      timeUnitMins,
      paymentUnitHk,
    ] = g;

    const vType = decodeTdVehicleType(vTypeRaw);
    const opInfo = decodeTdOperatingPeriod(opCode);
    const maxDurationMins = normalizeMaxDuration(Number(lppMins) || 60);

    return {
      gIdx,
      regionEn,
      regionZh,
      regionSc,
      districtEn,
      districtZh,
      districtSc,
      subDistrictEn,
      subDistrictZh,
      subDistrictSc,
      streetEn,
      streetZh,
      streetSc,
      sectionOfStreetEn: sectionEn,
      sectionOfStreetZh: sectionZh,
      sectionOfStreetSc: sectionSc,
      vehicleTypeCode: vType.code,
      vehicleTypeZh: vType.zhHk,
      vehicleTypeSc: vType.zhCn,
      vehicleTypeEn: vType.en,
      maxDurationMins,
      operatingCode: opCode,
      operatingHours: opInfo.zhHk,
      operatingHoursSc: opInfo.zhCn,
      operatingHoursEn: opInfo.en,
      timeUnitMins: Number(timeUnitMins) || 15,
      ratePer15MinHk: Number(paymentUnitHk) || 4.0,
    };
  });

  const result: SmartMeterSpot[] = new Array(spots.length);
  for (let i = 0; i < spots.length; i++) {
    const [spaceId, poleId, gIdx, lng, lat] = spots[i];
    const grp = decodedGroups[gIdx] || decodedGroups[0];
    const occChar = occupancyString ? occupancyString.charCodeAt(i) : 86; // 'V' = 86, 'O' = 79, 'U' = 85
    const occupied = occChar === 79 || occChar === 85;
    const meterStatus: 'N' | 'OU' = occChar === 85 ? 'OU' : 'N';
    const districtKey = mapTdDistrictToKey(grp.districtEn, grp.subDistrictEn, lat, lng);

    result[i] = {
      id: spaceId,
      meterPoleId: poleId,
      regionZh: grp.regionZh,
      regionSc: grp.regionSc,
      regionEn: grp.regionEn,
      districtKey,
      districtZh: grp.districtZh,
      districtSc: grp.districtSc,
      districtEn: grp.districtEn,
      subDistrictZh: grp.subDistrictZh,
      subDistrictSc: grp.subDistrictSc,
      subDistrictEn: grp.subDistrictEn,
      streetZh: grp.streetZh,
      streetSc: grp.streetSc,
      streetEn: grp.streetEn,
      sectionOfStreetZh: grp.sectionOfStreetZh,
      sectionOfStreetSc: grp.sectionOfStreetSc,
      sectionOfStreetEn: grp.sectionOfStreetEn,
      coordinates: [lng, lat],
      occupied,
      meterStatus,
      maxDurationMins: grp.maxDurationMins,
      timeUnitMins: grp.timeUnitMins,
      ratePer15MinHk: grp.ratePer15MinHk,
      operatingCode: grp.operatingCode,
      operatingHours: grp.operatingHours,
      operatingHoursSc: grp.operatingHoursSc,
      operatingHoursEn: grp.operatingHoursEn,
      vehicleTypeCode: grp.vehicleTypeCode,
      vehicleTypeZh: grp.vehicleTypeZh,
      vehicleTypeSc: grp.vehicleTypeSc,
      vehicleTypeEn: grp.vehicleTypeEn,
      lastSensorPingSecs: 2 + (i % 19),
      corridorGroupId: gIdx,
    };
  }

  return result;
}

/**
 * Apply lightweight 20KB occupancyString ('V'|'O'|'U') to an existing SmartMeterSpot[] array.
 */
export function applyOccupancyStringToMeters(
  meters: SmartMeterSpot[],
  occupancyString: string
): SmartMeterSpot[] {
  if (!occupancyString || occupancyString.length === 0) return meters;
  const len = Math.min(meters.length, occupancyString.length);
  const next = new Array<SmartMeterSpot>(meters.length);

  for (let i = 0; i < meters.length; i++) {
    const m = meters[i];
    if (i < len) {
      const code = occupancyString.charCodeAt(i);
      const nextOccupied = code === 79 || code === 85;
      const nextStatus: 'N' | 'OU' = code === 85 ? 'OU' : 'N';
      if (m.occupied !== nextOccupied || m.meterStatus !== nextStatus) {
        next[i] = {
          ...m,
          occupied: nextOccupied,
          meterStatus: nextStatus,
          lastSensorPingSecs: 1,
        };
        continue;
      }
    }
    next[i] = m;
  }
  return next;
}

/**
 * Group SmartMeterSpot[] into street sections (one single dot per street section across HK)
 * for clean map visualization, browsing, searching, and 1-click fly-to.
 */
export function aggregateSmartMetersByCorridor(
  meters: SmartMeterSpot[]
): SmartMeterCorridorSummary[] {
  const map = new Map<string, SmartMeterCorridorSummary>();

  for (let i = 0; i < meters.length; i++) {
    const m = meters[i];
    const key = `${m.districtKey}|${m.streetEn}|${m.sectionOfStreetEn || ''}`;
    let entry = map.get(key);
    if (!entry) {
      const baysList: SmartMeterSpot[] = [];
      entry = {
        corridorKey: key,
        districtKey: m.districtKey,
        regionZh: m.regionZh || '香港',
        regionSc: m.regionSc || '香港',
        regionEn: m.regionEn || 'HONG KONG',
        districtZh: m.districtZh,
        districtSc: m.districtSc,
        districtEn: m.districtEn,
        subDistrictZh: m.subDistrictZh || '',
        subDistrictSc: m.subDistrictSc || '',
        subDistrictEn: m.subDistrictEn || '',
        streetZh: m.streetZh,
        streetSc: m.streetSc,
        streetEn: m.streetEn,
        sectionZh: m.sectionOfStreetZh || '',
        sectionSc: m.sectionOfStreetSc || '',
        sectionEn: m.sectionOfStreetEn || '',
        sectionOfStreetZh: m.sectionOfStreetZh || '',
        sectionOfStreetSc: m.sectionOfStreetSc || '',
        sectionOfStreetEn: m.sectionOfStreetEn || '',
        centerCoordinates: m.coordinates,
        totalBays: 0,
        vacantBays: 0,
        occupiedBays: 0,
        occupancyRatePct: 0,
        occupancyColor: '#00f59b',
        maxDurationMins: m.maxDurationMins,
        ratePer15MinHk: m.ratePer15MinHk,
        operatingHours: m.operatingHours,
        operatingHoursSc: m.operatingHoursSc || m.operatingHours,
        operatingHoursEn: m.operatingHoursEn || m.operatingHours,
        vehicleTypeCode: m.vehicleTypeCode || 'A',
        vehicleTypeZh: m.vehicleTypeZh,
        vehicleTypeSc: m.vehicleTypeSc,
        vehicleTypeEn: m.vehicleTypeEn,
        sampleMeter: m,
        sampleSpots: baysList,
        bays: baysList,
      };
      map.set(key, entry);
    }
    entry.totalBays++;
    if (m.occupied) {
      entry.occupiedBays++;
    } else {
      entry.vacantBays++;
      // Prefer a vacant meter as the sampleMeter when flying to the corridor
      if (entry.sampleMeter.occupied) {
        entry.sampleMeter = m;
      }
    }
    entry.bays.push(m);
  }

  // Compute median coordinates and occupancy rate color for each street section
  const list = Array.from(map.values());
  for (const corr of list) {
    if (corr.bays.length > 0) {
      const mid = corr.bays[Math.floor(corr.bays.length / 2)];
      corr.centerCoordinates = mid.coordinates;
    }
    corr.occupancyRatePct = Math.round(
      (corr.occupiedBays / Math.max(1, corr.totalBays)) * 100
    );
    corr.occupancyColor = getSmartMeterOccupancyColor(corr.occupancyRatePct);
  }
  return list;
}
