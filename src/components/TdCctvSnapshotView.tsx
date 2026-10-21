import React, { useState, useEffect } from 'react';
import { Camera, RefreshCw, Maximize2, X, Navigation, Radio } from 'lucide-react';
import { TdCctvCamera, LocaleKey, pickLocaleText, UI_TRANSLATIONS } from '../data/hkParkingData';

interface TdCctvSnapshotViewProps {
  camera: TdCctvCamera;
  allCameras?: TdCctvCamera[];
  locale: LocaleKey;
  compact?: boolean;
  onSelectCamera?: (camera: TdCctvCamera) => void;
  onFlyToCamera?: (camera: TdCctvCamera) => void;
}

export const TdCctvSnapshotView: React.FC<TdCctvSnapshotViewProps> = ({
  camera,
  allCameras = [],
  locale,
  compact = true,
  onSelectCamera,
  onFlyToCamera,
}) => {
  // 3-Stage Image Pipeline:
  // 'proxy' -> /api/cctv-snapshot/:id (Edge cached <5ms)
  // 'direct' -> https://tdcctv.data.one.gov.hk/:id.JPG (Cloudflare Edge HIT)
  // 'fallback' -> Optical Simulation SVG if completely offline
  const [sourceStage, setSourceStage] = useState<'proxy' | 'direct' | 'fallback'>('proxy');
  const [imgLoaded, setImgLoaded] = useState<boolean>(false);
  const [refreshTick, setRefreshTick] = useState<number>(0);
  const [modalOpen, setModalOpen] = useState<boolean>(false);

  const t = UI_TRANSLATIONS[locale];

  useEffect(() => {
    setSourceStage('proxy');
    setImgLoaded(false);
  }, [camera.id]);

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSourceStage('proxy');
    setImgLoaded(false);
    setRefreshTick((prev) => prev + 1);
  };

  const handleImageError = () => {
    if (sourceStage === 'proxy') {
      setSourceStage('direct');
      setImgLoaded(false);
    } else if (sourceStage === 'direct') {
      setSourceStage('fallback');
    }
  };

  const minuteBucket = Math.floor(Date.now() / 60000);
  const activeImgSrc =
    sourceStage === 'proxy'
      ? `/api/cctv-snapshot/${camera.id}?m=${minuteBucket}&r=${refreshTick}`
      : camera.imageUrl;

  const cameraTitle = pickLocaleText(locale, camera.nameZh, camera.nameSc, camera.nameEn);
  const corridorLabel = pickLocaleText(
    locale,
    camera.corridorZh,
    camera.corridorSc,
    camera.corridorEn
  );

  const statusBadgeText =
    camera.trafficStatus === 'bad'
      ? pickLocaleText(locale, '嚴重擠塞', '严重拥堵', 'Congested')
      : camera.trafficStatus === 'average'
      ? pickLocaleText(locale, '行車緩慢', '行车缓慢', 'Slow')
      : pickLocaleText(locale, '行車暢順', '行车畅顺', 'Smooth');

  const statusTone =
    camera.trafficStatus === 'bad'
      ? 'text-rose-300 border-rose-500/50 bg-rose-950/85'
      : camera.trafficStatus === 'average'
      ? 'text-amber-200 border-amber-500/50 bg-amber-950/85'
      : 'text-emerald-300 border-emerald-500/50 bg-emerald-950/85';

  const renderCameraVisual = (isLarge: boolean) => {
    return (
      <div
        onClick={(e) => {
          if (compact && !isLarge) {
            e.stopPropagation();
            setModalOpen(true);
          }
        }}
        className={`relative w-full ${
          isLarge ? 'h-72 sm:h-[420px]' : 'h-44'
        } bg-slate-900 rounded-xl overflow-hidden border border-cyan-500/35 shadow-inner group ${
          compact && !isLarge ? 'cursor-zoom-in' : ''
        }`}
      >
        {/* Real Transport Department CCTV JPEG Snapshot */}
        {sourceStage !== 'fallback' && (
          <img
            key={`${camera.id}-${sourceStage}-${refreshTick}`}
            src={activeImgSrc}
            alt={`TD CCTV ${camera.id} - ${cameraTitle}`}
            onLoad={() => setImgLoaded(true)}
            onError={handleImageError}
            className={`w-full h-full object-cover brightness-105 contrast-105 transition-opacity duration-200 ${
              imgLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        {/* Loading Shimmer or Offline Optical Fallback */}
        {(sourceStage === 'fallback' || !imgLoaded) && (
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 flex flex-col justify-between p-3">
            <svg
              viewBox="0 0 400 180"
              className="absolute inset-0 w-full h-full object-cover opacity-90"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id={`sky-${camera.id}-${isLarge ? 'lg' : 'sm'}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0f172a" />
                  <stop offset="55%" stopColor="#1e293b" />
                  <stop offset="100%" stopColor="#020617" />
                </linearGradient>
              </defs>
              <rect width="400" height="180" fill={`url(#sky-${camera.id}-${isLarge ? 'lg' : 'sm'})`} />
              <rect x="20" y="22" width="28" height="58" fill="#334155" opacity="0.55" />
              <rect x="55" y="12" width="34" height="68" fill="#334155" opacity="0.7" />
              <rect x="96" y="28" width="24" height="52" fill="#334155" opacity="0.5" />
              <rect x="275" y="16" width="38" height="64" fill="#334155" opacity="0.65" />
              <rect x="320" y="26" width="30" height="54" fill="#334155" opacity="0.5" />
              <polygon points="155,80 245,80 385,180 15,180" fill="#0f172a" stroke="#475569" strokeWidth="1" />
              <line x1="200" y1="80" x2="200" y2="180" stroke="#f59e0b" strokeWidth="2" strokeDasharray="6 4" />
              <line x1="175" y1="80" x2="95" y2="180" stroke="#64748b" strokeWidth="1.2" strokeDasharray="5 5" />
              <line x1="225" y1="80" x2="305" y2="180" stroke="#64748b" strokeWidth="1.2" strokeDasharray="5 5" />
              {camera.trafficStatus === 'bad' ? (
                <g>
                  <circle cx="175" cy="105" r="3.5" fill="#ef4444" />
                  <circle cx="188" cy="105" r="3.5" fill="#ef4444" />
                  <circle cx="162" cy="122" r="4.5" fill="#ef4444" />
                  <circle cx="178" cy="122" r="4.5" fill="#ef4444" />
                  <circle cx="145" cy="144" r="5.5" fill="#ef4444" />
                  <circle cx="166" cy="144" r="5.5" fill="#ef4444" />
                  <circle cx="122" cy="166" r="6.5" fill="#ef4444" />
                  <circle cx="148" cy="166" r="6.5" fill="#ef4444" />
                  <circle cx="222" cy="115" r="4" fill="#fef08a" />
                  <circle cx="236" cy="115" r="4" fill="#fef08a" />
                </g>
              ) : (
                <g>
                  <circle cx="155" cy="142" r="4.5" fill="#10b981" />
                  <circle cx="172" cy="142" r="4.5" fill="#10b981" />
                  <circle cx="242" cy="128" r="4.5" fill="#38bdf8" />
                  <circle cx="258" cy="128" r="4.5" fill="#38bdf8" />
                </g>
              )}
            </svg>
            {!imgLoaded && sourceStage !== 'fallback' && (
              <div className="relative z-10 m-auto px-3 py-1.5 rounded-lg bg-slate-950/85 border border-cyan-500/40 text-xs text-cyan-300 flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                <span>
                  {pickLocaleText(
                    locale,
                    '正在載入運輸署實時 CCTV 畫面...',
                    '正在加载运输署实时 CCTV 画面...',
                    'Loading TD Live CCTV Snapshot...'
                  )}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Top Telemetry Badge Row (Does NOT darken the center of the image) */}
        <div className="absolute top-2 left-2.5 right-2.5 flex items-center justify-between gap-2 text-[11px] font-mono-tabular pointer-events-none">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-950/85 backdrop-blur-sm border border-cyan-500/40 text-cyan-300 font-semibold shadow">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <Camera className="w-3 h-3 text-cyan-400" />
            <span>LIVE · {camera.id}</span>
          </div>
          <div className={`px-2 py-0.5 rounded-md border text-[10px] font-bold shadow ${statusTone}`}>
            {statusBadgeText}
          </div>
        </div>

        {/* Slim Bottom Caption Scrim (Only covers bottom 48px for text legibility) */}
        <div className="absolute inset-x-0 bottom-0 pt-6 pb-2 px-2.5 bg-gradient-to-t from-slate-950/95 via-slate-950/65 to-transparent flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-bold text-white truncate drop-shadow">{cameraTitle}</div>
            <div className="text-[10px] text-slate-200 truncate">{corridorLabel}</div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleRefresh}
              className="p-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-cyan-300 transition-colors"
              title={t.refreshSnapshot}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            {compact && !isLarge && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setModalOpen(true);
                }}
                className="p-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-cyan-300 transition-colors"
                title={t.enlargeSnapshot}
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {renderCameraVisual(false)}

      {/* Full-Screen TD CCTV Matrix Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="max-w-3xl w-full bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto custom-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-cyan-400 flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    {t.liveCctvBadge} · DATA.GOV.HK ({camera.id})
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mt-0.5">{cameraTitle}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{corridorLabel}</p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800/70"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {renderCameraVisual(true)}

            {/* Quick Camera Matrix Switcher across HK Entrances & Tunnels */}
            {allCameras.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-300">
                  {pickLocaleText(
                    locale,
                    '切換全港重點車場入口及過海隧道實時鏡頭：',
                    '切换全港重点车场入口及过海隧道实时镜头：',
                    'Switch HK Carpark Entrance & Tunnel Live CCTV Feeds:'
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                  {allCameras.map((cam) => {
                    const active = cam.id === camera.id;
                    const label = pickLocaleText(locale, cam.nameZh, cam.nameSc, cam.nameEn);
                    return (
                      <button
                        key={cam.id}
                        onClick={() => {
                          onSelectCamera?.(cam);
                        }}
                        className={`text-left p-1.5 rounded-lg border transition-all flex items-center gap-2 ${
                          active
                            ? 'bg-cyan-500/20 border-cyan-400 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <img
                          src={`/api/cctv-snapshot/${cam.id}?m=${minuteBucket}`}
                          onError={(e) => {
                            const target = e.currentTarget;
                            if (target.src !== cam.imageUrl) {
                              target.src = cam.imageUrl;
                            }
                          }}
                          alt={cam.id}
                          className="w-12 h-9 rounded object-cover shrink-0 bg-slate-900 border border-slate-800"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-mono-tabular text-[10px] font-bold text-cyan-300">
                            {cam.id}
                          </div>
                          <div className="text-[10px] text-slate-200 truncate">
                            {label.split(' (')[0].split(' [')[0]}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs text-slate-400">
              <span>
                {pickLocaleText(
                  locale,
                  '資料來源：香港運輸署全港閉路電視快照 (每 60 秒更新)',
                  '资料来源：香港运输署全港闭路电视快照 (每 60 秒更新)',
                  'Source: HK Transport Department Traffic Snapshot Images (60s interval)'
                )}
              </span>
              {onFlyToCamera && (
                <button
                  onClick={() => {
                    onFlyToCamera(camera);
                    setModalOpen(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs flex items-center gap-1.5"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>
                    {pickLocaleText(locale, '飛往此鏡頭位置', '飞往此镜头位置', 'Fly to Camera')}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
