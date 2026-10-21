import React, { useEffect, useRef, useState } from 'react';
import type * as MapLibreNamespace from 'maplibre-gl';
import {
  CarparkFacility,
  SmartMeterSpot,
  RoadSegment,
  TdCctvCamera,
  LocaleKey,
  EvPowerFilter,
  QuickFilterKey,
  ViewportBBox,
  createOctagonPolygon,
  pickLocaleText,
  calculateDistanceKm,
  escapeHtml,
} from '../data/hkParkingData';
import { aggregateSmartMetersByCorridor } from '../utils/tdSmartMeterService';

// Resolve MapLibre GL JS v4 runtime loaded via CDN in index.html
const getMapLibre = (): typeof MapLibreNamespace | null => {
  const win = window as unknown as { maplibregl?: typeof MapLibreNamespace };
  return win.maplibregl ?? null;
};

interface HkDigitalTwinMapProps {
  carparks: CarparkFacility[];
  allCarparks: CarparkFacility[];
  meters: SmartMeterSpot[];
  roads: RoadSegment[];
  cctvCameras: TdCctvCamera[];
  locale: LocaleKey;
  evPowerFilter: EvPowerFilter;
  quickFilter: QuickFilterKey;
  selectedCarparkId: string | null;
  selectedMeterId: string | null;
  selectedCctvId: string | null;
  is3DView: boolean;
  showRoadsLayer: boolean;
  showMetersLayer: boolean;
  showCctvLayer: boolean;
  cameraTarget: {
    center: [number, number];
    zoom: number;
    pitch: number;
    bearing: number;
    timestamp: number;
  } | null;
  onSelectCarpark: (carpark: CarparkFacility | null) => void;
  onSelectMeter: (meter: SmartMeterSpot | null) => void;
  onSelectCctv: (camera: TdCctvCamera) => void;
  onZoomChange?: (zoom: number) => void;
  onViewportChange?: (viewport: {
    center: [number, number];
    bbox: ViewportBBox;
    zoom: number;
  }) => void;
  userGpsLocation?: [number, number] | null;
  activeRouteCoords?: [number, number][] | null;
  isPickingMapOrigin?: boolean;
  onPickMapOrigin?: (coords: [number, number]) => void;
  initialCenter?: [number, number];
  initialZoom?: number;
  isMobile?: boolean;
  mapTheme?: 'light' | 'dark';
}

export const HkDigitalTwinMap: React.FC<HkDigitalTwinMapProps> = ({
  carparks,
  meters,
  roads,
  cctvCameras,
  locale,
  evPowerFilter,
  quickFilter,
  selectedCarparkId,
  selectedMeterId,
  selectedCctvId,
  is3DView,
  showRoadsLayer,
  showMetersLayer,
  showCctvLayer,
  cameraTarget,
  onSelectCarpark,
  onSelectMeter,
  onSelectCctv,
  onZoomChange,
  onViewportChange,
  userGpsLocation,
  activeRouteCoords,
  isPickingMapOrigin,
  onPickMapOrigin,
  initialCenter,
  initialZoom,
  isMobile = false,
  mapTheme = 'light',
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreNamespace.Map | null>(null);
  const carparksDataRef = useRef<CarparkFacility[]>(carparks);
  const metersDataRef = useRef<SmartMeterSpot[]>(meters);
  const isPickingOriginRef = useRef<boolean>(Boolean(isPickingMapOrigin));
  const onPickMapOriginRef = useRef<typeof onPickMapOrigin>(onPickMapOrigin);
  carparksDataRef.current = carparks;
  metersDataRef.current = meters;
  isPickingOriginRef.current = Boolean(isPickingMapOrigin);
  onPickMapOriginRef.current = onPickMapOrigin;

  const markersRef = useRef<
    Map<string, { marker: MapLibreNamespace.Marker; rootEl: HTMLDivElement }>
  >(new Map());
  const cctvMarkersRef = useRef<
    Map<string, { marker: MapLibreNamespace.Marker; rootEl: HTMLDivElement }>
  >(new Map());
  const userGpsMarkerRef = useRef<{
    marker: MapLibreNamespace.Marker;
    rootEl: HTMLDivElement;
  } | null>(null);
  const selectedMeterMarkerRef = useRef<{
    marker: MapLibreNamespace.Marker;
    rootEl: HTMLDivElement;
  } | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [webglFallback, setWebglFallback] = useState(false);

  // Explicit GeoJSON types for MapLibre sources
  type GeoJSONFeature = {
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry:
      | { type: 'Point'; coordinates: [number, number] }
      | { type: 'LineString'; coordinates: [number, number][] }
      | { type: 'Polygon'; coordinates: [number, number][][] };
  };

  type GeoJSONFeatureCollection = {
    type: 'FeatureCollection';
    features: GeoJSONFeature[];
  };

  const activeEvMode: EvPowerFilter =
    evPowerFilter !== 'all'
      ? evPowerFilter
      : quickFilter === 'ev_dc'
      ? 'dc_super'
      : 'all';

  // Helper to build GeoJSON for 3D Carpark Vacancy / EV Spec Energy Pillars
  const buildCarparkPillarsGeoJSON = (items: CarparkFacility[]): GeoJSONFeatureCollection => {
    return {
      type: 'FeatureCollection',
      features: items.map((cp) => {
        let color = '#10b981';
        let height = 4;

        if (activeEvMode === 'dc_super') {
          const dcAvail = cp.evInfo.dcAvailable;
          color = dcAvail >= 5 ? '#06b6d4' : dcAvail >= 1 ? '#f59e0b' : '#ef4444';
          height = is3DView
            ? Math.max(44, Math.min(275, 36 + dcAvail * 13 + cp.evInfo.dcMaxKw * 0.28))
            : 4;
        } else if (activeEvMode === 'ac_medium') {
          const acAvail = cp.evInfo.acAvailable;
          color = acAvail >= 12 ? '#a855f7' : acAvail >= 4 ? '#f59e0b' : '#ef4444';
          height = is3DView
            ? Math.max(42, Math.min(265, 34 + acAvail * 6.5 + cp.evInfo.acMaxKw * 1.5))
            : 4;
        } else {
          const isAbundant = cp.availableSpaces > 20;
          const isLimited = cp.availableSpaces >= 5 && cp.availableSpaces <= 20;
          color = isAbundant ? '#10b981' : isLimited ? '#f59e0b' : '#ef4444';
          height = is3DView
            ? Math.max(34, Math.min(265, 28 + cp.availableSpaces * 2.5))
            : 4;
        }

        return {
          type: 'Feature',
          properties: {
            id: cp.id,
            nameZh: cp.nameZh,
            availableSpaces: cp.availableSpaces,
            color,
            height,
            queueRisk: cp.queueRisk,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [createOctagonPolygon(cp.coordinates, 24)],
          },
        };
      }),
    };
  };

  // Helper to build GeoJSON for Entrance Queue Jam Warning Halos
  const buildQueueHalosGeoJSON = (items: CarparkFacility[]): GeoJSONFeatureCollection => {
    const queueItems = items.filter((cp) => cp.queueRisk);
    const features: GeoJSONFeature[] = [];

    queueItems.forEach((cp) => {
      features.push({
        type: 'Feature',
        properties: {
          id: `${cp.id}-outer`,
          carparkId: cp.id,
          ring: 'outer',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [createOctagonPolygon(cp.coordinates, 64)],
        },
      });
      features.push({
        type: 'Feature',
        properties: {
          id: `${cp.id}-inner`,
          carparkId: cp.id,
          ring: 'inner',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [createOctagonPolygon(cp.coordinates, 42)],
        },
      });
    });

    return {
      type: 'FeatureCollection',
      features,
    };
  };

  // Helper to build GeoJSON for Curbside Smart Meters: ONE single Dot per street section
  // colored by occupancy rate (<50% full Green, 50-79% full Amber, >=80% full Red)
  const buildSmartMetersGeoJSON = (spots: SmartMeterSpot[]): GeoJSONFeatureCollection => {
    const corridors = aggregateSmartMetersByCorridor(spots);
    const features: GeoJSONFeature[] = new Array(corridors.length);
    for (let i = 0; i < corridors.length; i++) {
      const corr = corridors[i];
      features[i] = {
        type: 'Feature',
        properties: {
          id: corr.sampleMeter.id,
          corridorKey: corr.corridorKey,
          occupied: corr.vacantBays === 0,
          vacantBays: corr.vacantBays,
          totalBays: corr.totalBays,
          occupiedBays: corr.occupiedBays,
          occupancyRatePct: corr.occupancyRatePct,
          color: corr.occupancyColor,
        },
        geometry: {
          type: 'Point',
          coordinates: corr.centerCoordinates,
        },
      };
    }
    return {
      type: 'FeatureCollection',
      features,
    };
  };

  // Helper to build GeoJSON for Selected Smart Meter Street-Section Highlight Halo
  const buildSelectedMeterGeoJSON = (
    spots: SmartMeterSpot[],
    selId: string | null
  ): GeoJSONFeatureCollection => {
    if (!selId) return { type: 'FeatureCollection', features: [] };
    const found = spots.find((s) => s.id === selId);
    if (!found) return { type: 'FeatureCollection', features: [] };
    const corridors = aggregateSmartMetersByCorridor(spots);
    const key = `${found.districtKey}|${found.streetEn}|${found.sectionOfStreetEn || ''}`;
    const corr = corridors.find((c) => c.corridorKey === key);
    const coords = corr ? corr.centerCoordinates : found.coordinates;
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            id: found.id,
            occupied: corr ? corr.vacantBays === 0 : found.occupied,
            color: corr ? corr.occupancyColor : '#00f59b',
          },
          geometry: {
            type: 'Point',
            coordinates: coords,
          },
        },
      ],
    };
  };

  // Helper to build GeoJSON for Strategic Road Network Speeds
  const buildRoadsGeoJSON = (segments: RoadSegment[]): GeoJSONFeatureCollection => {
    return {
      type: 'FeatureCollection',
      features: segments.map((seg) => {
        const color =
          seg.status === 'good'
            ? '#10b981'
            : seg.status === 'average'
            ? '#f59e0b'
            : '#ef4444';
        return {
          type: 'Feature',
          properties: {
            id: seg.id,
            nameZh: seg.nameZh,
            speedKmh: seg.speedKmh,
            status: seg.status,
            color,
          },
          geometry: {
            type: 'LineString',
            coordinates: seg.coordinates,
          },
        };
      }),
    };
  };

  // Helper to build GeoJSON for Active Shortest Route Polyline
  const buildActiveRouteGeoJSON = (
    coords: [number, number][] | null | undefined
  ): GeoJSONFeatureCollection => {
    if (!coords || coords.length < 2) {
      return { type: 'FeatureCollection', features: [] };
    }
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 'active-route' },
          geometry: {
            type: 'LineString',
            coordinates: coords,
          },
        },
      ],
    };
  };

  // Helper to build GeoJSON polygon for Mobile 2KM Radius Area around user location
  const build2KmCircleGeoJSON = (
    center: [number, number] | null | undefined
  ): GeoJSONFeatureCollection => {
    if (!center) return { type: 'FeatureCollection', features: [] };
    const [lng, lat] = center;
    const radiusKm = 2.0;
    const points = 64;
    const coordinates: [number, number][] = [];
    const distanceX = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
    const distanceY = radiusKm / 110.574;

    for (let i = 0; i <= points; i++) {
      const theta = (i / points) * (2 * Math.PI);
      const x = distanceX * Math.cos(theta);
      const y = distanceY * Math.sin(theta);
      coordinates.push([lng + x, lat + y]);
    }

    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { id: 'mobile-2km-radius', radiusKm: 2.0 },
          geometry: {
            type: 'Polygon',
            coordinates: [coordinates],
          },
        },
      ],
    };
  };

  // Store original OpenFreeMap Liberty default paint properties for clean restoration
  const originalPaintPropsRef = useRef<Map<string, Record<string, any>>>(new Map());

  // Apply Conventional Light theme (natural daylight colors, green parks, blue waterways, clear street grids)
  const applyConventionalLightTheme = (map: MapLibreNamespace.Map) => {
    const style = map.getStyle();
    if (!style || !style.layers) return;

    const original = originalPaintPropsRef.current;
    if (original.size > 0) {
      for (const [layerId, paint] of original.entries()) {
        if (map.getLayer(layerId)) {
          for (const [prop, val] of Object.entries(paint)) {
            try {
              map.setPaintProperty(layerId, prop as any, val);
            } catch {}
          }
        }
      }
    } else {
      for (const layer of style.layers) {
        try {
          if (layer.type === 'background') {
            map.setPaintProperty(layer.id, 'background-color', '#f8fafc');
          } else if (layer.type === 'fill') {
            if (layer.id.includes('water')) {
              map.setPaintProperty(layer.id, 'fill-color', '#93c5fd');
            } else if (
              layer.id.includes('park') ||
              layer.id.includes('grass') ||
              layer.id.includes('wood') ||
              layer.id.includes('landcover')
            ) {
              map.setPaintProperty(layer.id, 'fill-color', '#d1fae5');
              map.setPaintProperty(layer.id, 'fill-opacity', 0.65);
            } else if (layer.id.includes('building')) {
              map.setPaintProperty(layer.id, 'fill-color', '#e2e8f0');
              map.setPaintProperty(layer.id, 'fill-opacity', 0.7);
            } else if (layer.id.includes('landuse') || layer.id.includes('residential')) {
              map.setPaintProperty(layer.id, 'fill-color', '#f1f5f9');
              map.setPaintProperty(layer.id, 'fill-opacity', 0.6);
            }
          } else if (layer.type === 'line') {
            if (
              layer.id.includes('road') ||
              layer.id.includes('highway') ||
              layer.id.includes('transportation') ||
              layer.id.includes('bridge') ||
              layer.id.includes('tunnel')
            ) {
              map.setPaintProperty(layer.id, 'line-color', '#cbd5e1');
              map.setPaintProperty(layer.id, 'line-opacity', 0.85);
            } else if (layer.id.includes('boundary')) {
              map.setPaintProperty(layer.id, 'line-color', '#94a3b8');
              map.setPaintProperty(layer.id, 'line-opacity', 0.45);
            }
          } else if (layer.type === 'symbol') {
            if (
              layer.id.includes('label') ||
              layer.id.includes('place') ||
              layer.id.includes('road') ||
              layer.id.includes('poi')
            ) {
              map.setPaintProperty(layer.id, 'text-color', '#1e293b');
              map.setPaintProperty(layer.id, 'text-halo-color', '#ffffff');
              map.setPaintProperty(layer.id, 'text-halo-width', 2);
            }
          }
        } catch {}
      }
    }

    // Overlay layers styled for crisp daylight readability
    try {
      if (map.getLayer('hk-mobile-2km-fill')) {
        map.setPaintProperty('hk-mobile-2km-fill', 'fill-color', '#0284c7');
        map.setPaintProperty('hk-mobile-2km-fill', 'fill-opacity', 0.07);
      }
      if (map.getLayer('hk-mobile-2km-stroke')) {
        map.setPaintProperty('hk-mobile-2km-stroke', 'line-color', '#0284c7');
        map.setPaintProperty('hk-mobile-2km-stroke', 'line-opacity', 0.8);
      }
      if (map.getLayer('hk-smart-meters-dots')) {
        map.setPaintProperty('hk-smart-meters-dots', 'circle-stroke-color', '#ffffff');
      }
      if (map.getLayer('hk-active-route-core')) {
        map.setPaintProperty('hk-active-route-core', 'line-color', '#2563eb');
      }
      if (map.getLayer('hk-active-route-dash')) {
        map.setPaintProperty('hk-active-route-dash', 'line-color', '#ffffff');
      }
      if (map.getLayer('hk-active-route-glow')) {
        map.setPaintProperty('hk-active-route-glow', 'line-color', '#60a5fa');
        map.setPaintProperty('hk-active-route-glow', 'line-opacity', 0.45);
      }
      if (map.getLayer('hk-carparks-pillars-3d')) {
        map.setPaintProperty('hk-carparks-pillars-3d', 'fill-extrusion-opacity', 0.92);
      }
    } catch {}
  };

  // Apply Dark Digital Twin theme overrides to OpenFreeMap Liberty style
  const applyDarkDigitalTwinTheme = (map: MapLibreNamespace.Map) => {
    const style = map.getStyle();
    if (!style || !style.layers) return;

    for (const layer of style.layers) {
      try {
        if (layer.type === 'background') {
          map.setPaintProperty(layer.id, 'background-color', '#060c1a');
        } else if (layer.type === 'fill') {
          if (layer.id.includes('water')) {
            map.setPaintProperty(layer.id, 'fill-color', '#020617');
          } else if (
            layer.id.includes('park') ||
            layer.id.includes('grass') ||
            layer.id.includes('wood') ||
            layer.id.includes('landcover')
          ) {
            map.setPaintProperty(layer.id, 'fill-color', '#081824');
            map.setPaintProperty(layer.id, 'fill-opacity', 0.55);
          } else if (layer.id.includes('building')) {
            map.setPaintProperty(layer.id, 'fill-color', '#0f172a');
            map.setPaintProperty(layer.id, 'fill-opacity', 0.7);
          } else if (layer.id.includes('landuse') || layer.id.includes('residential')) {
            map.setPaintProperty(layer.id, 'fill-color', '#091122');
            map.setPaintProperty(layer.id, 'fill-opacity', 0.45);
          }
        } else if (layer.type === 'line') {
          if (
            layer.id.includes('road') ||
            layer.id.includes('highway') ||
            layer.id.includes('transportation') ||
            layer.id.includes('bridge') ||
            layer.id.includes('tunnel')
          ) {
            map.setPaintProperty(layer.id, 'line-color', '#1e293b');
            map.setPaintProperty(layer.id, 'line-opacity', 0.75);
          } else if (layer.id.includes('boundary')) {
            map.setPaintProperty(layer.id, 'line-color', '#334155');
            map.setPaintProperty(layer.id, 'line-opacity', 0.35);
          }
        } else if (layer.type === 'fill-extrusion') {
          map.setPaintProperty(layer.id, 'fill-extrusion-color', '#131e36');
          map.setPaintProperty(layer.id, 'fill-extrusion-opacity', 0.78);
        } else if (layer.type === 'symbol') {
          if (
            layer.id.includes('label') ||
            layer.id.includes('place') ||
            layer.id.includes('road') ||
            layer.id.includes('poi')
          ) {
            map.setPaintProperty(layer.id, 'text-color', '#94a3b8');
            map.setPaintProperty(layer.id, 'text-halo-color', '#020617');
            map.setPaintProperty(layer.id, 'text-halo-width', 1.5);
          }
        }
      } catch {
        // Ignore individual style property mismatches
      }
    }

    // Overlay layers styled for dark digital twin night glow
    try {
      if (map.getLayer('hk-mobile-2km-fill')) {
        map.setPaintProperty('hk-mobile-2km-fill', 'fill-color', '#06b6d4');
        map.setPaintProperty('hk-mobile-2km-fill', 'fill-opacity', 0.08);
      }
      if (map.getLayer('hk-mobile-2km-stroke')) {
        map.setPaintProperty('hk-mobile-2km-stroke', 'line-color', '#22d3ee');
        map.setPaintProperty('hk-mobile-2km-stroke', 'line-opacity', 0.7);
      }
      if (map.getLayer('hk-smart-meters-dots')) {
        map.setPaintProperty('hk-smart-meters-dots', 'circle-stroke-color', '#020617');
      }
      if (map.getLayer('hk-active-route-core')) {
        map.setPaintProperty('hk-active-route-core', 'line-color', '#06b6d4');
      }
      if (map.getLayer('hk-active-route-dash')) {
        map.setPaintProperty('hk-active-route-dash', 'line-color', '#ecfeff');
      }
      if (map.getLayer('hk-active-route-glow')) {
        map.setPaintProperty('hk-active-route-glow', 'line-color', '#22d3ee');
        map.setPaintProperty('hk-active-route-glow', 'line-opacity', 0.36);
      }
      if (map.getLayer('hk-carparks-pillars-3d')) {
        map.setPaintProperty('hk-carparks-pillars-3d', 'fill-extrusion-opacity', 0.88);
      }
    } catch {}
  };

  // Initialize MapLibre GL JS v4 via CDN runtime
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const maplibregl = getMapLibre();
    if (!maplibregl) {
      setWebglFallback(true);
      return;
    }

    try {
      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: initialCenter || [114.1585, 22.2818],
        zoom: initialZoom || (isMobile ? 16.0 : 15.8),
        pitch: isMobile ? 0 : 42,
        bearing: 0,
        minZoom: 10.5,
        maxZoom: 19,
        maxPitch: 75,
        attributionControl: false,
      });

      mapRef.current = map;

      map.addControl(
        new maplibregl.NavigationControl({
          visualizePitch: true,
          showCompass: true,
          showZoom: true,
        }),
        'bottom-right'
      );

      const canvas = map.getCanvas();
      const handleContextLost = (e: Event) => {
        e.preventDefault();
        setWebglFallback(true);
      };
      const handleContextRestored = () => {
        setWebglFallback(false);
      };
      canvas.addEventListener('webglcontextlost', handleContextLost);
      canvas.addEventListener('webglcontextrestored', handleContextRestored);

      const emitViewportState = () => {
        const z = Number(map.getZoom().toFixed(2));
        onZoomChange?.(z);
        const center = map.getCenter();
        const b = map.getBounds();
        if (b && center) {
          onViewportChange?.({
            center: [Number(center.lng.toFixed(5)), Number(center.lat.toFixed(5))],
            bbox: [
              Number(b.getWest().toFixed(5)),
              Number(b.getSouth().toFixed(5)),
              Number(b.getEast().toFixed(5)),
              Number(b.getNorth().toFixed(5)),
            ],
            zoom: z,
          });
        }
      };

      let moveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
      map.on('moveend', () => {
        if (moveDebounceTimer) clearTimeout(moveDebounceTimer);
        moveDebounceTimer = setTimeout(() => {
          emitViewportState();
        }, 250);
      });

      map.on('load', () => {
        const style = map.getStyle();
        if (style && style.layers) {
          for (const layer of style.layers) {
            if (layer.paint) {
              originalPaintPropsRef.current.set(layer.id, { ...layer.paint });
            }
          }
        }

        if (mapTheme === 'dark') {
          applyDarkDigitalTwinTheme(map);
        } else {
          applyConventionalLightTheme(map);
        }
        emitViewportState();

        // 0. Mobile 2KM Radius Area Perimeter Source & Layers
        map.addSource('hk-mobile-2km-source', {
          type: 'geojson',
          data: build2KmCircleGeoJSON(isMobile ? userGpsLocation : null),
        });

        map.addLayer({
          id: 'hk-mobile-2km-fill',
          type: 'fill',
          source: 'hk-mobile-2km-source',
          paint: {
            'fill-color': '#06b6d4',
            'fill-opacity': 0.08,
          },
        });

        map.addLayer({
          id: 'hk-mobile-2km-stroke',
          type: 'line',
          source: 'hk-mobile-2km-source',
          paint: {
            'line-color': '#22d3ee',
            'line-width': 2,
            'line-dasharray': [3, 2],
            'line-opacity': 0.7,
          },
        });

        // 1. Strategic Road Network Speeds Source & Layers
        map.addSource('hk-roads-source', {
          type: 'geojson',
          data: buildRoadsGeoJSON(roads),
        });

        map.addLayer({
          id: 'hk-roads-glow',
          type: 'line',
          source: 'hk-roads-source',
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': ['interpolate', ['linear'], ['zoom'], 12, 6, 16, 14],
            'line-opacity': 0.24,
            'line-blur': 4,
          },
        });

        map.addLayer({
          id: 'hk-roads-core',
          type: 'line',
          source: 'hk-roads-source',
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 16, 5.5],
            'line-opacity': 0.9,
          },
        });

        // 2. Entrance Queue Jam Warning Halos Source & Layers
        map.addSource('hk-queue-halos-source', {
          type: 'geojson',
          data: buildQueueHalosGeoJSON(carparks),
        });

        map.addLayer({
          id: 'hk-queue-halos-fill',
          type: 'fill',
          source: 'hk-queue-halos-source',
          paint: {
            'fill-color': '#ef4444',
            'fill-opacity': ['match', ['get', 'ring'], 'inner', 0.38, 0.18],
          },
        });

        map.addLayer({
          id: 'hk-queue-halos-stroke',
          type: 'line',
          source: 'hk-queue-halos-source',
          paint: {
            'line-color': '#f87171',
            'line-width': ['match', ['get', 'ring'], 'inner', 2.2, 1.4],
            'line-dasharray': [2, 2],
            'line-opacity': 0.9,
          },
        });

        // 3. Curbside Smart Parking Meters Source & Layers (1 Single Dot per Street Section, colored by Occupancy Rate)
        map.addSource('hk-smart-meters-source', {
          type: 'geojson',
          data: buildSmartMetersGeoJSON(metersDataRef.current),
        });

        map.addLayer({
          id: 'hk-smart-meters-glow',
          type: 'circle',
          source: 'hk-smart-meters-source',
          minzoom: 11.5,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 11.5, 4.5, 15, 10, 18, 18],
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.3,
            'circle-blur': 0.65,
          },
        });

        map.addLayer({
          id: 'hk-smart-meters-dots',
          type: 'circle',
          source: 'hk-smart-meters-source',
          minzoom: 10.0,
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10.0,
              2.6,
              12.0,
              4.0,
              14.0,
              5.8,
              16.0,
              8.5,
              18.0,
              11.5,
            ],
            'circle-color': ['get', 'color'],
            'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 10.0, 0.7, 14.5, 1.6],
            'circle-stroke-color': '#020617',
            'circle-opacity': 0.96,
          },
        });

        // 3.5 Selected Smart Meter Highlight Halo Source & Layer
        map.addSource('hk-selected-meter-source', {
          type: 'geojson',
          data: buildSelectedMeterGeoJSON(metersDataRef.current, selectedMeterId),
        });

        map.addLayer({
          id: 'hk-selected-meter-ring',
          type: 'circle',
          source: 'hk-selected-meter-source',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 7, 15, 11, 18, 16],
            'circle-color': '#22d3ee',
            'circle-opacity': 0.35,
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#ffffff',
          },
        });

        // 4.5 Active Shortest Navigation Route Source & Glowing Layers
        map.addSource('hk-active-route-source', {
          type: 'geojson',
          data: buildActiveRouteGeoJSON(activeRouteCoords),
        });

        map.addLayer({
          id: 'hk-active-route-glow',
          type: 'line',
          source: 'hk-active-route-source',
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': '#22d3ee',
            'line-width': ['interpolate', ['linear'], ['zoom'], 11, 10, 16, 20],
            'line-opacity': 0.36,
            'line-blur': 5,
          },
        });

        map.addLayer({
          id: 'hk-active-route-core',
          type: 'line',
          source: 'hk-active-route-source',
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': '#06b6d4',
            'line-width': ['interpolate', ['linear'], ['zoom'], 11, 4.5, 16, 8],
            'line-opacity': 0.96,
          },
        });

        map.addLayer({
          id: 'hk-active-route-dash',
          type: 'line',
          source: 'hk-active-route-source',
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': '#ecfeff',
            'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2, 16, 3.5],
            'line-dasharray': [1.5, 2.2],
            'line-opacity': 0.92,
          },
        });

        // 5. 3D Carpark Vacancy Energy Pillars Source & Extrusion Layer
        map.addSource('hk-carparks-3d-source', {
          type: 'geojson',
          data: buildCarparkPillarsGeoJSON(carparks),
        });

        map.addLayer({
          id: 'hk-carparks-pillars-3d',
          type: 'fill-extrusion',
          source: 'hk-carparks-3d-source',
          paint: {
            'fill-extrusion-color': ['get', 'color'],
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': 0,
            'fill-extrusion-opacity': 0.88,
          },
        });

        // Click on map canvas to set custom GPS origin when isPickingMapOrigin is active, or deselect active facility
        map.on('click', (e) => {
          if (isPickingOriginRef.current && onPickMapOriginRef.current) {
            onPickMapOriginRef.current([
              Number(e.lngLat.lng.toFixed(5)),
              Number(e.lngLat.lat.toFixed(5)),
            ]);
          } else if (!e.defaultPrevented) {
            onSelectCarpark(null);
            onSelectMeter(null);
          }
        });

        // Click interaction on 3D Carpark Pillar
        map.on('click', 'hk-carparks-pillars-3d', (e) => {
          if (isPickingOriginRef.current) return;
          const feat = e.features?.[0];
          const cpId = feat?.properties?.id;
          if (cpId) {
            const found = carparksDataRef.current.find((c) => c.id === cpId);
            if (found) onSelectCarpark(found);
          }
        });

        // Click interaction on Curbside Smart Meter Dot
        map.on('click', 'hk-smart-meters-dots', (e) => {
          if (isPickingOriginRef.current) return;
          const feat = e.features?.[0];
          const mId = feat?.properties?.id;
          if (mId) {
            const found = metersDataRef.current.find((m) => m.id === mId);
            if (found) onSelectMeter(found);
          }
        });

        map.on('mouseenter', 'hk-carparks-pillars-3d', () => {
          map.getCanvas().style.cursor = isPickingOriginRef.current ? 'crosshair' : 'pointer';
        });
        map.on('mouseleave', 'hk-carparks-pillars-3d', () => {
          map.getCanvas().style.cursor = isPickingOriginRef.current ? 'crosshair' : '';
        });
        map.on('mouseenter', 'hk-smart-meters-dots', () => {
          map.getCanvas().style.cursor = isPickingOriginRef.current ? 'crosshair' : 'pointer';
        });
        map.on('mouseleave', 'hk-smart-meters-dots', () => {
          map.getCanvas().style.cursor = isPickingOriginRef.current ? 'crosshair' : '';
        });

        setMapLoaded(true);
      });
    } catch {
      setWebglFallback(true);
    }

    return () => {
      markersRef.current.forEach(({ marker }) => marker.remove());
      markersRef.current.clear();
      cctvMarkersRef.current.forEach(({ marker }) => marker.remove());
      cctvMarkersRef.current.clear();
      if (userGpsMarkerRef.current) {
        userGpsMarkerRef.current.marker.remove();
        userGpsMarkerRef.current = null;
      }
      if (selectedMeterMarkerRef.current) {
        selectedMeterMarkerRef.current.marker.remove();
        selectedMeterMarkerRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Dynamically update map theme between Conventional Light and Dark Digital Twin
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (mapTheme === 'dark') {
      applyDarkDigitalTwinTheme(map);
    } else {
      applyConventionalLightTheme(map);
    }
  }, [mapTheme, mapLoaded]);

  // Sync Carpark 3D Pillars, Queue Halos, Roads, and Active Route GeoJSON sources
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const cpSource = map.getSource('hk-carparks-3d-source') as
      | MapLibreNamespace.GeoJSONSource
      | undefined;
    if (cpSource) {
      cpSource.setData(buildCarparkPillarsGeoJSON(carparks));
    }

    const haloSource = map.getSource('hk-queue-halos-source') as
      | MapLibreNamespace.GeoJSONSource
      | undefined;
    if (haloSource) {
      haloSource.setData(buildQueueHalosGeoJSON(carparks));
    }

    const roadsSource = map.getSource('hk-roads-source') as
      | MapLibreNamespace.GeoJSONSource
      | undefined;
    if (roadsSource) {
      roadsSource.setData(buildRoadsGeoJSON(roads));
    }

    const activeRouteSource = map.getSource('hk-active-route-source') as
      | MapLibreNamespace.GeoJSONSource
      | undefined;
    if (activeRouteSource) {
      activeRouteSource.setData(buildActiveRouteGeoJSON(activeRouteCoords));
    }
  }, [carparks, roads, is3DView, activeEvMode, activeRouteCoords, mapLoaded]);

  // Dedicated sync for all 20,699 Smart Meters GeoJSON source
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const metersSource = map.getSource('hk-smart-meters-source') as
      | MapLibreNamespace.GeoJSONSource
      | undefined;
    if (metersSource) {
      metersSource.setData(buildSmartMetersGeoJSON(meters));
    }
  }, [meters, mapLoaded]);

  // Dedicated instant sync for Selected Smart Meter Highlight Halo & On-Map Info Popover
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const selectedMeterSource = map.getSource('hk-selected-meter-source') as
      | MapLibreNamespace.GeoJSONSource
      | undefined;
    if (selectedMeterSource) {
      selectedMeterSource.setData(buildSelectedMeterGeoJSON(meters, selectedMeterId));
    }

    if (!selectedMeterId || !showMetersLayer) {
      if (selectedMeterMarkerRef.current) {
        selectedMeterMarkerRef.current.marker.remove();
        selectedMeterMarkerRef.current = null;
      }
      return;
    }

    const found = meters.find((s) => s.id === selectedMeterId);
    if (!found) {
      if (selectedMeterMarkerRef.current) {
        selectedMeterMarkerRef.current.marker.remove();
        selectedMeterMarkerRef.current = null;
      }
      return;
    }

    const corridors = aggregateSmartMetersByCorridor(meters);
    const key = `${found.districtKey}|${found.streetEn}|${found.sectionOfStreetEn || ''}`;
    const corr = corridors.find((c) => c.corridorKey === key);
    const coords = corr ? corr.centerCoordinates : found.coordinates;
    const vacantBays = corr ? corr.vacantBays : found.occupied ? 0 : 1;
    const totalBays = corr ? corr.totalBays : 1;

    const streetText = escapeHtml(pickLocaleText(locale, found.streetZh, found.streetSc, found.streetEn));
    const sectionText = found.sectionOfStreetZh
      ? escapeHtml(
          pickLocaleText(
            locale,
            found.sectionOfStreetZh,
            found.sectionOfStreetSc || found.sectionOfStreetZh,
            found.sectionOfStreetEn || found.sectionOfStreetZh
          )
        )
      : '';
    const districtText = escapeHtml(
      pickLocaleText(
        locale,
        found.districtZh,
        found.districtSc,
        found.districtEn
      )
    );
    const subDistrictText = found.subDistrictZh
      ? escapeHtml(
          pickLocaleText(
            locale,
            found.subDistrictZh,
            found.subDistrictSc || found.subDistrictZh,
            found.subDistrictEn || found.subDistrictZh
          )
        )
      : '';
    const opHoursText = escapeHtml(
      pickLocaleText(
        locale,
        found.operatingHours,
        found.operatingHoursSc || found.operatingHours,
        found.operatingHoursEn || found.operatingHours
      )
    );

    const meterNavUrl = userGpsLocation
      ? `https://www.google.com/maps/dir/?api=1&origin=${userGpsLocation[1]},${userGpsLocation[0]}&destination=${coords[1]},${coords[0]}&travelmode=driving`
      : `https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}&travelmode=driving`;
    const navTitle = pickLocaleText(locale, 'Google Maps 導航', 'Google Maps 导航', 'Navigate (Google Maps)');

    const htmlContent = `
      <div class="relative flex flex-col items-center select-none pointer-events-auto" style="transform: translateY(-16px);">
        <div class="px-3 py-2 rounded-xl bg-slate-950/95 backdrop-blur-md border border-cyan-400/90 shadow-2xl text-left min-w-[220px] max-w-[280px]">
          <div class="flex items-center justify-between gap-2">
            <span class="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
              ${pickLocaleText(locale, '路旁智能咪錶路段', '路旁智能咪表路段', 'HKeMeter Street Section')}
            </span>
            <div class="flex items-center gap-1.5">
              <span class="text-[10px] font-mono-tabular font-bold px-1.5 py-0.5 rounded ${
                vacantBays > 0
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
              }">
                ${pickLocaleText(locale, '空位', '空位', 'Vacant')} ${vacantBays}/${totalBays}
              </span>
              <a href="${meterNavUrl}" target="_blank" rel="noopener noreferrer" title="${navTitle}" aria-label="${navTitle}" class="meter-google-nav-btn w-5 h-5 rounded-md bg-cyan-400 hover:bg-cyan-300 text-slate-950 flex items-center justify-center shadow-sm transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 pointer-events-none"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
              </a>
              <button type="button" class="close-meter-popup-btn text-slate-400 hover:text-white p-0.5 text-xs font-bold leading-none">✕</button>
            </div>
          </div>
          <div class="text-xs font-bold text-white mt-1 leading-snug">
            ${streetText}
          </div>
          <div class="text-[10px] text-slate-300 mt-0.5 leading-snug">
            📍 ${districtText}${subDistrictText && subDistrictText !== districtText ? ` · ${subDistrictText}` : ''}${
      sectionText ? ` · ${sectionText}` : ''
    }
          </div>
          <div class="mt-1.5 pt-1.5 border-t border-slate-800/90 flex items-center justify-between text-[10px] font-mono-tabular text-slate-300">
            <span>Pole #${escapeHtml(found.meterPoleId)}</span>
            <span class="text-emerald-300 font-semibold">HK$${found.ratePer15MinHk}/${
      found.timeUnitMins || 15
    }m</span>
            <span>Max ${found.maxDurationMins}m</span>
          </div>
          <div class="text-[9px] text-slate-400 mt-0.5 truncate">
            🕒 ${opHoursText}
          </div>
        </div>
        <div class="w-2.5 h-2.5 rotate-45 bg-slate-950 border-r border-b border-cyan-400/90 -mt-1"></div>
      </div>
    `;

    const attachMeterEvents = (rootEl: HTMLElement) => {
      const closeBtn = rootEl.querySelector('.close-meter-popup-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectMeter(null);
        });
      }
    };

    if (selectedMeterMarkerRef.current) {
      selectedMeterMarkerRef.current.rootEl.innerHTML = htmlContent;
      selectedMeterMarkerRef.current.marker.setLngLat(coords);
      attachMeterEvents(selectedMeterMarkerRef.current.rootEl);
    } else {
      const maplibregl = getMapLibre();
      if (!maplibregl) return;
      const el = document.createElement('div');
      el.innerHTML = htmlContent;
      attachMeterEvents(el);
      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'bottom',
      })
        .setLngLat(coords)
        .addTo(map);
      selectedMeterMarkerRef.current = { marker, rootEl: el };
    }
  }, [meters, selectedMeterId, showMetersLayer, locale, mapLoaded]);

  // Update map cursor when isPickingMapOrigin toggles
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    map.getCanvas().style.cursor = isPickingMapOrigin ? 'crosshair' : '';
  }, [isPickingMapOrigin, mapLoaded]);

  // Sync User GPS Location Marker on the 3D Map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!userGpsLocation) {
      if (userGpsMarkerRef.current) {
        userGpsMarkerRef.current.marker.remove();
        userGpsMarkerRef.current = null;
      }
      return;
    }

    const gpsLabel = pickLocaleText(
      locale,
      '📍 我的 GPS 位置',
      '📍 我的 GPS 位置',
      '📍 My GPS Origin'
    );

    const htmlContent = `
      <div class="relative flex flex-col items-center select-none pointer-events-none">
        <div class="px-2.5 py-1 rounded-full bg-cyan-400 text-slate-950 font-bold text-[11px] shadow-xl border-2 border-white whitespace-nowrap flex items-center gap-1">
          <span>${gpsLabel}</span>
        </div>
        <div class="relative mt-1 flex items-center justify-center">
          <span class="animate-ping absolute inline-flex h-7 w-7 rounded-full bg-cyan-400 opacity-60"></span>
          <span class="relative inline-flex rounded-full h-4 w-4 bg-cyan-400 border-2 border-white shadow-lg"></span>
        </div>
      </div>
    `;

    if (userGpsMarkerRef.current) {
      userGpsMarkerRef.current.rootEl.innerHTML = htmlContent;
      userGpsMarkerRef.current.marker.setLngLat(userGpsLocation);
    } else {
      const maplibregl = getMapLibre();
      if (!maplibregl) return;
      const el = document.createElement('div');
      el.innerHTML = htmlContent;
      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'bottom',
      })
        .setLngLat(userGpsLocation)
        .addTo(map);
      userGpsMarkerRef.current = { marker, rootEl: el };
    }
  }, [userGpsLocation, locale, mapLoaded]);

  // Toggle layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const roadVis = showRoadsLayer ? 'visible' : 'none';
    if (map.getLayer('hk-roads-glow')) map.setLayoutProperty('hk-roads-glow', 'visibility', roadVis);
    if (map.getLayer('hk-roads-core')) map.setLayoutProperty('hk-roads-core', 'visibility', roadVis);

    const meterVis = showMetersLayer ? 'visible' : 'none';
    if (map.getLayer('hk-smart-meters-glow'))
      map.setLayoutProperty('hk-smart-meters-glow', 'visibility', meterVis);
    if (map.getLayer('hk-smart-meters-dots'))
      map.setLayoutProperty('hk-smart-meters-dots', 'visibility', meterVis);
    if (map.getLayer('hk-selected-meter-ring'))
      map.setLayoutProperty('hk-selected-meter-ring', 'visibility', meterVis);
  }, [showRoadsLayer, showMetersLayer, mapLoaded]);

  // Sync 2KM circle for mobile mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const source = map.getSource('hk-mobile-2km-source') as
      | MapLibreNamespace.GeoJSONSource
      | undefined;
    if (source) {
      source.setData(build2KmCircleGeoJSON(isMobile ? userGpsLocation : null));
    }
    const fillVis = isMobile && userGpsLocation ? 'visible' : 'none';
    if (map.getLayer('hk-mobile-2km-fill')) map.setLayoutProperty('hk-mobile-2km-fill', 'visibility', fillVis);
    if (map.getLayer('hk-mobile-2km-stroke')) map.setLayoutProperty('hk-mobile-2km-stroke', 'visibility', fillVis);
  }, [userGpsLocation, isMobile, mapLoaded]);

  // Sync 3D DOM Beacons for Carparks (Top Radar Beacons + EV Spec Mode + Queue Warning Badges)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // In mobile mode, strictly restrict carpark beacons to those within 2.2KM of user GPS location
    let carparksToMark = carparks;
    if (isMobile && userGpsLocation) {
      carparksToMark = carparks.filter((c) => {
        if (c.id === selectedCarparkId) return true;
        return calculateDistanceKm(userGpsLocation, c.coordinates) <= 2.2;
      });
    } else if (carparks.length > 55) {
      carparksToMark = carparks.slice(0, 55);
      if (selectedCarparkId && !carparksToMark.some((c) => c.id === selectedCarparkId)) {
        const sel = carparks.find((c) => c.id === selectedCarparkId);
        if (sel) carparksToMark = [sel, ...carparksToMark];
      }
    }

    const activeIds = new Set(carparksToMark.map((c) => c.id));

    markersRef.current.forEach((entry, id) => {
      if (!activeIds.has(id)) {
        entry.marker.remove();
        markersRef.current.delete(id);
      }
    });

    carparksToMark.forEach((cp) => {
      const isSelected = cp.id === selectedCarparkId;
      const rawFullName = pickLocaleText(locale, cp.nameZh, cp.nameSc, cp.nameEn);
      const fullName = escapeHtml(rawFullName);
      const displayName = escapeHtml(rawFullName.replace(/\s*\(.*?\)\s*$/, '').trim());
      const fullAddress = escapeHtml(
        pickLocaleText(
          locale,
          cp.addressZh,
          cp.addressSc || cp.addressZh,
          cp.addressEn
        )
      );
      const queueLabel = pickLocaleText(
        locale,
        '⚠️ 門口嚴重排隊中',
        '⚠️ 门口严重排队中',
        '⚠️ Queue Jam'
      );

      let borderTone = 'border-emerald-400/90';
      let textTone = 'text-emerald-300';
      let radarBg = 'bg-emerald-400/35';
      let dotColor = 'bg-emerald-400';
      let primaryBadgeText = '';
      let secondaryBadgeHtml = '';
      let subCaptionText = displayName;

      if (activeEvMode === 'dc_super') {
        const dcAvail = cp.evInfo.dcAvailable;
        borderTone =
          dcAvail >= 5
            ? 'border-cyan-400/95'
            : dcAvail >= 1
            ? 'border-amber-400/90'
            : 'border-rose-500/95';
        textTone =
          dcAvail >= 5 ? 'text-cyan-300' : dcAvail >= 1 ? 'text-amber-300' : 'text-rose-300';
        radarBg =
          dcAvail >= 5
            ? 'bg-cyan-400/40'
            : dcAvail >= 1
            ? 'bg-amber-400/35'
            : 'bg-rose-500/45';
        dotColor = dcAvail >= 5 ? 'bg-cyan-400' : dcAvail >= 1 ? 'bg-amber-400' : 'bg-rose-500';
        primaryBadgeText = `⚡DC ${dcAvail}/${cp.evInfo.dcFastCount}${pickLocaleText(
          locale,
          '槍',
          '枪',
          ''
        )}`;
        secondaryBadgeHtml = `<span class="text-[10px] font-mono-tabular font-bold text-cyan-200 pl-1 border-l border-cyan-500/40">${cp.evInfo.dcMaxKw}kW</span>`;
        subCaptionText = `${displayName} · 🅿️${cp.availableSpaces}`;
      } else if (activeEvMode === 'ac_medium') {
        const acAvail = cp.evInfo.acAvailable;
        borderTone =
          acAvail >= 12
            ? 'border-purple-400/95'
            : acAvail >= 4
            ? 'border-amber-400/90'
            : 'border-rose-500/95';
        textTone =
          acAvail >= 12 ? 'text-purple-300' : acAvail >= 4 ? 'text-amber-300' : 'text-rose-300';
        radarBg =
          acAvail >= 12
            ? 'bg-purple-400/40'
            : acAvail >= 4
            ? 'bg-amber-400/35'
            : 'bg-rose-500/45';
        dotColor = acAvail >= 12 ? 'bg-purple-400' : acAvail >= 4 ? 'bg-amber-400' : 'bg-rose-500';
        primaryBadgeText = `🔌AC ${acAvail}/${cp.evInfo.acCount}${pickLocaleText(
          locale,
          '位',
          '位',
          ''
        )}`;
        secondaryBadgeHtml = `<span class="text-[10px] font-mono-tabular font-bold text-purple-200 pl-1 border-l border-purple-500/40">${cp.evInfo.acMaxKw}kW</span>`;
        subCaptionText = `${displayName} · 🅿️${cp.availableSpaces}`;
      } else {
        const isAbundant = cp.availableSpaces > 20;
        const isLimited = cp.availableSpaces >= 5 && cp.availableSpaces <= 20;
        borderTone = isAbundant
          ? 'border-emerald-400/90'
          : isLimited
          ? 'border-amber-400/90'
          : 'border-rose-500/95';
        textTone = isAbundant
          ? 'text-emerald-300'
          : isLimited
          ? 'text-amber-300'
          : 'text-rose-300';
        radarBg = isAbundant
          ? 'bg-emerald-400/35'
          : isLimited
          ? 'bg-amber-400/35'
          : 'bg-rose-500/45';
        dotColor = isAbundant ? 'bg-emerald-400' : isLimited ? 'bg-amber-400' : 'bg-rose-500';
        primaryBadgeText =
          cp.availableSpaces === 0
            ? pickLocaleText(locale, '滿位', '满位', 'FULL')
            : `${cp.availableSpaces}${pickLocaleText(locale, '位', '位', '')}`;
        secondaryBadgeHtml =
          cp.evInfo.hasEv && cp.evInfo.dcAvailable > 0
            ? `<span class="text-[10px] font-mono-tabular font-semibold text-cyan-300 pl-1 border-l border-slate-700">⚡${cp.evInfo.dcMaxKw}kW</span>`
            : cp.evInfo.hasEv && cp.evInfo.acAvailable > 0
            ? `<span class="text-[10px] font-mono-tabular font-semibold text-purple-300 pl-1 border-l border-slate-700">🔌${cp.evInfo.acMaxKw}kW</span>`
            : '';
      }

      const evSummaryLine = cp.evInfo.hasEv
        ? `<div class="mt-1 pt-1 border-t border-slate-800 flex flex-wrap items-center gap-1.5 text-[10px] font-mono-tabular">
            ${
              cp.evInfo.dcFastCount > 0
                ? `<span class="text-cyan-300 font-semibold">⚡DC ${cp.evInfo.dcAvailable}/${cp.evInfo.dcFastCount} (${cp.evInfo.dcMaxKw}kW)</span>`
                : ''
            }
            ${
              cp.evInfo.acCount > 0
                ? `<span class="text-purple-300 font-semibold">🔌AC ${cp.evInfo.acAvailable}/${cp.evInfo.acCount} (${cp.evInfo.acMaxKw}kW)</span>`
                : ''
            }
            <span class="text-slate-400 truncate max-w-[140px]">${escapeHtml(cp.evInfo.operator)}</span>
          </div>`
        : '';

      const cpNavUrl = userGpsLocation
        ? `https://www.google.com/maps/dir/?api=1&origin=${userGpsLocation[1]},${userGpsLocation[0]}&destination=${cp.coordinates[1]},${cp.coordinates[0]}&travelmode=driving`
        : `https://www.google.com/maps/dir/?api=1&destination=${cp.coordinates[1]},${cp.coordinates[0]}&travelmode=driving`;
      const cpNavTitle = pickLocaleText(locale, 'Google Maps 導航', 'Google Maps 导航', 'Navigate (Google Maps)');

      const htmlContent = `
        <div class="group relative flex flex-col items-center cursor-pointer select-none" style="transform: translateY(${
          is3DView ? '-14px' : '0px'
        }); z-index: ${isSelected ? '40' : '10'};">
          <div class="${
            isSelected ? 'flex pointer-events-auto' : 'hidden group-hover:flex pointer-events-none'
          } flex-col mb-1.5 px-3 py-2 rounded-xl bg-slate-950/95 backdrop-blur-md border border-cyan-400/85 shadow-2xl text-left min-w-[220px] max-w-[270px] z-50">
            <div class="flex items-start justify-between gap-1.5">
              <div class="text-xs font-bold text-white leading-snug">${fullName}</div>
              ${
                isSelected
                  ? `<div class="flex items-center gap-1 shrink-0 -mr-1 -mt-0.5">
                      <a href="${cpNavUrl}" target="_blank" rel="noopener noreferrer" title="${cpNavTitle}" aria-label="${cpNavTitle}" class="carpark-google-nav-btn w-5 h-5 rounded-md bg-cyan-400 hover:bg-cyan-300 text-slate-950 flex items-center justify-center shadow-sm transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-3 h-3 pointer-events-none"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                      </a>
                      <button type="button" class="close-carpark-popup-btn text-slate-400 hover:text-white p-0.5 text-xs font-bold leading-none">✕</button>
                    </div>`
                  : ''
              }
            </div>
            <div class="text-[10px] text-slate-300 mt-0.5 leading-snug">📍 ${fullAddress}</div>
            <div class="mt-1 flex items-center justify-between text-[10px] font-mono-tabular">
              <span class="text-emerald-300 font-semibold">🅿️ ${cp.availableSpaces}/${cp.totalSpaces} ${pickLocaleText(
        locale,
        '空位',
        '空位',
        'Spaces'
      )}</span>
              <span class="text-slate-200 font-semibold">HK$${cp.hourlyFeeHk}/hr</span>
            </div>
            ${evSummaryLine}
          </div>
          ${
            cp.queueRisk
              ? `<div class="animate-queue-badge mb-1 px-2 py-0.5 rounded bg-rose-600/95 border border-rose-300 text-[10px] font-bold text-white shadow-lg whitespace-nowrap">
                  ${queueLabel}
                </div>`
              : ''
          }
          <div class="relative flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/92 backdrop-blur-md border ${borderTone} ${
            isSelected ? 'ring-2 ring-cyan-400 scale-110' : 'hover:scale-105'
          } transition-transform shadow-xl">
            <span class="relative flex h-2 w-2 shrink-0">
              <span class="animate-radar-ring absolute inline-flex h-full w-full rounded-full ${radarBg}"></span>
              <span class="relative inline-flex rounded-full h-2 w-2 ${dotColor}"></span>
            </span>
            <span class="font-mono-tabular text-xs font-bold ${textTone}">
              ${primaryBadgeText}
            </span>
            ${secondaryBadgeHtml}
          </div>
          <div class="mt-0.5 px-1.5 py-0.2 rounded bg-slate-950/85 text-[10px] font-medium text-slate-200 max-w-[148px] truncate">
            ${subCaptionText}
          </div>
        </div>
      `;

      const existing = markersRef.current.get(cp.id);
      if (existing) {
        existing.rootEl.innerHTML = htmlContent;
        existing.marker.setLngLat(cp.coordinates);
        existing.rootEl.onclick = (e) => {
          const target = e.target as HTMLElement;
          if (target && target.closest('.carpark-google-nav-btn')) {
            e.stopPropagation();
            return;
          }
          e.stopPropagation();
          if (target && target.classList.contains('close-carpark-popup-btn')) {
            onSelectCarpark(null);
            return;
          }
          onSelectCarpark(cp);
        };
      } else {
        const maplibregl = getMapLibre();
        if (!maplibregl) return;
        const el = document.createElement('div');
        el.innerHTML = htmlContent;
        el.onclick = (e) => {
          const target = e.target as HTMLElement;
          if (target && target.closest('.carpark-google-nav-btn')) {
            e.stopPropagation();
            return;
          }
          e.stopPropagation();
          if (target && target.classList.contains('close-carpark-popup-btn')) {
            onSelectCarpark(null);
            return;
          }
          onSelectCarpark(cp);
        };
        const marker = new maplibregl.Marker({
          element: el,
          anchor: 'bottom',
        })
          .setLngLat(cp.coordinates)
          .addTo(map);
        markersRef.current.set(cp.id, { marker, rootEl: el });
      }
    });
  }, [carparks, selectedCarparkId, is3DView, locale, activeEvMode, isMobile, userGpsLocation, mapLoaded]);

  // Sync Transport Department Live CCTV Camera Beacons on the 3D Map
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!showCctvLayer || isMobile) {
      cctvMarkersRef.current.forEach(({ marker }) => marker.remove());
      cctvMarkersRef.current.clear();
      return;
    }

    const activeCctvIds = new Set(cctvCameras.map((c) => c.id));
    cctvMarkersRef.current.forEach((entry, id) => {
      if (!activeCctvIds.has(id)) {
        entry.marker.remove();
        cctvMarkersRef.current.delete(id);
      }
    });

    cctvCameras.forEach((cam) => {
      const isSelected = cam.id === selectedCctvId;
      const borderColor =
        cam.trafficStatus === 'bad'
          ? 'border-rose-400/90 text-rose-300'
          : cam.trafficStatus === 'average'
          ? 'border-amber-400/90 text-amber-300'
          : 'border-cyan-400/90 text-cyan-300';

      const htmlContent = `
        <div class="cursor-pointer select-none flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950/90 backdrop-blur-md border ${borderColor} ${
          isSelected ? 'ring-2 ring-white scale-110' : 'hover:scale-105'
        } transition-transform shadow-lg">
          <span class="text-[10px]">📹</span>
          <span class="font-mono-tabular text-[10px] font-bold">${escapeHtml(cam.id)}</span>
        </div>
      `;

      const existing = cctvMarkersRef.current.get(cam.id);
      if (existing) {
        existing.rootEl.innerHTML = htmlContent;
        existing.marker.setLngLat(cam.coordinates);
        existing.rootEl.onclick = (e) => {
          e.stopPropagation();
          onSelectCctv(cam);
        };
      } else {
        const maplibregl = getMapLibre();
        if (!maplibregl) return;
        const el = document.createElement('div');
        el.innerHTML = htmlContent;
        el.onclick = (e) => {
          e.stopPropagation();
          onSelectCctv(cam);
        };
        const marker = new maplibregl.Marker({
          element: el,
          anchor: 'center',
        })
          .setLngLat(cam.coordinates)
          .addTo(map);
        cctvMarkersRef.current.set(cam.id, { marker, rootEl: el });
      }
    });
  }, [cctvCameras, selectedCctvId, showCctvLayer, isMobile, mapLoaded]);

  // Camera choreography (Fly-To / 2D-3D pitch transitions)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !cameraTarget) return;

    map.flyTo({
      center: cameraTarget.center,
      zoom: cameraTarget.zoom,
      pitch: is3DView ? cameraTarget.pitch : 0,
      bearing: is3DView ? cameraTarget.bearing : 0,
      duration: 1150,
      essential: true,
    });
  }, [cameraTarget, mapLoaded]);

  // Toggle 2D North-Up vs 3D 45°+ Oblique view smoothly
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    map.easeTo({
      pitch: is3DView ? 56 : 0,
      bearing: is3DView ? -16 : 0,
      duration: 750,
    });
  }, [is3DView, mapLoaded]);

  return (
    <div
      data-theme={mapTheme}
      className={`relative w-full h-full ${
        mapTheme === 'light' ? 'theme-light bg-[#f8fafc]' : 'theme-dark bg-slate-950'
      } overflow-hidden`}
    >
      {/* MapLibre WebGL Viewport */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Resilient Interactive 2D/Isometric Fallback if WebGL context is unavailable in sandbox */}
      {webglFallback && (
        <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 z-10">
          <div className="max-w-3xl w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <div>
                <h3 className="text-base font-bold text-white">
                  {pickLocaleText(
                    locale,
                    '香港維港兩岸 3D 數碼孿生空間視圖',
                    '香港维港两岸 3D 数码孪生空间视图',
                    'Hong Kong 3D Digital Twin Spatial Matrix'
                  )}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {pickLocaleText(
                    locale,
                    '點擊任何車場光柱節點即時檢視空位、入口 CCTV、EV 超充狀態與排隊避坑指數',
                    '点击任何车场光柱节点实时查看空位、入口 CCTV、EV 超充状态与排队避坑指数',
                    'Click any carpark node to inspect live vacancies, entrance CCTV, EV chargers, and queue risk'
                  )}
                </p>
              </div>
              <span className="text-xs font-mono-tabular text-cyan-400">
                OpenFreeMap · {carparks.length} Nodes
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[55vh] overflow-y-auto custom-scrollbar pr-1">
              {carparks.map((cp) => {
                const isAbundant = cp.availableSpaces > 20;
                const isLimited = cp.availableSpaces >= 5 && cp.availableSpaces <= 20;
                const barColor = isAbundant
                  ? 'bg-emerald-400'
                  : isLimited
                  ? 'bg-amber-400'
                  : 'bg-rose-500';
                return (
                  <button
                    key={cp.id}
                    onClick={() => onSelectCarpark(cp)}
                    className={`text-left p-3 rounded-xl border transition-all ${
                      selectedCarparkId === cp.id
                        ? 'bg-slate-800 border-cyan-400'
                        : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white truncate">
                        {pickLocaleText(locale, cp.nameZh, cp.nameSc, cp.nameEn)}
                      </span>
                      <span className={`h-2 w-2 rounded-full shrink-0 ${barColor}`} />
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">
                      📍 {pickLocaleText(locale, cp.addressZh, cp.addressSc || cp.addressZh, cp.addressEn)}
                    </div>
                    <div className="mt-2 flex items-baseline justify-between font-mono-tabular">
                      <span className="text-lg font-bold text-white">{cp.availableSpaces}</span>
                      <span className="text-[11px] text-slate-400">/ {cp.totalSpaces} · HK${cp.hourlyFeeHk}/h</span>
                    </div>
                    {cp.evInfo.hasEv && (
                      <div className="mt-1 text-[10px] font-mono-tabular text-cyan-300 truncate">
                        {cp.evInfo.dcFastCount > 0 ? `⚡DC ${cp.evInfo.dcAvailable}/${cp.evInfo.dcFastCount}` : ''}{' '}
                        {cp.evInfo.acCount > 0 ? `🔌AC ${cp.evInfo.acAvailable}/${cp.evInfo.acCount}` : ''}
                      </div>
                    )}
                    {cp.queueRisk && (
                      <div className="mt-1.5 text-[10px] font-semibold text-rose-400">
                        {pickLocaleText(
                          locale,
                          '⚠️ 門口嚴重排隊中',
                          '⚠️ 门口严重排队中',
                          '⚠️ Queue Jam'
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
