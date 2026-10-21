import React from 'react';
import {
  Mail,
  ExternalLink,
  Zap,
  Layers,
  Camera,
  ShieldAlert,
  ArrowLeft,
  Cpu,
  Database,
  Award,
  CheckCircle2,
  Compass,
  Sparkles,
  Navigation,
  FileCode,
} from 'lucide-react';
import { LocaleKey, pickLocaleText } from '../data/hkParkingData';

interface AboutSubPageProps {
  locale: LocaleKey;
  onClose: () => void;
}

export const AboutSubPage: React.FC<AboutSubPageProps> = ({ locale, onClose }) => {
  return (
    <div className="absolute inset-0 z-40 bg-slate-950/96 backdrop-blur-xl overflow-y-auto custom-scrollbar text-slate-100 select-text">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8 sm:py-12 space-y-8">
        {/* Top Sub-Page Navigation Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/90 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-400/20 to-blue-600/30 border border-cyan-400/50 flex items-center justify-center shadow-lg shadow-cyan-500/10">
              <Zap className="w-5 h-5 text-cyan-400 fill-cyan-400/30" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-white">
                  {pickLocaleText(
                    locale,
                    '關於 ParkPulse HK · 泊快充 3D',
                    '关于 ParkPulse HK · 泊快充 3D',
                    'About ParkPulse HK · 3D Smart Twin'
                  )}
                </h1>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  v2.4
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {pickLocaleText(
                  locale,
                  '作者簡介 · 系統架構與政府開源數據整合 · 免責聲明',
                  '作者简介 · 系统架构与政府开源数据整合 · 免责声明',
                  'Author Profile · System Architecture & HKSAR Open Data · Legal Disclaimer'
                )}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs flex items-center gap-2 transition-colors shadow-lg shadow-cyan-500/10 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>
              {pickLocaleText(
                locale,
                '返回 3D 實時泊車地圖',
                '返回 3D 实时泊车地图',
                'Back to Live 3D Map'
              )}
            </span>
          </button>
        </div>

        {/* SECTION 1: AUTHOR INTRODUCTION (KEVIN LAU) */}
        <section className="rounded-2xl bg-slate-900/80 border border-slate-800/90 p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute -top-24 -right-24 w-72 h-72 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="space-y-4 max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-300 text-xs font-mono font-semibold">
                <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                <span>
                  {pickLocaleText(
                    locale,
                    '第一部分 · 作者簡介 (ABOUT THE AUTHOR)',
                    '第一部分 · 作者简介 (ABOUT THE AUTHOR)',
                    'PART 01 · ABOUT THE AUTHOR'
                  )}
                </span>
              </div>

              <div className="flex flex-wrap items-baseline gap-3">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  Kevin LAU
                </h2>
                <span className="text-xs font-mono text-slate-400">
                  AI Systems Engineer &amp; Social Work Executive
                </span>
              </div>

              <p className="text-sm text-slate-300 leading-relaxed">
                {pickLocaleText(
                  locale,
                  '劉德基先生是香港明愛服務發展總主任。劉先生擁有超過 20 年社會服務與科技跨領域領導經驗的 AI 系統工程師。他專注於在人工智能（AI）、網絡安全（Cybersecurity）、電腦視覺（Computer Vision）與社會創新影響力（Social Impact）的系統，擅長將複雜的人本與公共服務需求轉化為兼顧私隱保護與實用價值的現代化軟件工程。',
                  '刘德基先生是香港明爱服务发展总主任。刘先生拥有超过 20 年社会服务与科技跨领域领导经验的 AI 系统工程师。他专注于在人工智能（AI）、网络安全（Cybersecurity）、计算机视觉（Computer Vision）与社会创新影响力（Social Impact）的系统，擅长将复杂的人本与公共服务需求转化为兼顾隐私保护与实用价值的现代化软件工程。',
                  'Kevin Lau is the Head of Service Development at Caritas Social Work Services. A Registered Social Worker and AI Systems Engineer with over 20 years of cross-sector leadership experience, he operates at the intersection of artificial intelligence, cybersecurity, computer vision, and social impact. He specializes in engineering production-grade AI pipelines, multi-agent RAG architectures, and resilient civic and mobile applications that translate complex human and community needs into impactful technological solutions.'
                )}
              </p>

              {/* Credentials & Technical Pillars */}
              <div className="pt-1 flex flex-wrap items-center gap-2 text-xs font-mono text-slate-300">
                <span className="px-2.5 py-1 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-orange-400" />
                  <span>MSc in AI (Univ. of Leeds, on going 2027)</span>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-cyan-400" />
                  <span>MSocSc &amp; BSW (HKU 香港大學)</span>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-emerald-400" />
                  <span>BSc in Computing Science (Greenwich)</span>
                </span>
              </div>
            </div>

            {/* Direct Contact & Projects Card */}
            <div className="lg:w-80 shrink-0 rounded-xl bg-slate-950/90 border border-slate-800 p-4 space-y-2.5">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
                {pickLocaleText(locale, '聯絡與項目', '联络与项目', 'Connect')}
              </div>

              {/* Email */}
              <a
                href="mailto:laukevin@caritassws.org.hk"
                className="flex items-center justify-between gap-2.5 p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-cyan-400/50 transition-colors group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-md bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0">
                    <Mail className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-semibold text-white group-hover:text-cyan-300">
                      Kevin LAU
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono truncate">
                      laukevin@caritassws.org.hk
                    </div>
                  </div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-300 shrink-0" />
              </a>

              {/* Caritas LSG & LF AI Navigator */}
              <a
                href="https://caritas-ai-navigator.web.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2.5 p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-blue-400/50 transition-colors group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-md bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0">
                    <Compass className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-semibold text-white group-hover:text-blue-300 truncate">
                      Caritas LSG &amp; LF AI Navigator
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono truncate">
                      caritas-ai-navigator.web.app
                    </div>
                  </div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-300 shrink-0" />
              </a>

              {/* AI tour: Exhibition on the History of the Diocese */}
              <a
                href="https://dio80exhibitai.web.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-2.5 p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-purple-400/50 transition-colors group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-md bg-purple-500/10 border border-purple-500/30 flex items-center justify-center shrink-0">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-semibold text-white group-hover:text-purple-300 truncate">
                      AI tour: Exhibition on Diocese History
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono truncate">
                      dio80exhibitai.web.app
                    </div>
                  </div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-purple-300 shrink-0" />
              </a>
            </div>
          </div>
        </section>

        {/* SECTION 2: APP INTRODUCTION (PURPOSE, FUNCTION & TECH ARCHITECTURE) */}
        <section className="rounded-2xl bg-slate-900/80 border border-slate-800/90 p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-xs font-mono font-semibold">
              <Cpu className="w-3.5 h-3.5" />
              <span>
                {pickLocaleText(
                  locale,
                  '第二部分 · 應用程式目的、功能與技術架構 (APP & TECH STACK)',
                  '第二部分 · 应用程序目的、功能与技术架构 (APP & TECH STACK)',
                  'PART 02 · PURPOSE, FUNCTIONS & TECHNICAL ARCHITECTURE'
                )}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              {pickLocaleText(
                locale,
                '香港全城 3D 泊車與 EV 超充數碼孿生平台',
                '香港全城 3D 泊车与 EV 超充数码孪生平台',
                'Hong Kong Territory-Wide 3D Parking & EV Charging Digital Twin'
              )}
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              {pickLocaleText(
                locale,
                '「ParkPulse HK · 泊快充 3D」旨在解決香港駕駛者日常面對的三大痛點：「去到停車場先知滿位」、「商場入口塞車死鎖排長龍」以及「電動車找不到可用超快充槍」。系統將全港 18 區的室內停車場空位、路邊智能咪錶、EV 充電規格、主動式 GPS 導航與運輸署實時路面快拍整合於單一免安裝的 3D 數碼地圖中。',
                '“ParkPulse HK · 泊快充 3D”旨在解决香港驾驶者日常面对的三大痛点：“去到停车场才知满位”、“商场入口堵车死锁排长龙”以及“电动车找不到可用超快充枪”。系统将全港 18 区的室内停车场空位、路边智能咪表、EV 充电规格、主动式 GPS 导航与运输署实时路面快拍整合于单一免安装的 3D 数码孪生地图中。',
                'ParkPulse HK · 3D is engineered to solve three major daily challenges for Hong Kong drivers: arriving at a carpark only to find it full, getting trapped in mall entrance traffic bottlenecks, and locating available ultra-fast EV chargers. It synthesizes multi-storey carpark vacancies, curbside smart meters, EV specs, proactive GPS navigation, and live Transport Department snapshots across all 18 districts into an install-free, high-performance 3D browser Digital Twin.'
              )}
            </p>
          </div>

          {/* 6-Card Technical & Functional Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Card 1: 3D WebGL Engine */}
            <div className="p-4 rounded-xl bg-slate-950/85 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-cyan-300 font-bold text-sm">
                <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>
                  {pickLocaleText(
                    locale,
                    'OpenFreeMap 3D + MapLibre GL 渲染引擎',
                    'OpenFreeMap 3D + MapLibre GL 渲染引擎',
                    'OpenFreeMap 3D & MapLibre GL WebGL Engine'
                  )}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {pickLocaleText(
                  locale,
                  '採用 MapLibre GL JS v4 硬體加速渲染與 OpenFreeMap Liberty 開源向量圖資（100% 免 API Key），結合 3D 建築物立體擠出（Fill-Extrusion）與響應式車位能量光柱，並透過動態視區空間索引（Viewport BBox Culling）維持 60 FPS 流暢拖拽，支援深淺色雙主題。',
                  '采用 MapLibre GL JS v4 硬件加速渲染与 OpenFreeMap Liberty 开源向量图资（100% 免 API Key），结合 3D 建筑物立体挤出（Fill-Extrusion）与响应式车位能量光柱，并通过动态视区空间索引（Viewport BBox Culling）维持 60 FPS 流畅拖拽，支持深浅色双主题。',
                  'Powered by MapLibre GL JS v4 and OpenFreeMap Liberty open-source vector tiles (100% keyless), rendering 3D building extrusions, responsive 3D vacancy/EV energy pillars, and dynamic viewport bounding-box spatial indexing to guarantee 60 FPS across both Dark Digital Twin and Light map modes.'
                )}
              </p>
            </div>

            {/* Card 2: DATA.GOV.HK Open Data & Dual-Mode */}
            <div className="p-4 rounded-xl bg-slate-950/85 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                <Database className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  {pickLocaleText(
                    locale,
                    '政府資料一線通 (DATA.GOV.HK) 與雙模韌性架構',
                    '政府资料一线通 (DATA.GOV.HK) 与双模韧性架构',
                    'DATA.GOV.HK Open Data & Dual-Mode Resilience'
                  )}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {pickLocaleText(
                  locale,
                  '串接運輸署香港出行易（HKeMobility）室內停車場即時空位 API、全港 20,699 個路邊智能咪錶（HKeMeter）即時感應數據及主要幹道車速，並配備 Mode A（Edge 實時代理快取）與 Mode B（高擬真交通物理模擬引擎）雙模無縫容災切換。',
                  '串接运输署香港出行易（HKeMobility）室内停车场实时空位 API、全港 20,699 个路边智能咪表（HKeMeter）实时感应数据及主要干道车速，并配备 Mode A（Edge 实时代理缓存）与 Mode B（高拟真交通物理模拟引擎）双模无缝容灾切换。',
                  'Integrates HKSAR Transport Department HKeMobility multi-storey carpark vacancy APIs, territory-wide 20,699 HKeMeter curbside sensor feeds, and strategic road speeds, engineered with Mode A (Live Edge Proxy) and Mode B (high-fidelity simulation fallback) for resilient uptime.'
                )}
              </p>
            </div>

            {/* Card 3: Live TD Traffic CCTV & Harbour Tunnels */}
            <div className="p-4 rounded-xl bg-slate-950/85 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                <Camera className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  {pickLocaleText(
                    locale,
                    '運輸署實時路面 CCTV 快拍與三隧過海監測',
                    '运输署实时路面 CCTV 快拍与三隧过海监测',
                    'Live TD Traffic CCTV Snapshots & Harbour Tunnels'
                  )}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {pickLocaleText(
                  locale,
                  '直連運輸署全港官方閉路電視快拍系統（tdcctv.data.one.gov.hk），經由後端 Edge 記憶體快取加速載入，讓駕駛者出發前直擊海港城、時代廣場等商場入口及紅隧、東隧、西隧最新車龍，並同步顯示三隧即時行車時間指示（JTI）。',
                  '直连运输署全港官方闭路电视快拍系统（tdcctv.data.one.gov.hk），经由后端 Edge 内存缓存加速加载，让驾驶者出发前直击海港城、时代广场等商场入口及红隧、东隧、西隧最新车龙，并同步显示三隧即时行车时间指示（JTI）。',
                  'Streams official Transport Department traffic camera JPEG snapshots (tdcctv.data.one.gov.hk) with server-side in-memory caching to eliminate latency, letting drivers visually verify mall entrance queues alongside live Cross-Harbour (CHT / EHC / WHC) Journey Time Indicators.'
                )}
              </p>
            </div>

            {/* Card 4: Queue Jam Algorithm & EV Fast Charging */}
            <div className="p-4 rounded-xl bg-slate-950/85 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-purple-300 font-bold text-sm">
                <Zap className="w-4 h-4 text-purple-400 shrink-0" />
                <span>
                  {pickLocaleText(
                    locale,
                    '車場門口排隊避坑演算法與 EV 超快充篩選',
                    '车场门口排队避坑算法与 EV 超快充筛选',
                    'Entrance Queue Jam Algorithm & EV Fast Charging'
                  )}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {pickLocaleText(
                  locale,
                  '首創「車位空缺 (<5位) × 入口幹道車速 (<20km/h)」交叉分析演算法，在車龍溢出幹道前主動預警門口排隊並推算等候時間；支援一鍵篩選 DC 120–250kW 超快充（相容 CCS2 / GB/T / CHAdeMO）與 AC 7–22kW 中速充電槍。',
                  '首创“车位空缺 (<5位) × 入口干道车速 (<20km/h)”交叉分析算法，在车龙溢出干道前主动预警门口排队并推算等候时间；支持一键筛选 DC 120–250kW 超快充（兼容 CCS2 / GB/T / CHAdeMO）与 AC 7–22kW 中速充电枪。',
                  'Cross-analyzes remaining parking bays (<5) against adjacent strategic road speeds (<20 km/h) to anticipate entrance queues before drivers get trapped, while dynamically isolating DC 120–250kW Superchargers (CCS2 / GB/T / CHAdeMO) from AC 7–22kW medium chargers.'
                )}
              </p>
            </div>

            {/* Card 5: Proactive GPS Copilot & Routing */}
            <div className="p-4 rounded-xl bg-slate-950/85 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-blue-300 font-bold text-sm">
                <Navigation className="w-4 h-4 text-blue-400 shrink-0" />
                <span>
                  {pickLocaleText(
                    locale,
                    '主動式 GPS 副駕與雙軌路徑規劃引擎',
                    '主动式 GPS 副驾与双轨路径规划引擎',
                    'Proactive GPS Copilot & Dual Routing Engine'
                  )}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {pickLocaleText(
                  locale,
                  '配備雙通（Dual-pass）瀏覽器 GPS 定位與香港邊界校驗，支援駕駛者意圖切換（室內停車場 / EV 超快充 / 路邊咪錶），綜合距離、剩餘車位與塞車代價推薦最優目標；結合 Google Maps Platform Routes API v2 與 OSRM 開源引擎提供雙軌導航。',
                  '配备双通（Dual-pass）浏览器 GPS 定位与香港边界校验，支持驾驶者意图切换（室内停车场 / EV 超快充 / 路边咪表），综合距离、剩余车位与堵车代价推荐最优目标；结合 Google Maps Platform Routes API v2 与 OSRM 开源引擎提供双轨导航。',
                  'Features dual-pass browser geolocation with territorial Hong Kong boundary filtering, multi-intent recommendation ranking (Carpark / EV Supercharge / Smart Meter), and turn-by-turn routing powered by Google Maps Platform Routes API v2 with an OSRM traffic-weighted fallback.'
                )}
              </p>
            </div>

            {/* Card 6: Smart Meter Corridors & Single-File Portable Export */}
            <div className="p-4 rounded-xl bg-slate-950/85 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-indigo-300 font-bold text-sm">
                <FileCode className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>
                  {pickLocaleText(
                    locale,
                    '咪錶走廊聚類分組與單檔 HTML 離線導出',
                    '咪表走廊聚类分组与单档 HTML 离线导出',
                    'Smart Meter Corridors & Single-File Portable Export'
                  )}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {pickLocaleText(
                  locale,
                  '將全港 20,699 個路邊咪錶車位按街道走廊與咪錶柱智能聚類，支援私家車、貨車及巴士車型篩選；並內建單檔 HTML 離線導出引擎，一鍵將全港 3D 數碼地圖、即時空位圖資與 CCTV 閉路電視打包為完全免安裝、離線可獨立運行的單一檔案。',
                  '将全港 20,699 个路边咪表车位按街道走廊与咪表柱智能聚类，支持私家车、货车及巴士车型筛选；并内建单档 HTML 离线导出引擎，一键将全港 3D 数码孪生地图、即时空位图资与 CCTV 闭路电视打包为完全免安装、离线可独立运行的单一文件。',
                  'Clusters 20,699 curbside bays into corridor groups and meter poles with vehicle-type filters (Cars, Goods Vehicles, Coaches), alongside an in-browser Single-File HTML exporter that compiles the complete 3D digital twin, telemetry, and camera snapshots into a zero-install portable bundle.'
                )}
              </p>
            </div>
          </div>
        </section>

        {/* SECTION 3: LEGAL DISCLAIMER (免責聲明) */}
        <section className="rounded-2xl bg-rose-950/25 border border-rose-500/40 p-6 sm:p-8 shadow-xl space-y-3">
          <div className="flex items-center gap-2.5 text-rose-300 font-bold text-base">
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" />
            <h2>
              {pickLocaleText(
                locale,
                '第三部分 · 免責聲明與使用條款 (LEGAL DISCLAIMER)',
                '第三部分 · 免责声明与使用条款 (LEGAL DISCLAIMER)',
                'PART 03 · LEGAL DISCLAIMER & TERMS OF USE'
              )}
            </h2>
          </div>

          <div className="space-y-2.5 text-xs sm:text-sm text-slate-300 leading-relaxed">
            <p className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>
                {pickLocaleText(
                  locale,
                  '僅供技術展示與學術研究用途：本應用程式（ParkPulse HK · 泊快充 3D）純屬智能城市 3D 數碼技術展示（Demonstration & Prototype Purpose Only）及介面研究作品，並非官方交通導航或收費結算系統。',
                  '仅供技术展示与学术研究用途：本应用程序（ParkPulse HK · 泊快充 3D）纯属智慧城市 3D 数码孪生技术展示（Demonstration & Prototype Purpose Only）及界面研究作品，并非官方交通导航或收费结算系统。',
                  'For Demonstration & Prototyping Purposes Only: This application (ParkPulse HK · 3D) is developed strictly as a technical demonstration and smart-city UI/UX prototype. It is not an official government traffic control or commercial billing system.'
                )}
              </span>
            </p>
            <p className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>
                {pickLocaleText(
                  locale,
                  '資料準確性不作保證：本系統結合香港特區政府「資料一線通 (DATA.GOV.HK)」公開數據以及內置高擬真模擬數據（Simulated Fallback Data）。作者（Kevin LAU）並不保證本應用程式內所載之車位數量、咪錶狀態、充電樁空缺、時租收費、行車速度或 CCTV 影像之即時性、準確性、完整性或可靠性。',
                  '数据准确性不作保证：本系统结合香港特区政府“资料一线通 (DATA.GOV.HK)”公开数据以及内置高拟真模拟数据（Simulated Fallback Data）。作者（Kevin LAU）并不保证本应用程序内所载之车位数量、咪表状态、充电桩空缺、时租收费、行车速度或 CCTV 影像之实时性、准确性、完整性或可靠性。',
                  'No Guarantee of Accuracy: While this app incorporates public open feeds from HKSAR DATA.GOV.HK alongside synthetic simulation telemetry, the author (Kevin LAU) makes no representations or warranties of any kind regarding the accuracy, completeness, timeliness, or reliability of any parking vacancy, EV charger status, tariff, road speed, or CCTV image displayed.'
                )}
              </span>
            </p>
            <p className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>
                {pickLocaleText(
                  locale,
                  '法律責任豁免：在任何情況下，作者均無須就任何人士因使用、信賴或無法使用本應用程式所提供的資訊而直接或間接引致的任何損失、延誤、交通違例、行程變更或任何法律及財務責任承擔任何賠償或法律責任。駕駛者請務必以現場實際交通標誌及道路情況為準，並切勿在駕駛期間操作手機。',
                  '法律责任豁免：在任何情况下，作者均无须就任何人士因使用、信赖或无法使用本应用程序所提供的信息而直接或间接引致的任何损失、延误、交通违例、行程变更或任何法律及财务责任承担任何赔偿或法律责任。驾驶者请务必以现场实际交通标志及道路情况为准，并切勿在驾驶期间操作手机。',
                  'Limitation of Legal Liability: Under no circumstances shall the author bear any legal, civil, or financial liability for any direct, indirect, incidental, or consequential loss, delay, traffic fine, or damages arising from the use of or reliance upon this application. Drivers must always obey actual on-site road signs and never operate mobile devices while driving.'
                )}
              </span>
            </p>
          </div>
        </section>

        {/* Organization / Service Development Logo */}
        <div className="pt-2 flex flex-col items-center justify-center">
          <div className="inline-flex items-center justify-center px-4 py-2.5 sm:px-6 sm:py-3 rounded-2xl bg-white/95 shadow-xl shadow-black/40 border border-slate-200/40 transition-all hover:bg-white">
            <img
              src="/assets/aistudio/Service_Development_logo_transparancy_backgound___1__c1bd6957.png"
              alt="明愛社會工作服務部 (服務發展) · Caritas Social Work Services (Service Development)"
              className="h-9 sm:h-12 w-auto object-contain"
              loading="lazy"
            />
          </div>
        </div>

        {/* Bottom Footer Bar */}
        <footer className="pt-2 pb-6 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 border-t border-slate-900">
          <div>
            © {new Date().getFullYear()} Kevin LAU · ParkPulse HK · 泊快充 3D
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="mailto:laukevin@caritassws.org.hk"
              className="hover:text-cyan-400 transition-colors font-mono"
            >
              laukevin@caritassws.org.hk
            </a>
            <span>·</span>
            <a
              href="https://caritas-ai-navigator.web.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-blue-400 transition-colors"
            >
              Caritas AI Navigator
            </a>
            <span>·</span>
            <a
              href="https://dio80exhibitai.web.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-purple-400 transition-colors"
            >
              Diocese History AI Tour
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
};
