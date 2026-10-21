import React from 'react';
import {
  Navigation,
  Zap,
  MapPin,
  Clock,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  Crosshair,
  ArrowRight,
  Route,
  Sparkles,
  ChevronDown,
  ChevronUp,
  RefreshCw,
} from 'lucide-react';
import { LocaleKey, pickLocaleText } from '../data/hkParkingData';
import {
  UserGpsState,
  DriverIntentMode,
  ProactiveSuggestionItem,
  CalculatedRoutePlan,
  PRESET_DRIVER_GPS_ANCHORS,
  PresetDriverGpsAnchor,
} from '../utils/proactiveRouteEngine';

interface ProactiveGpsCopilotPanelProps {
  locale: LocaleKey;
  userGps: UserGpsState | null;
  gpsPromptDismissed: boolean;
  isPickingMapOrigin: boolean;
  intentMode: DriverIntentMode;
  suggestions: ProactiveSuggestionItem[];
  activeRoutePlan: CalculatedRoutePlan | null;
  selectedSuggestionId: string | null;
  plannedParkingHours: number;
  plannedChargingKwh: number;
  copilotCollapsed: boolean;
  isGpsLoading?: boolean;
  gpsErrorMessage?: string | null;
  isGpsPermissionDenied?: boolean;
  onClearGpsError?: () => void;
  onRequestBrowserGps: () => void;
  onSelectPresetGps: (preset: PresetDriverGpsAnchor) => void;
  onTogglePickMapOrigin: () => void;
  onDismissPrompt: () => void;
  onChangeIntentMode: (mode: DriverIntentMode) => void;
  onSelectSuggestion: (item: ProactiveSuggestionItem) => void;
  onChangeParkingHours: (hours: number) => void;
  onChangeChargingKwh: (kwh: number) => void;
  onToggleCollapse: () => void;
  onFrameRouteOnMap: () => void;
}

export const ProactiveGpsCopilotPanel: React.FC<ProactiveGpsCopilotPanelProps> = ({
  locale,
  userGps,
  gpsPromptDismissed,
  isPickingMapOrigin,
  intentMode,
  suggestions,
  activeRoutePlan,
  selectedSuggestionId,
  plannedParkingHours,
  plannedChargingKwh,
  copilotCollapsed,
  isGpsLoading = false,
  gpsErrorMessage = null,
  isGpsPermissionDenied = false,
  onClearGpsError,
  onRequestBrowserGps,
  onSelectPresetGps,
  onTogglePickMapOrigin,
  onDismissPrompt,
  onChangeIntentMode,
  onSelectSuggestion,
  onChangeParkingHours,
  onChangeChargingKwh,
  onToggleCollapse,
  onFrameRouteOnMap,
}) => {
  const showInitialPermissionModal = !userGps && !gpsPromptDismissed;

  return (
    <>
      {/* STEP 1: Initial Proactive GPS Permission Modal on Launch */}
      {showInitialPermissionModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-slate-900 border border-cyan-500/40 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-cyan-500/15 border border-cyan-400/50 flex items-center justify-center shrink-0">
                  <Crosshair className="w-6 h-6 text-cyan-400" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-cyan-400">
                    {pickLocaleText(
                      locale,
                      '主動式智能尋位與路線導航引擎',
                      '主动式智能寻位与路线导航引擎',
                      'Proactive GPS EV & Parking Co-Pilot'
                    )}
                  </div>
                  <h2 className="text-lg font-bold text-white mt-0.5">
                    {pickLocaleText(
                      locale,
                      '開啟 GPS 定位，自動為你推薦最佳充電與泊車位',
                      '开启 GPS 定位，自动为你推荐最佳充电与泊车位',
                      'Enable GPS to Auto-Find Closest EV Dock & Parking'
                    )}
                  </h2>
                </div>
              </div>
            </div>

            {/* 3-Step Workflow Explanation */}
            <div className="space-y-2.5 bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-xs text-slate-300">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 font-mono-tabular font-bold flex items-center justify-center shrink-0">
                  1
                </span>
                <div>
                  <strong className="text-white">
                    {pickLocaleText(
                      locale,
                      '獲取你的實時 GPS 位置：',
                      '获取你的实时 GPS 位置：',
                      '1. Request GPS Location:'
                    )}
                  </strong>{' '}
                  {pickLocaleText(
                    locale,
                    '授權瀏覽器存取你的 GPS 座標（或選擇香港模擬起點）。',
                    '授权浏览器访问你的 GPS 坐标（或选择香港模拟起点）。',
                    'Grant browser geolocation permission (or pick a simulated HK starting point).'
                  )}
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 font-mono-tabular font-bold flex items-center justify-center shrink-0">
                  2
                </span>
                <div>
                  <strong className="text-white">
                    {pickLocaleText(
                      locale,
                      '自動識別最近超充槍及免排隊車位：',
                      '自动识别最近超充枪及免排队车位：',
                      '2. Auto-Suggest Closest EV Dock & Carpark:'
                    )}
                  </strong>{' '}
                  {pickLocaleText(
                    locale,
                    '即時比對距離、空槍/空位數量及入口車速，主動篩選最佳方案。',
                    '实时比对距离、空枪/空位数量及入口车速，主动筛选最佳方案。',
                    'Automatically ranks the closest available EV chargers and zero-queue parking spaces.'
                  )}
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 font-mono-tabular font-bold flex items-center justify-center shrink-0">
                  3
                </span>
                <div>
                  <strong className="text-white">
                    {pickLocaleText(
                      locale,
                      '計算最短路線、即時路況時間及泊車充電總費用：',
                      '计算最短路线、实时路况时间及泊车充电总费用：',
                      '3. Shortest Route, Live Traffic ETA & Cost Estimate:'
                    )}
                  </strong>{' '}
                  {pickLocaleText(
                    locale,
                    '點選推薦場站後，自動規劃 3D 最短行車路線，並綜合實時塞車情況估算抵達時間與總開支。',
                    '点选推荐场站后，自动规划 3D 最短行车路线，并综合实时堵车情况估算抵达时间与总开支。',
                    'Calculates the shortest route on the 3D map and estimates travel time, traffic delay, and total parking + EV cost.'
                  )}
                </div>
              </div>
            </div>

            {/* Error & iOS Chrome Settings Guidance */}
            {gpsErrorMessage && (
              <div className="p-3.5 rounded-xl bg-amber-950/70 border border-amber-500/50 text-xs space-y-2">
                <div className="flex items-start gap-2 text-amber-300 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>{gpsErrorMessage}</span>
                </div>
                {isGpsPermissionDenied && (
                  <div className="text-[11px] text-slate-200 bg-slate-950/80 p-2.5 rounded-lg border border-amber-500/30 space-y-1.5 leading-relaxed">
                    <div className="font-bold text-amber-300 flex items-center gap-1">
                      <span>📱 iPhone (iOS) Chrome 瀏覽器定位授權解鎖指引：</span>
                    </div>
                    <ol className="list-decimal list-inside space-y-0.5 text-slate-300">
                      <li>打開 iPhone 桌面<strong>「設定」</strong></li>
                      <li>向下滾動找到<strong>「Chrome」</strong></li>
                      <li>點擊<strong>「位置」</strong>改選<strong>「使用 App 期間」</strong>並開啟<strong>「精確位置」</strong></li>
                      <li>返回 Chrome 點擊下方<strong>「重新嘗試 GPS 定位」</strong></li>
                    </ol>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    onClick={onRequestBrowserGps}
                    disabled={isGpsLoading}
                    className="px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isGpsLoading ? 'animate-spin' : ''}`} />
                    <span>{pickLocaleText(locale, '重新嘗試 GPS 定位', '重新尝试 GPS 定位', 'Retry GPS')}</span>
                  </button>
                  {onClearGpsError && (
                    <button
                      onClick={onClearGpsError}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs cursor-pointer"
                    >
                      {pickLocaleText(locale, '略過提示', '略过提示', 'Dismiss')}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Primary CTA: Request Browser Geolocation */}
            <div className="space-y-3">
              <button
                onClick={onRequestBrowserGps}
                disabled={isGpsLoading}
                className="w-full py-3 px-4 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:bg-cyan-600 disabled:cursor-wait text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 transition-colors cursor-pointer"
              >
                {isGpsLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                    <span>
                      {pickLocaleText(
                        locale,
                        '📡 正在連線 GPS 衛星與獲取定位中...',
                        '📡 正在连线 GPS 卫星与获取定位中...',
                        '📡 Acquiring GPS Satellite Signal...'
                      )}
                    </span>
                  </>
                ) : (
                  <>
                    <Crosshair className="w-4 h-4" />
                    <span>
                      {pickLocaleText(
                        locale,
                        '📍 允許使用我的 GPS 位置並立即智能推薦',
                        '📍 允许使用我的 GPS 位置并立即智能推荐',
                        '📍 Allow My GPS Location & Auto-Suggest Best Option'
                      )}
                    </span>
                  </>
                )}
              </button>

              {/* Quick HK Driver GPS Starting Points (for testing or if user is outside HK) */}
              <div className="pt-1">
                <div className="text-[11px] text-slate-400 mb-2 flex items-center justify-between">
                  <span>
                    {pickLocaleText(
                      locale,
                      '或一鍵選擇香港即時駕駛起點（免授權直接試用）：',
                      '或一键选择香港实时驾驶起点（免授权直接试用）：',
                      'Or pick a live HK driver origin (instant 1-click test):'
                    )}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {PRESET_DRIVER_GPS_ANCHORS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => onSelectPresetGps(preset)}
                      className="px-2.5 py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-cyan-400/50 text-left text-xs text-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="truncate">
                        {pickLocaleText(locale, preset.nameZh, preset.nameSc, preset.nameEn).split(
                          ' '
                        )[0]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
              <button
                onClick={() => {
                  onDismissPrompt();
                  onTogglePickMapOrigin();
                }}
                className="text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer"
              >
                {pickLocaleText(
                  locale,
                  '🖱️ 直接在 3D 地圖上點擊自訂起點',
                  '🖱️ 直接在 3D 地图上点击自订起点',
                  '🖱️ Click anywhere on 3D map to set origin'
                )}
              </button>
              <button
                onClick={onDismissPrompt}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                {pickLocaleText(locale, '稍後再說', '稍后再说', 'Skip for now')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Embedded Proactive Smart Co-Pilot & Route/Cost Calculator inside Left Sidebar */}
      <div className="p-3 bg-slate-900/90 border-b border-slate-800/90 space-y-2.5 shrink-0">
        {/* Top Header of Co-Pilot */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Crosshair className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="text-xs font-bold text-white truncate">
              {pickLocaleText(
                locale,
                'GPS 主動尋位與路線費用試算',
                'GPS 主动寻位与路线费用试算',
                'Proactive GPS Route & Cost Co-Pilot'
              )}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onRequestBrowserGps}
              disabled={isGpsLoading}
              className="px-2 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-400 disabled:opacity-50 text-cyan-300 hover:text-slate-950 border border-cyan-500/40 text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer"
              title={pickLocaleText(
                locale,
                '重新獲取瀏覽器 GPS 定位',
                '重新获取浏览器 GPS 定位',
                'Refresh Browser GPS Location'
              )}
            >
              <RefreshCw className={`w-3 h-3 ${isGpsLoading ? 'animate-spin' : ''}`} />
              <span>
                {isGpsLoading
                  ? pickLocaleText(locale, '搜尋中...', '搜寻中...', 'Locating...')
                  : pickLocaleText(locale, 'GPS 定位', 'GPS 定位', 'My GPS')}
              </span>
            </button>

            <button
              onClick={onTogglePickMapOrigin}
              className={`px-2 py-1 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                isPickingMapOrigin
                  ? 'bg-amber-400 text-slate-950 border-amber-300'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-cyan-400/50'
              }`}
              title={pickLocaleText(
                locale,
                '點擊地圖任何位置作為你的出發起點',
                '点击地图任何位置作为你的出发起点',
                'Click anywhere on the map to set your starting point'
              )}
            >
              {isPickingMapOrigin
                ? pickLocaleText(locale, '點擊地圖設定中...', '点击地图设定中...', 'Click Map...')
                : pickLocaleText(locale, '自訂起點', '自订起点', 'Set Origin')}
            </button>

            <button
              onClick={onToggleCollapse}
              className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              title={copilotCollapsed ? 'Expand' : 'Collapse'}
            >
              {copilotCollapsed ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Active GPS Location Readout */}
        {userGps && (
          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-300 bg-slate-950/80 px-2.5 py-1.5 rounded-lg border border-slate-800/80">
            <div className="flex items-center gap-1.5 truncate">
              <span className="h-2 w-2 rounded-full bg-cyan-400 shrink-0" />
              <span className="text-slate-400">
                {pickLocaleText(locale, '起點:', '起点:', 'Origin:')}
              </span>
              <strong className="text-white truncate">
                {pickLocaleText(locale, userGps.labelZh, userGps.labelSc, userGps.labelEn)}
              </strong>
            </div>
            <select
              value=""
              onChange={(e) => {
                const found = PRESET_DRIVER_GPS_ANCHORS.find((p) => p.id === e.target.value);
                if (found) onSelectPresetGps(found);
              }}
              className="bg-slate-900 text-cyan-300 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] font-medium focus:outline-none cursor-pointer shrink-0"
            >
              <option value="" disabled>
                {pickLocaleText(locale, '切換香港起點...', '切换香港起点...', 'Switch Origin...')}
              </option>
              {PRESET_DRIVER_GPS_ANCHORS.map((p) => (
                <option key={p.id} value={p.id}>
                  {pickLocaleText(locale, p.nameZh, p.nameSc, p.nameEn)}
                </option>
              ))}
            </select>
          </div>
        )}

        {!copilotCollapsed && (
          <div className="space-y-2.5 pt-0.5">
            {/* Inline Error & iOS Chrome Settings Guidance in Sidebar */}
            {gpsErrorMessage && (
              <div className="p-3 rounded-xl bg-amber-950/70 border border-amber-500/50 text-xs space-y-2">
                <div className="flex items-start gap-2 text-amber-300 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>{gpsErrorMessage}</span>
                </div>
                {isGpsPermissionDenied && (
                  <div className="text-[11px] text-slate-200 bg-slate-950/80 p-2.5 rounded-lg border border-amber-500/30 space-y-1.5 leading-relaxed">
                    <div className="font-bold text-amber-300">
                      📱 iPhone (iOS) Chrome 解鎖位置步驟：
                    </div>
                    <ol className="list-decimal list-inside space-y-0.5 text-slate-300">
                      <li>打開 iPhone 桌面<strong>「設定」</strong></li>
                      <li>向下找到<strong>「Chrome」</strong></li>
                      <li>點擊<strong>「位置」</strong>改選<strong>「使用 App 期間」</strong>並開啟<strong>「精確位置」</strong></li>
                      <li>返回點擊<strong>「重新嘗試」</strong>，或直接使用下方香港預設起點</li>
                    </ol>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    onClick={onRequestBrowserGps}
                    disabled={isGpsLoading}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <RefreshCw className={`w-3 h-3 ${isGpsLoading ? 'animate-spin' : ''}`} />
                    <span>{pickLocaleText(locale, '重新嘗試 GPS 定位', '重新尝试 GPS 定位', 'Retry GPS')}</span>
                  </button>
                  {onClearGpsError && (
                    <button
                      onClick={onClearGpsError}
                      className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs cursor-pointer"
                    >
                      {pickLocaleText(locale, '略過', '略过', 'Dismiss')}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Intent Mode Selector Tabs */}
            <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800/80 text-[11px]">
              {(
                [
                  {
                    key: 'smart_auto',
                    labelZh: '智能首選',
                    labelSc: '智能首选',
                    labelEn: 'Auto Best',
                  },
                  {
                    key: 'ev_charging',
                    labelZh: '⚡ 最近充電',
                    labelSc: '⚡ 最近充电',
                    labelEn: '⚡ EV Dock',
                  },
                  {
                    key: 'parking_only',
                    labelZh: '🅿️ 免排泊車',
                    labelSc: '🅿️ 免排泊车',
                    labelEn: '🅿️ Carpark',
                  },
                  {
                    key: 'curbside_meter',
                    labelZh: '🪙 路邊咪錶',
                    labelSc: '🪙 路边咪表',
                    labelEn: '🪙 Meter',
                  },
                ] as { key: DriverIntentMode; labelZh: string; labelSc: string; labelEn: string }[]
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => onChangeIntentMode(tab.key)}
                  className={`py-1 px-1.5 rounded-lg font-semibold transition-colors truncate cursor-pointer ${
                    intentMode === tab.key
                      ? 'bg-cyan-400 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {pickLocaleText(locale, tab.labelZh, tab.labelSc, tab.labelEn)}
                </button>
              ))}
            </div>

            {/* STEP 2: Automatically Suggested Closest EV Docks / Parking Spaces */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400 px-0.5">
                <span>
                  {pickLocaleText(
                    locale,
                    '為你主動識別的最佳鄰近選擇（點選即規劃最短路線）：',
                    '为你主动识别的最佳邻近选择（点选即规划最短路线）：',
                    'Proactive Closest Recommendations (Click to calculate route):'
                  )}
                </span>
              </div>

              <div className="space-y-1.5">
                {suggestions.map((sug, index) => {
                  const isSelected = selectedSuggestionId === sug.id;
                  const targetName = sug.carpark
                    ? pickLocaleText(
                        locale,
                        sug.carpark.nameZh,
                        sug.carpark.nameSc,
                        sug.carpark.nameEn
                      )
                    : sug.meter
                    ? `${pickLocaleText(
                        locale,
                        sug.meter.streetZh,
                        sug.meter.streetSc,
                        sug.meter.streetEn
                      )} (#${sug.meter.meterPoleId})`
                    : '';
                  const targetAddress = sug.carpark
                    ? pickLocaleText(
                        locale,
                        sug.carpark.addressZh,
                        sug.carpark.addressSc || sug.carpark.addressZh,
                        sug.carpark.addressEn
                      )
                    : sug.meter
                    ? [
                        pickLocaleText(
                          locale,
                          sug.meter.districtZh,
                          sug.meter.districtSc,
                          sug.meter.districtEn
                        ),
                        sug.meter.subDistrictZh
                          ? pickLocaleText(
                              locale,
                              sug.meter.subDistrictZh,
                              sug.meter.subDistrictSc || sug.meter.subDistrictZh,
                              sug.meter.subDistrictEn || sug.meter.subDistrictZh
                            )
                          : '',
                        sug.meter.sectionOfStreetZh
                          ? pickLocaleText(
                              locale,
                              sug.meter.sectionOfStreetZh,
                              sug.meter.sectionOfStreetSc || sug.meter.sectionOfStreetZh,
                              sug.meter.sectionOfStreetEn || sug.meter.sectionOfStreetZh
                            )
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : '';

                  return (
                    <button
                      key={sug.id}
                      onClick={() => onSelectSuggestion(sug)}
                      className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-cyan-950/40 border-cyan-400 shadow-md'
                          : 'bg-slate-950/75 border-slate-800/90 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] font-bold text-cyan-300 shrink-0">
                            #{index + 1}{' '}
                            {pickLocaleText(locale, sug.badgeZh, sug.badgeSc, sug.badgeEn)}
                          </span>
                          <span aria-hidden="true" className="text-slate-600">
                            ·
                          </span>
                          <span className="text-xs font-bold text-white truncate">
                            {targetName}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 font-mono-tabular text-xs">
                          <span className="font-bold text-emerald-400">
                            {sug.totalEtaMins} {pickLocaleText(locale, '分鐘', '分钟', 'm')}
                          </span>
                          <span className="text-slate-500">·</span>
                          <span className="text-cyan-300 font-semibold">
                            {sug.routeDistanceKm.toFixed(1)} km
                          </span>
                        </div>
                      </div>

                      {targetAddress && (
                        <div className="mt-0.5 text-[10px] text-slate-300 truncate">
                          📍 {targetAddress}
                        </div>
                      )}

                      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-400 font-mono-tabular">
                        <span className="truncate">
                          {pickLocaleText(locale, sug.reasonZh, sug.reasonSc, sug.reasonEn)}
                        </span>
                        <span className="text-slate-300 shrink-0">
                          ~HK${sug.estimatedBaseCostHk}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* STEP 3: Active Shortest Route + Traffic ETA + Interactive Cost Calculator */}
            {activeRoutePlan && (
              <div className="p-3 rounded-xl bg-slate-950 border border-cyan-500/40 space-y-2.5">
                <div className="flex items-center justify-between gap-2 border-b border-slate-800/90 pb-2">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold text-cyan-400 flex items-center gap-1">
                      <Route className="w-3.5 h-3.5" />
                      <span>
                        {pickLocaleText(
                          locale,
                          '已規劃最短路線及即時路況費用估算',
                          '已规划最短路线及实时路况费用估算',
                          'Shortest Route & Live Traffic Cost Plan'
                        )}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-white truncate mt-0.5">
                      🏁{' '}
                      {pickLocaleText(
                        locale,
                        activeRoutePlan.destinationNameZh,
                        activeRoutePlan.destinationNameSc,
                        activeRoutePlan.destinationNameEn
                      )}
                    </div>
                  </div>
                  <button
                    onClick={onFrameRouteOnMap}
                    className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] font-semibold text-cyan-300 shrink-0 cursor-pointer"
                  >
                    {pickLocaleText(locale, '檢視 3D 路線', '查看 3D 路线', 'View Route')}
                  </button>
                </div>

                {/* Routing Engine Indicator & Attribution */}
                {activeRoutePlan.routingProvider === 'google_maps' ? (
                  <div className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg bg-emerald-950/70 border border-emerald-500/50 text-emerald-300">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                      <span className="font-bold truncate">Google Maps Routes API</span>
                      <span className="text-[10px] text-emerald-400/80 shrink-0">
                        ({activeRoutePlan.routeSummary || 'TRAFFIC_AWARE 即時路況最優'})
                      </span>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-mono-tabular shrink-0">
                      Live Traffic
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700/80 text-slate-300">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                      <span className="font-semibold text-white truncate text-[11px]">
                        {pickLocaleText(
                          locale,
                          '香港運輸署即時車速 + 3D 最短路線',
                          '香港运输署实时车速 + 3D 最短路线',
                          'HK Live Traffic Speed & Shortest 3D Route'
                        )}
                      </span>
                    </div>
                    <span className="text-[10px] text-cyan-300 font-mono-tabular shrink-0">
                      Live Telemetry
                    </span>
                  </div>
                )}

                {/* 3-Column Route Distance, Live Traffic ETA, & Total Cost Summary */}
                <div className="grid grid-cols-3 gap-1.5 font-mono-tabular">
                  <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800/80">
                    <div className="text-[10px] text-slate-400 font-sans">
                      {pickLocaleText(locale, '最短路程', '最短路程', 'Shortest Dist')}
                    </div>
                    <div className="text-sm font-bold text-white mt-0.5">
                      {activeRoutePlan.roadDistanceKm} km
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {pickLocaleText(locale, '均速', '均速', 'Avg')}{' '}
                      {activeRoutePlan.averageRouteSpeedKmh} km/h
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-900/90 border border-slate-800/80">
                    <div className="text-[10px] text-slate-400 font-sans">
                      {pickLocaleText(locale, '連路況總時間', '连路况总时间', 'Traffic ETA')}
                    </div>
                    <div
                      className={`text-sm font-bold mt-0.5 ${
                        activeRoutePlan.trafficCondition === 'bad'
                          ? 'text-amber-300'
                          : 'text-emerald-400'
                      }`}
                    >
                      {activeRoutePlan.totalEtaMins}{' '}
                      {pickLocaleText(locale, '分鐘', '分钟', 'mins')}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {activeRoutePlan.trafficDelayMins + activeRoutePlan.entranceQueueMins > 0
                        ? pickLocaleText(
                            locale,
                            `含塞車/排隊 +${
                              activeRoutePlan.trafficDelayMins + activeRoutePlan.entranceQueueMins
                            }m`,
                            `含堵车/排队 +${
                              activeRoutePlan.trafficDelayMins + activeRoutePlan.entranceQueueMins
                            }m`,
                            `+${
                              activeRoutePlan.trafficDelayMins + activeRoutePlan.entranceQueueMins
                            }m traffic/queue`
                          )
                        : pickLocaleText(locale, '全線暢順無阻', '全线畅顺无阻', 'Clear traffic')}
                    </div>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-900/90 border border-cyan-500/30">
                    <div className="text-[10px] text-cyan-300 font-sans">
                      {pickLocaleText(locale, '預計總開支', '预计总开支', 'Est. Total Cost')}
                    </div>
                    <div className="text-sm font-bold text-cyan-300 mt-0.5">
                      HK${activeRoutePlan.costBreakdown.totalEstimatedCostHk}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {activeRoutePlan.costBreakdown.durationHours}h
                      {activeRoutePlan.costBreakdown.chargingKwh > 0
                        ? ` + ${activeRoutePlan.costBreakdown.chargingKwh}kWh`
                        : ''}
                    </div>
                  </div>
                </div>

                {/* Interactive Parking Hours & EV Charging kWh Sliders / Selectors */}
                <div className="grid grid-cols-2 gap-2 pt-0.5 text-[11px]">
                  <div className="bg-slate-900/70 border border-slate-800/80 rounded-lg p-2">
                    <div className="flex items-center justify-between text-slate-400 mb-1">
                      <span>{pickLocaleText(locale, '預計泊車時數', '预计泊车时数', 'Park Time')}</span>
                      <span className="font-mono-tabular font-bold text-white">
                        {plannedParkingHours} {pickLocaleText(locale, '小時', '小时', 'hr')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 6].map((hr) => (
                        <button
                          key={hr}
                          onClick={() => onChangeParkingHours(hr)}
                          className={`flex-1 py-0.5 rounded text-[10px] font-mono-tabular font-semibold cursor-pointer ${
                            plannedParkingHours === hr
                              ? 'bg-cyan-400 text-slate-950'
                              : 'bg-slate-800 text-slate-300 hover:text-white'
                          }`}
                        >
                          {hr}h
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bg-slate-900/70 border border-slate-800/80 rounded-lg p-2">
                    <div className="flex items-center justify-between text-slate-400 mb-1">
                      <span>{pickLocaleText(locale, '預計充電量', '预计充电量', 'EV Charge')}</span>
                      <span className="font-mono-tabular font-bold text-cyan-300">
                        {plannedChargingKwh} kWh
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {[0, 20, 40, 60].map((kwh) => (
                        <button
                          key={kwh}
                          onClick={() => onChangeChargingKwh(kwh)}
                          className={`flex-1 py-0.5 rounded text-[10px] font-mono-tabular font-semibold cursor-pointer ${
                            plannedChargingKwh === kwh
                              ? 'bg-cyan-400 text-slate-950'
                              : 'bg-slate-800 text-slate-300 hover:text-white'
                          }`}
                        >
                          {kwh === 0 ? '0' : `${kwh}`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Itemized Cost & Time Breakdown */}
                <div className="text-[11px] text-slate-300 space-y-1 font-mono-tabular bg-slate-900/50 p-2 rounded-lg border border-slate-800/60">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-sans">
                      {pickLocaleText(locale, '🅿️ 泊車費用', '🅿️ 泊车费用', '🅿️ Parking Fee')} (
                      {activeRoutePlan.costBreakdown.durationHours}h
                      {activeRoutePlan.costBreakdown.promoApplied
                        ? pickLocaleText(locale, ' · 已套用日泊優惠', ' · 已套用日泊优惠', ' · Day Promo')
                        : ''}
                      )
                    </span>
                    <span className="font-semibold text-white">
                      HK${activeRoutePlan.costBreakdown.parkingFeeHk}
                    </span>
                  </div>

                  {activeRoutePlan.costBreakdown.chargingKwh > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-sans">
                        {pickLocaleText(locale, '⚡ EV 充電費', '⚡ EV 充电费', '⚡ EV Charging')} (
                        {activeRoutePlan.costBreakdown.chargingKwh}kWh · ~
                        {activeRoutePlan.costBreakdown.estimatedChargeMins}m)
                      </span>
                      <span className="font-semibold text-cyan-300">
                        {activeRoutePlan.costBreakdown.evChargingFeeHk === 0
                          ? pickLocaleText(locale, '免費 Free', '免费 Free', 'Free (HK$0)')
                          : `HK$${activeRoutePlan.costBreakdown.evChargingFeeHk}`}
                      </span>
                    </div>
                  )}

                  {activeRoutePlan.crossHarbourTunnel && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-sans">
                        {pickLocaleText(locale, '🚇 過海隧道費', '🚇 过海隧道费', '🚇 Tunnel Toll')} (
                        {pickLocaleText(
                          locale,
                          activeRoutePlan.crossHarbourTunnel.tunnelNameZh,
                          activeRoutePlan.crossHarbourTunnel.tunnelNameSc,
                          activeRoutePlan.crossHarbourTunnel.tunnelNameEn
                        )}
                        )
                      </span>
                      <span className="font-semibold text-amber-300">
                        HK${activeRoutePlan.crossHarbourTunnel.tollHk}
                      </span>
                    </div>
                  )}
                </div>

                {/* Direct Turn-by-Turn Navigation Link */}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&origin=${activeRoutePlan.originCoords[1]},${activeRoutePlan.originCoords[0]}&destination=${activeRoutePlan.destinationCoords[1]},${activeRoutePlan.destinationCoords[0]}&travelmode=driving`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2 px-3 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>
                    {pickLocaleText(
                      locale,
                      '啟動 Google Maps 實時語音導航 (含起點至終點)',
                      '启动 Google Maps 实时语音导航 (含起点至终点)',
                      'Start Turn-by-Turn Navigation (Origin to Destination)'
                    )}
                  </span>
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};
