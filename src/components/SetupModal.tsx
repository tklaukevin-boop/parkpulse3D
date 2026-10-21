import React, { useState } from 'react';
import {
  Settings,
  X,
  Radio,
  RefreshCw,
  Database,
  CheckCircle2,
  Server,
  Zap,
  Layers,
  Activity,
  Sliders,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Moon,
} from 'lucide-react';
import { LocaleKey, QuickFilterKey, EvPowerFilter, pickLocaleText } from '../data/hkParkingData';

interface SetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  locale: LocaleKey;
  dataMode: 'mode_a_edge' | 'mode_b_sim';
  setDataMode: React.Dispatch<React.SetStateAction<'mode_a_edge' | 'mode_b_sim'>>;
  upstreamLive: boolean;
  totalMetersCount: number;
  totalCarparksCount: number;
  totalCctvCount: number;
  onManualPulse: () => void;
  autoLiveTick: boolean;
  setAutoLiveTick: React.Dispatch<React.SetStateAction<boolean>>;
  viewportSyncEnabled: boolean;
  setViewportSyncEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  is3DView: boolean;
  setIs3DView: React.Dispatch<React.SetStateAction<boolean>>;
  quickFilter: QuickFilterKey;
  onSelectQuickFilter: (filter: QuickFilterKey) => void;
  evPowerFilter: EvPowerFilter;
  onSelectEvPowerFilter: (spec: EvPowerFilter) => void;
  mapTheme?: 'light' | 'dark';
  onSelectMapTheme?: (theme: 'light' | 'dark') => void;
}

export const SetupModal: React.FC<SetupModalProps> = ({
  isOpen,
  onClose,
  locale,
  dataMode,
  setDataMode,
  upstreamLive,
  totalMetersCount,
  totalCarparksCount,
  totalCctvCount,
  onManualPulse,
  autoLiveTick,
  setAutoLiveTick,
  viewportSyncEnabled,
  setViewportSyncEnabled,
  is3DView,
  setIs3DView,
  quickFilter,
  onSelectQuickFilter,
  evPowerFilter,
  onSelectEvPowerFilter,
  mapTheme = 'light',
  onSelectMapTheme,
}) => {
  const [isPulsing, setIsPulsing] = useState<boolean>(false);
  const [pulseSuccess, setPulseSuccess] = useState<boolean>(false);

  if (!isOpen) return null;

  const handlePulseClick = () => {
    setIsPulsing(true);
    setPulseSuccess(false);
    onManualPulse();
    setTimeout(() => {
      setIsPulsing(false);
      setPulseSuccess(true);
      setTimeout(() => setPulseSuccess(false), 2500);
    }, 600);
  };

  const currentModeDisplay =
    dataMode === 'mode_b_sim'
      ? pickLocaleText(
          locale,
          `Mode B · 全港 ${totalMetersCount.toLocaleString()} 個咪錶及車流引擎`,
          `Mode B · 全港 ${totalMetersCount.toLocaleString()} 个咪表及车流引擎`,
          `Mode B · ${totalMetersCount.toLocaleString()} HK Meters & Traffic Sim`
        )
      : upstreamLive
      ? pickLocaleText(
          locale,
          `Mode A · DATA.GOV.HK 實時 (${totalMetersCount.toLocaleString()} 咪錶)`,
          `Mode A · DATA.GOV.HK 实时 (${totalMetersCount.toLocaleString()} 咪表)`,
          `Mode A · DATA.GOV.HK Live (${totalMetersCount.toLocaleString()} Meters)`
        )
      : pickLocaleText(
          locale,
          'Mode A · Edge Proxy 實時數據流',
          'Mode A · Edge Proxy 实时数据流',
          'Mode A · Edge Proxy Live Stream'
        );

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>
                  {pickLocaleText(
                    locale,
                    '系統設定與數據來源 (Setup)',
                    '系统设置与数据来源 (Setup)',
                    'System Setup & Data Sources'
                  )}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                  {dataMode === 'mode_a_edge' ? 'Mode A · Live' : 'Mode B · Sim'}
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {pickLocaleText(
                  locale,
                  '管理 DATA.GOV.HK 實時串流、模擬模式與地圖顯示偏好',
                  '管理 DATA.GOV.HK 实时串流、模拟模式与地图显示偏好',
                  'Manage DATA.GOV.HK live data streams, simulation mode & map preferences'
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto custom-scrollbar">
          {/* Facility & Parking Selection Bay (Moved under Settings for clean UI) */}
          <div className="rounded-xl border border-cyan-500/30 bg-slate-950/70 p-4 space-y-3.5 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                  {pickLocaleText(
                    locale,
                    '設施與車位篩選 (Facility & Parking Filter)',
                    '设施与车位筛选 (Facility & Parking Filter)',
                    'Facility & Parking Selection'
                  )}
                </span>
              </div>
              {quickFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => onSelectQuickFilter('all')}
                  className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
                >
                  {pickLocaleText(locale, '重設為全部設施', '重置为全部设施', 'Reset to All')}
                </button>
              )}
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              {pickLocaleText(
                locale,
                '選擇要在 3D 數碼孿生地圖與側欄推薦中顯示的車位設施類別：',
                '选择要在 3D 数码孪生地图与侧栏推荐中显示的车位设施类别：',
                'Choose facility categories and parking criteria to display across the 3D digital twin map:'
              )}
            </p>

            {/* Quick Filter Selection Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {[
                {
                  key: 'all' as QuickFilterKey,
                  icon: Layers,
                  title: pickLocaleText(locale, '全部設施', '全部设施', 'All Facilities'),
                  desc: pickLocaleText(
                    locale,
                    `所有公眾停車場及路邊咪錶 (${totalCarparksCount} 車場 · ${totalMetersCount.toLocaleString()} 咪錶)`,
                    `所有公众停车场及路边咪表 (${totalCarparksCount} 车场 · ${totalMetersCount.toLocaleString()} 咪表)`,
                    `All public carparks & meters (${totalCarparksCount} Lots · ${totalMetersCount.toLocaleString()} Meters)`
                  ),
                },
                {
                  key: 'available' as QuickFilterKey,
                  icon: CheckCircle2,
                  title: pickLocaleText(locale, '僅顯示有位', '仅显示有位', 'Available Only'),
                  desc: pickLocaleText(
                    locale,
                    '過濾已滿位車場，僅顯示仍有空餘泊位之停車場及空置咪錶',
                    '过滤已满位车场，仅显示仍有空余泊位之停车场及空置咪表',
                    'Hide full carparks; only show facilities with vacant parking spots'
                  ),
                },
                {
                  key: 'meters' as QuickFilterKey,
                  icon: Radio,
                  title: pickLocaleText(
                    locale,
                    `智能咪錶 (${totalMetersCount.toLocaleString()})`,
                    `智能咪表 (${totalMetersCount.toLocaleString()})`,
                    `Smart Meters (${totalMetersCount.toLocaleString()})`
                  ),
                  desc: pickLocaleText(
                    locale,
                    '專注檢視全港運輸署智能路邊泊位、街道分區及實時佔用率',
                    '专注检视全港运输署智能路边泊位、街道分区及实时占用率',
                    'Focus strictly on TD curbside smart meters and street corridors'
                  ),
                },
                {
                  key: 'ev_dc' as QuickFilterKey,
                  icon: Zap,
                  title: pickLocaleText(locale, '⚡ DC 超快充', '⚡ DC 超快充', '⚡ DC Fast Charge'),
                  desc: pickLocaleText(
                    locale,
                    '篩選配備 60kW - 480kW 超快充電樁且有空槍之商場與政府車場',
                    '筛选配备 60kW - 480kW 超快充电桩且有空枪之商场与政府车场',
                    'Only show EV hubs with 60kW-480kW DC chargers and open guns'
                  ),
                },
                {
                  key: 'no_queue' as QuickFilterKey,
                  icon: Activity,
                  title: pickLocaleText(locale, '無需排隊', '无需排队', 'No Queue Jam'),
                  desc: pickLocaleText(
                    locale,
                    '自動避坑排除門口車龍塞車、等待時間過長的熱門車場',
                    '自动避坑排除门口车龙塞车、等待时间过长的热门车场',
                    'Exclude bottleneck carparks with entrance queues and delays'
                  ),
                },
              ].map((item) => {
                const IconComponent = item.icon;
                const isSelected = quickFilter === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onSelectQuickFilter(item.key)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                      isSelected
                        ? 'bg-cyan-500/15 border-cyan-400 shadow-md shadow-cyan-500/10 ring-1 ring-cyan-400'
                        : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <IconComponent
                          className={`w-4 h-4 ${isSelected ? 'text-cyan-400' : 'text-slate-400'}`}
                        />
                        <span
                          className={`text-xs font-bold ${
                            isSelected ? 'text-white' : 'text-slate-200'
                          }`}
                        >
                          {item.title}
                        </span>
                      </div>
                      {isSelected && (
                        <span className="text-[10px] font-semibold text-cyan-300 bg-cyan-950 px-1.5 py-0.5 rounded border border-cyan-700/60">
                          {pickLocaleText(locale, '已選擇', '已选择', 'Active')}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-normal line-clamp-2">
                      {item.desc}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* EV Charger Specifications sub-filter */}
            <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-cyan-400" />
                <span>
                  {pickLocaleText(
                    locale,
                    '電動車充電樁規格偏好:',
                    '电动车充电桩规格偏好:',
                    'EV Charging Power Spec:'
                  )}
                </span>
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  {
                    key: 'all' as EvPowerFilter,
                    label: pickLocaleText(locale, '全部規格', '全部规格', 'All Specs'),
                  },
                  {
                    key: 'dc_super' as EvPowerFilter,
                    label: pickLocaleText(
                      locale,
                      '⚡ DC 超充 (≥60kW)',
                      '⚡ DC 超充 (≥60kW)',
                      '⚡ DC Super (≥60kW)'
                    ),
                  },
                  {
                    key: 'ac_medium' as EvPowerFilter,
                    label: pickLocaleText(
                      locale,
                      '🔌 AC 中充 (7-22kW)',
                      '🔌 AC 中充 (7-22kW)',
                      '🔌 AC Med (7-22kW)'
                    ),
                  },
                ].map((ev) => (
                  <button
                    key={ev.key}
                    type="button"
                    onClick={() => onSelectEvPowerFilter(ev.key)}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                      evPowerFilter === ev.key
                        ? 'bg-cyan-400 text-slate-950 font-bold'
                        : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                    }`}
                  >
                    {ev.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main Moved Section: Mode A vs Mode B */}
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                  {pickLocaleText(
                    locale,
                    '數據串流模式 (Data Streaming Mode)',
                    '数据串流模式 (Data Streaming Mode)',
                    'Data Streaming Mode'
                  )}
                </span>
              </div>
              <div className="text-xs font-mono-tabular font-medium text-slate-300 bg-slate-900/90 px-2.5 py-1 rounded-lg border border-slate-800">
                {currentModeDisplay}
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              {pickLocaleText(
                locale,
                'ParkPulse 支援雙核心運作架構。可一鍵在香港政府官方 DATA.GOV.HK 實時 API 與全城高保真模擬引擎之間無縫切換：',
                'ParkPulse 支持双核心运作架构。可一键在香港政府官方 DATA.GOV.HK 实时 API 与全城高保真模拟引擎之间无缝切换：',
                'ParkPulse supports dual-engine architecture. Seamlessly toggle between official DATA.GOV.HK real-time APIs and the high-fidelity simulator:'
              )}
            </p>

            {/* Mode selection radio cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Option 1: Mode A */}
              <button
                type="button"
                onClick={() => setDataMode('mode_a_edge')}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                  dataMode === 'mode_a_edge'
                    ? 'bg-cyan-500/15 border-cyan-400 shadow-md shadow-cyan-500/10'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        dataMode === 'mode_a_edge' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                      }`}
                    />
                    <span className="text-xs font-bold text-white">Mode A · DATA.GOV.HK</span>
                  </div>
                  {dataMode === 'mode_a_edge' && (
                    <span className="text-[10px] font-semibold text-cyan-300 bg-cyan-900/50 px-1.5 py-0.5 rounded border border-cyan-700/60">
                      {pickLocaleText(locale, '當前使用', '当前使用', 'Active')}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">
                  {pickLocaleText(
                    locale,
                    `透過服務端代理直連運輸署官方實時 API，涵蓋全港 ${totalMetersCount.toLocaleString()} 個咪錶與商場車位。`,
                    `透过服务端代理直连运输署官方实时 API，涵盖全港 ${totalMetersCount.toLocaleString()} 个咪表与商场车位。`,
                    `Direct edge proxy connection to TD official APIs (${totalMetersCount.toLocaleString()} Smart Meters).`
                  )}
                </p>
                <div className="text-[10px] text-emerald-400 font-mono">
                  {upstreamLive
                    ? pickLocaleText(locale, '🟢 官方數據源在線連接中', '🟢 官方数据源在线连接中', '🟢 Upstream Online')
                    : pickLocaleText(locale, '🔵 邊緣代理實時數據串流', '🔵 边缘代理实时数据串流', '🔵 Edge Proxy Streaming')}
                </div>
              </button>

              {/* Option 2: Mode B */}
              <button
                type="button"
                onClick={() => setDataMode('mode_b_sim')}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                  dataMode === 'mode_b_sim'
                    ? 'bg-purple-500/15 border-purple-400 shadow-md shadow-purple-500/10'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        dataMode === 'mode_b_sim' ? 'bg-purple-400 animate-pulse' : 'bg-slate-600'
                      }`}
                    />
                    <span className="text-xs font-bold text-white">Mode B · 模擬引擎 (Sim)</span>
                  </div>
                  {dataMode === 'mode_b_sim' && (
                    <span className="text-[10px] font-semibold text-purple-300 bg-purple-900/50 px-1.5 py-0.5 rounded border border-purple-700/60">
                      {pickLocaleText(locale, '當前使用', '当前使用', 'Active')}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">
                  {pickLocaleText(
                    locale,
                    '全本地高保真隨機動態遙測引擎，模擬尖峰時段車位佔用波動與過海隧道排隊狀況。',
                    '全本地高保真随机动态遥测引擎，模拟尖峰时段车位占用波动与过海隧道排队状况。',
                    'Autonomous multi-agent simulation model for off-grid operation and stress-testing.'
                  )}
                </p>
                <div className="text-[10px] text-purple-400 font-mono">
                  {pickLocaleText(locale, '🟣 本地數碼孿生模擬時鐘', '🟣 本地数码孪生模拟时钟', '🟣 Local Twin Engine')}
                </div>
              </button>
            </div>

            {/* Quick action buttons: Manual refresh pulse & polling */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-cyan-900/40">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePulseClick}
                  disabled={isPulsing}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isPulsing ? 'animate-spin' : ''}`} />
                  <span>
                    {isPulsing
                      ? pickLocaleText(locale, '正在請求官方數據...', '正在请求官方数据...', 'Fetching Live Data...')
                      : pulseSuccess
                      ? pickLocaleText(locale, '數據更新成功 ✓', '数据更新成功 ✓', 'Updated Successfully ✓')
                      : pickLocaleText(locale, '立即手動刷新 (Sync Now)', '立即手动刷新 (Sync Now)', 'Sync Now')}
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={autoLiveTick}
                    onChange={(e) => setAutoLiveTick(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-cyan-400 focus:ring-cyan-400 w-3.5 h-3.5"
                  />
                  <span>
                    {pickLocaleText(
                      locale,
                      '自動每 6.5 秒輪詢更新 (Auto-Poll)',
                      '自动每 6.5 秒轮询更新 (Auto-Poll)',
                      'Auto-poll every 6.5s'
                    )}
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Map & Viewport Preferences Section */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                {pickLocaleText(
                  locale,
                  '地圖與視區偏好 (Map Preferences)',
                  '地图与视区偏好 (Map Preferences)',
                  'Map & Viewport Preferences'
                )}
              </span>
            </div>

            {/* Map Color Theme Selection (Conventional Light vs Dark Digital Twin) */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-400">
                {pickLocaleText(locale, '地圖色彩模式 (Map Theme)', '地图色彩模式 (Map Theme)', 'Map Color Theme')}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onSelectMapTheme?.('light')}
                  className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition-all text-left cursor-pointer ${
                    mapTheme === 'light'
                      ? 'bg-amber-400/20 border-amber-400/80 text-white shadow-md ring-1 ring-amber-400/40'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    mapTheme === 'light' ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'
                  }`}>
                    <Sun className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-white flex items-center gap-1.5">
                      <span>{pickLocaleText(locale, '☀️ 日間常規色彩', '☀️ 日间常规色彩', 'Conventional Light')}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 font-medium">
                        {pickLocaleText(locale, '預設', '默认', 'Default')}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {pickLocaleText(locale, '天然藍海綠地與明亮路網', '天然蓝海绿地与明亮路网', 'Natural daylight roads & parks')}
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectMapTheme?.('dark')}
                  className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition-all text-left cursor-pointer ${
                    mapTheme === 'dark'
                      ? 'bg-cyan-950/60 border-cyan-400/80 text-white shadow-md ring-1 ring-cyan-400/40'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    mapTheme === 'dark' ? 'bg-cyan-400 text-slate-950 font-bold' : 'bg-slate-800 text-slate-400'
                  }`}>
                    <Moon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-xs text-white">
                      {pickLocaleText(locale, '🌙 夜間數碼孿生', '🌙 夜间数码孪生', 'Dark Digital Twin')}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {pickLocaleText(locale, '深色科技立體夜間視效', '深色科技立体夜间视效', 'Cyber dark night glow')}
                    </div>
                  </div>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
              {/* Viewport follow toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800">
                <div>
                  <div className="font-semibold text-white">
                    {pickLocaleText(locale, '視區自動跟隨', '视区自动跟随', 'Auto-Follow Viewport')}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {pickLocaleText(
                      locale,
                      '拖拽地圖時左欄停車場列表自動同步',
                      '拖拽地图时左栏停车场列表自动同步',
                      'Sync sidebar list as you drag map'
                    )}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={viewportSyncEnabled}
                  onChange={(e) => setViewportSyncEnabled(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-cyan-400 focus:ring-cyan-400 w-4 h-4 cursor-pointer"
                />
              </div>

              {/* 3D view toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800">
                <div>
                  <div className="font-semibold text-white">
                    {pickLocaleText(locale, '3D 建築立體光影', '3D 建筑立体光影', '3D Buildings & Tilt')}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {pickLocaleText(
                      locale,
                      '啟用 MapLibre 45° 立體視角與高度柱',
                      '启用 MapLibre 45° 立体视角与高度柱',
                      '45° camera pitch and volumetric pillars'
                    )}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={is3DView}
                  onChange={(e) => setIs3DView(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-cyan-400 focus:ring-cyan-400 w-4 h-4 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Telemetry & API Endpoints Inspector */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2.5">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                {pickLocaleText(
                  locale,
                  '系統狀態與數據庫指標 (Telemetry Metrics)',
                  '系统状态与数据库指标 (Telemetry Metrics)',
                  'System Status & Telemetry Metrics'
                )}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400">
                  {pickLocaleText(locale, '智能咪錶泊位', '智能咪表泊位', 'Smart Meters')}
                </div>
                <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
                  {totalMetersCount.toLocaleString()}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400">
                  {pickLocaleText(locale, '多層停車場 & EV', '多层停车场 & EV', 'Carparks & EV')}
                </div>
                <div className="text-sm font-bold font-mono text-cyan-400 mt-0.5">
                  {totalCarparksCount}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400">
                  {pickLocaleText(locale, '即時路面天眼', '实时路面天眼', 'TD Live CCTV')}
                </div>
                <div className="text-sm font-bold font-mono text-amber-400 mt-0.5">
                  {totalCctvCount}
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <div className="text-[11px] text-slate-400">
                  {pickLocaleText(locale, '過海隧道監控', '过海隧道监控', 'Cross-Harbour')}
                </div>
                <div className="text-sm font-bold font-mono text-purple-400 mt-0.5">
                  3 (紅/東/西)
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
              <div className="text-slate-300 font-semibold">
                {pickLocaleText(locale, '📡 官方端點 (Edge Proxied):', '📡 官方端点 (Edge Proxied):', '📡 Official Endpoints:')}
              </div>
              <div>• GET /api/carparks — HKSAR Transport Department 588+ Real-Time Vacancy Catalog (All 18 Districts &amp; Ocean Park)</div>
              <div>• GET /api/meters — HKSAR Transport Department HKeMeter Smart Sensors &amp; Poles</div>
              <div>• GET /api/traffic — Hong Kong Speed Map &amp; Special Incidents</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {pickLocaleText(
              locale,
              '設定會即時套用於地圖與推薦系統',
              '设置会即时套用于地图与推荐系统',
              'Settings apply instantly to map and co-pilot engine'
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors cursor-pointer"
          >
            {pickLocaleText(locale, '完成 Done', '完成 Done', 'Done')}
          </button>
        </div>
      </div>
    </div>
  );
};
