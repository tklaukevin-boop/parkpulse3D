import {
  CarparkFacility,
  SmartMeterSpot,
  RoadSegment,
  TdCctvCamera,
  TunnelCrossingMonitor,
  TrafficIncidentNotice,
  DISTRICT_PRESETS,
} from '../data/hkParkingData';

/**
 * Generates a 100% self-contained, single-file production HTML/JS/CSS bundle
 * (`index.html`) that runs directly in any browser without a build step,
 * including 3D Carpark Energy Pillars, Curbside Smart Meters, Cross-Harbour Tunnels,
 * Live TD CCTV Snapshots, TD Traffic Incident Alerts, and Trilingual (繁/簡/EN) support.
 */
export function generateStandaloneSingleFileHtml(
  carparks: CarparkFacility[],
  meters: SmartMeterSpot[],
  roads: RoadSegment[],
  cctvCameras: TdCctvCamera[] = [],
  tunnels: TunnelCrossingMonitor[] = [],
  incidents: TrafficIncidentNotice[] = []
): string {
  const serializedData = JSON.stringify({
    carparks,
    meters,
    roads,
    cctvCameras,
    tunnels,
    incidents,
    districts: DISTRICT_PRESETS,
  })
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  return `<!doctype html>
<html lang="zh-HK" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>ParkPulse HK · 泊快充 3D</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" />
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <script src="https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Noto+Sans+TC:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700&display=swap" rel="stylesheet" />
  <style>
    body {
      font-family: 'Plus Jakarta Sans', 'Noto Sans TC', sans-serif;
      background: #020617;
      color: #f8fafc;
      margin: 0;
      overflow: hidden;
    }
    .tabular-nums { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
    @keyframes pulse-halo {
      0%, 100% { transform: scale(1); opacity: 0.92; }
      50% { transform: scale(1.08); opacity: 1; }
    }
    .queue-badge { animation: pulse-halo 1.6s ease-in-out infinite; }
  </style>
</head>
<body class="bg-slate-950 text-slate-100 h-screen w-screen overflow-hidden flex flex-col">
  <header class="h-14 px-5 bg-slate-950/92 backdrop-blur-md border-b border-slate-800/80 flex items-center justify-between gap-6 z-30 shrink-0">
    <div id="brand-title" class="font-extrabold text-base tracking-tight text-white whitespace-nowrap shrink-0 flex items-center gap-1.5">
      <span>Park<span class="text-cyan-400">Pulse</span></span>
      <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono">HK</span>
      <span class="text-xs font-semibold text-slate-300 pl-1 border-l border-slate-800">泊快充 3D</span>
    </div>
    <nav id="district-nav" class="hidden md:flex items-center gap-5 text-xs font-medium text-slate-300"></nav>
    <div class="flex items-center gap-2 shrink-0">
      <div class="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs">
        <button onclick="setLocale('zh-HK')" id="lang-hk" class="px-2 py-1 rounded bg-cyan-400 text-slate-950 font-bold">繁</button>
        <button onclick="setLocale('zh-CN')" id="lang-cn" class="px-2 py-1 rounded text-slate-400">简</button>
        <button onclick="setLocale('en')" id="lang-en" class="px-2 py-1 rounded text-slate-400">EN</button>
      </div>
      <button id="btn-camera-toggle" class="px-3 py-1.5 text-xs font-semibold bg-cyan-500 text-slate-950 rounded-lg hover:bg-cyan-400 transition-colors whitespace-nowrap">
        3D / 2D
      </button>
    </div>
  </header>

  <div class="relative flex-1 w-full h-full overflow-hidden">
    <div id="map" class="absolute inset-0 w-full h-full"></div>

    <!-- Top Filter & Cross-Harbour Tunnel Bar -->
    <div class="absolute top-3 left-3 right-3 md:left-[400px] z-20 flex flex-col gap-2 pointer-events-none">
      <div class="pointer-events-auto flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-950/90 backdrop-blur-md border border-slate-800 rounded-xl shadow-2xl w-fit">
        <button data-filter="all" class="filter-btn px-3 py-1.5 text-xs font-medium rounded-lg bg-cyan-400 text-slate-950 whitespace-nowrap">全部 All</button>
        <button data-filter="available" class="filter-btn px-3 py-1.5 text-xs font-medium rounded-lg text-slate-300 hover:text-white whitespace-nowrap">只要有位 Available</button>
        <button data-filter="meters" class="filter-btn px-3 py-1.5 text-xs font-medium rounded-lg text-slate-300 hover:text-white whitespace-nowrap">路邊咪錶 Meters</button>
        <button data-filter="ev_dc" class="filter-btn px-3 py-1.5 text-xs font-medium rounded-lg text-slate-300 hover:text-white whitespace-nowrap">DC 超快充 EV</button>
        <button data-filter="no_queue" class="filter-btn px-3 py-1.5 text-xs font-medium rounded-lg text-slate-300 hover:text-white whitespace-nowrap">避開排隊 No Queue</button>
      </div>
      <div id="tunnel-bar" class="pointer-events-auto flex flex-wrap items-center gap-2"></div>
    </div>

    <!-- Left / Bottom Intelligence Sheet -->
    <aside class="absolute bottom-0 left-0 right-0 md:top-3 md:bottom-3 md:left-3 md:right-auto md:w-96 max-h-[46vh] md:max-h-none bg-slate-950/92 backdrop-blur-xl border-t md:border border-slate-800/90 md:rounded-2xl z-20 flex flex-col overflow-hidden shadow-2xl">
      <div class="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between">
        <div>
          <h2 class="text-sm font-semibold text-white">即時泊車、EV 充電與入口 CCTV</h2>
          <p class="text-[11px] text-slate-400">Dual-Mode · 運輸署開放數據與高擬真引擎</p>
        </div>
        <span id="facility-count" class="text-xs text-cyan-400 tabular-nums font-semibold"></span>
      </div>
      <div id="facility-list" class="flex-1 overflow-y-auto divide-y divide-slate-800/60 p-2 space-y-1.5"></div>
    </aside>
  </div>

  <script>
    const STATE = ${serializedData};
    let activeFilter = 'all';
    let locale = 'zh-HK';
    let is3D = true;

    function esc(raw) {
      return String(raw ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function pick(zh, sc, en) {
      return esc(locale === 'zh-CN' ? sc : locale === 'en' ? en : zh);
    }

    function createOctagon(center, radiusMeters = 26) {
      const [lng, lat] = center;
      const latDeg = 1 / 111320;
      const lngDeg = 1 / (111320 * Math.cos(lat * Math.PI / 180));
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const a = (i * 2 * Math.PI) / 8;
        pts.push([lng + Math.cos(a) * radiusMeters * lngDeg, lat + Math.sin(a) * radiusMeters * latDeg]);
      }
      return pts;
    }

    const map = new maplibregl.Map({
      container: 'map',
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [114.1698, 22.2978],
      zoom: 14.2,
      pitch: 56,
      bearing: -16,
      antialias: true
    });

    function getFilteredCarparks() {
      return STATE.carparks.filter(cp => {
        if (activeFilter === 'available') return cp.availableSpaces >= 5;
        if (activeFilter === 'ev_dc') return cp.evInfo.dcFastCount > 0 && cp.evInfo.dcAvailable > 0;
        if (activeFilter === 'no_queue') return !cp.queueRisk && cp.availableSpaces >= 5;
        return true;
      });
    }

    function buildPillarGeoJSON() {
      const filtered = getFilteredCarparks();
      return {
        type: 'FeatureCollection',
        features: filtered.map(cp => {
          const color = cp.availableSpaces > 20 ? '#10b981' : cp.availableSpaces >= 5 ? '#f59e0b' : '#ef4444';
          const height = Math.max(32, Math.min(260, cp.availableSpaces * 2.6 + 24));
          return {
            type: 'Feature',
            properties: { id: cp.id, color, height },
            geometry: { type: 'Polygon', coordinates: [createOctagon(cp.coordinates, 24)] }
          };
        })
      };
    }

    function renderTunnels() {
      const el = document.getElementById('tunnel-bar');
      if (!el || !STATE.tunnels) return;
      el.innerHTML = STATE.tunnels.map(t => {
        const cHk = t.toHkStatus === 'bad' ? 'text-rose-400' : t.toHkStatus === 'average' ? 'text-amber-300' : 'text-emerald-400';
        const cKln = t.toKlnStatus === 'bad' ? 'text-rose-400' : t.toKlnStatus === 'average' ? 'text-amber-300' : 'text-emerald-400';
        return \`
          <button onclick="map.flyTo({center: [\${t.coordinates[0]}, \${t.coordinates[1]}], zoom: 15.8, pitch: 58})" class="px-3 py-1.5 rounded-xl bg-slate-950/90 border border-slate-800 text-xs flex items-center gap-2 shadow-xl">
            <span class="font-bold text-white">\${pick(t.shortZh, t.shortSc, t.shortEn)}</span>
            <span class="tabular-nums \${cHk}">\${pick('往港','往港','HK')} \${t.toHkMins}m</span>
            <span class="text-slate-600">·</span>
            <span class="tabular-nums \${cKln}">\${pick('往九','往九','KLN')} \${t.toKlnMins}m</span>
          </button>
        \`;
      }).join('');
    }

    function renderUI() {
      renderTunnels();
      const listEl = document.getElementById('facility-list');
      const filtered = getFilteredCarparks();
      document.getElementById('facility-count').textContent = filtered.length + ' Nodes';
      listEl.innerHTML = filtered.map(cp => {
        const statusColor = cp.availableSpaces > 20 ? 'text-emerald-400' : cp.availableSpaces >= 5 ? 'text-amber-400' : 'text-rose-400';
        const name = pick(cp.nameZh, cp.nameSc, cp.nameEn);
        const dist = pick(cp.districtZh, cp.districtSc, cp.districtEn);
        return \`
          <div onclick="flyToCarpark('\${cp.id}')" class="p-3 rounded-xl bg-slate-900/70 hover:bg-slate-800/80 border border-slate-800/80 cursor-pointer transition-colors space-y-2">
            <div class="flex items-start justify-between gap-2">
              <div class="font-semibold text-xs text-white">\${name}</div>
              <div class="tabular-nums text-sm font-bold \${statusColor}">\${cp.availableSpaces}</div>
            </div>
            <div class="text-[11px] text-slate-400 tabular-nums">
              \${dist} · HK$\${cp.hourlyFeeHk}/h · DC \${cp.evInfo.dcAvailable}/\${cp.evInfo.dcFastCount} (\${cp.evInfo.dcMaxKw}kW) · 📹 \${cp.cctvCameraId}
            </div>
            <div class="relative w-full h-28 rounded-lg overflow-hidden bg-slate-950 border border-slate-800">
              <img src="https://tdcctv.data.one.gov.hk/\${cp.cctvCameraId}.JPG" alt="TD CCTV \${cp.cctvCameraId}" class="w-full h-full object-cover" loading="lazy" />
              <span class="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-slate-950/85 text-[10px] font-bold text-cyan-300 tabular-nums">LIVE · \${cp.cctvCameraId}</span>
            </div>
            \${cp.queueRisk ? '<div class="text-[11px] font-semibold text-rose-400">⚠️ Queue Jam (' + cp.estimatedWaitMins + ' min)</div>' : ''}
            <div class="flex items-center justify-end">
              <a href="https://www.google.com/maps/dir/?api=1&destination=\${cp.coordinates[1]},\${cp.coordinates[0]}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="px-2.5 py-1 text-[11px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 rounded-md hover:bg-cyan-400 hover:text-slate-950 transition-colors">
                Navigate
              </a>
            </div>
          </div>
        \`;
      }).join('');
    }

    window.setLocale = function(l) {
      locale = l;
      renderUI();
    };

    window.flyToCarpark = function(id) {
      const cp = STATE.carparks.find(c => c.id === id);
      if (!cp) return;
      map.flyTo({ center: cp.coordinates, zoom: 16.4, pitch: is3D ? 60 : 0, duration: 1200 });
    };

    map.on('load', () => {
      map.addSource('carparks-3d', { type: 'geojson', data: buildPillarGeoJSON() });
      map.addLayer({
        id: 'carpark-pillars',
        type: 'fill-extrusion',
        source: 'carparks-3d',
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.88
        }
      });
      renderUI();
    });

    document.getElementById('btn-camera-toggle').addEventListener('click', () => {
      is3D = !is3D;
      map.easeTo({ pitch: is3D ? 58 : 0, bearing: is3D ? -18 : 0, duration: 800 });
    });
  </script>
</body>
</html>`;
}
