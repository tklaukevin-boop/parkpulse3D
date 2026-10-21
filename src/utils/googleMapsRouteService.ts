/**
 * Google Maps Platform Routes & Directions API Integration Service
 * Compliant with Google Maps Platform Web API standards and Solution Attribution.
 */

export interface GoogleRouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
}

export interface GoogleRouteResponse {
  success: boolean;
  provider: 'google_maps' | 'osrm_td_hybrid' | 'fallback_geometry';
  coordinates: [number, number][]; // [lng, lat] GeoJSON format
  distanceKm: number;
  durationMins: number;
  trafficDelayMins?: number;
  routeSummary?: string;
  steps?: GoogleRouteStep[];
  googleError?: {
    code: string;
    message: string;
    suggestionZh: string;
    suggestionEn: string;
  };
}

export interface KeyVerificationResponse {
  valid: boolean;
  status: string;
  messageZh: string;
  messageEn: string;
  details?: string;
}

/**
 * Standard Google Encoded Polyline algorithm decoder.
 * Converts encoded string into an array of [longitude, latitude] pairs (GeoJSON standard).
 */
export function decodeGooglePolyline(encoded: string): [number, number][] {
  if (!encoded || typeof encoded !== 'string') return [];
  const points: [number, number][] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  try {
    while (index < len) {
      let b: number;
      let shift = 0;
      let result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      // Coordinates in GeoJSON / MapLibre: [longitude, latitude]
      points.push([
        Number((lng / 1e5).toFixed(6)),
        Number((lat / 1e5).toFixed(6)),
      ]);
    }
  } catch (err) {
    console.error('Error decoding Google polyline:', err);
  }

  return points;
}

/**
 * Test whether a Google Maps Platform API Key is authorized and active
 * for Routes API or Directions API.
 */
export async function verifyGoogleMapsApiKey(apiKey: string): Promise<KeyVerificationResponse> {
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) {
    return {
      valid: false,
      status: 'EMPTY_KEY',
      messageZh: '尚未提供 Google Maps API Key',
      messageEn: 'No Google Maps API Key provided',
    };
  }

  // 1. First test with Google Routes API v2
  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': cleanKey,
        'X-Goog-Maps-Solution-ID': 'gmp_git_agentskills_v1',
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: 22.2962, longitude: 114.1688 } } },
        destination: { location: { latLng: { latitude: 22.2849, longitude: 114.1586 } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.routes) && data.routes.length > 0) {
        return {
          valid: true,
          status: 'ROUTES_API_ACTIVE',
          messageZh: 'Google Routes API 連線成功！即時路況路線運作正常。',
          messageEn: 'Google Routes API connected successfully! Live traffic routing is active.',
        };
      }
    }

    const errData = await res.json().catch(() => null);
    const errMessage = errData?.error?.message || `HTTP ${res.status}`;

    // 2. Fallback check with Directions API
    const dirRes = await fetch(
      `https://maps.googleapis.com/maps/api/directions/json?origin=22.2962,114.1688&destination=22.2849,114.1586&key=${encodeURIComponent(cleanKey)}`
    );
    if (dirRes.ok) {
      const dirData = await dirRes.json();
      if (dirData.status === 'OK') {
        return {
          valid: true,
          status: 'DIRECTIONS_API_ACTIVE',
          messageZh: 'Google Directions API 連線成功！即時路況路線運作正常。',
          messageEn: 'Google Directions API connected successfully!',
        };
      }
    }

    let suggestionZh = '請前往 Google Cloud Console (console.cloud.google.com)，於「API 和服務」中確認已啟用【Routes API】或【Directions API】，並檢查 API Key 憑證權限。';
    let suggestionEn = 'Please go to Google Cloud Console, ensure Routes API or Directions API is enabled, and check API key restrictions.';

    if (cleanKey.startsWith('AQ.')) {
      suggestionZh = '此金鑰以「AQ.」開頭，通常為 Google AI Studio 或 Gemini API 金鑰。Google Maps Platform 金鑰通常以「AIzaSy...」開頭，請至 Google Cloud Console 複製 Maps API 金鑰。';
      suggestionEn = 'This key starts with "AQ." (typically Gemini/AI Studio key). Google Maps Platform API keys start with "AIzaSy...".';
    }

    return {
      valid: false,
      status: errData?.error?.status || 'INVALID_OR_UNACTIVATED',
      messageZh: `Google API 回應：${errMessage}`,
      messageEn: `Google API response: ${errMessage}`,
      details: suggestionZh,
    };
  } catch (error) {
    return {
      valid: false,
      status: 'NETWORK_ERROR',
      messageZh: `連線至 Google 伺服器失敗：${error instanceof Error ? error.message : '未知錯誤'}`,
      messageEn: `Network error connecting to Google: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

/**
 * Fetch real traffic-aware shortest route from Google Routes API v2
 */
export async function fetchGoogleRoutesApi(params: {
  origin: [number, number]; // [lng, lat]
  destination: [number, number]; // [lng, lat]
  apiKey: string;
  language?: 'zh-HK' | 'zh-CN' | 'en';
}): Promise<GoogleRouteResponse | null> {
  const { origin, destination, apiKey, language = 'zh-HK' } = params;
  const cleanKey = (apiKey || '').trim();
  if (!cleanKey) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);

    const langCode = language === 'en' ? 'en-US' : language === 'zh-CN' ? 'zh-CN' : 'zh-HK';

    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': cleanKey,
        'X-Goog-Maps-Solution-ID': 'gmp_git_agentskills_v1',
        'X-Goog-FieldMask':
          'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.description,routes.legs.steps.navigationInstruction,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration',
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: {
              latitude: origin[1],
              longitude: origin[0],
            },
          },
        },
        destination: {
          location: {
            latLng: {
              latitude: destination[1],
              longitude: destination[0],
            },
          },
        },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        computeAlternativeRoutes: false,
        routeModifiers: {
          avoidTolls: false,
          avoidHighways: false,
          avoidFerries: false,
        },
        languageCode: langCode,
        units: 'METRIC',
      }),
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const primaryRoute = data?.routes?.[0];
      if (primaryRoute && primaryRoute.polyline?.encodedPolyline) {
        const decodedCoords = decodeGooglePolyline(primaryRoute.polyline.encodedPolyline);
        if (decodedCoords.length >= 2) {
          const durationStr = primaryRoute.duration || '0s';
          const seconds = parseInt(durationStr.replace('s', ''), 10) || 0;
          const durationMins = Math.max(1, Math.round(seconds / 60));
          const distanceMeters = primaryRoute.distanceMeters || 0;
          const distanceKm = Number((distanceMeters / 1000).toFixed(2));

          const rawSteps = primaryRoute.legs?.[0]?.steps || [];
          const steps: GoogleRouteStep[] = rawSteps.map((s: any) => ({
            instruction: s.navigationInstruction?.instructions || '',
            distanceMeters: s.distanceMeters || 0,
            durationSeconds: parseInt((s.staticDuration || '0s').replace('s', ''), 10) || 0,
          })).filter((s: GoogleRouteStep) => Boolean(s.instruction));

          return {
            success: true,
            provider: 'google_maps',
            coordinates: decodedCoords,
            distanceKm: Math.max(0.1, distanceKm),
            durationMins,
            routeSummary: primaryRoute.description || 'Google Maps 推薦最快路線 (TRAFFIC_AWARE)',
            steps,
          };
        }
      }
    }

    // Try fallback to Google Directions API
    const dirController = new AbortController();
    const dirTimeout = setTimeout(() => dirController.abort(), 6500);
    const dirUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin[1]},${origin[0]}&destination=${destination[1]},${destination[0]}&departure_time=now&traffic_model=best_guess&language=${langCode}&key=${encodeURIComponent(cleanKey)}`;
    const dirRes = await fetch(dirUrl, { signal: dirController.signal });
    clearTimeout(dirTimeout);

    if (dirRes.ok) {
      const dirData = await dirRes.json();
      if (dirData.status === 'OK' && dirData.routes?.[0]?.overview_polyline?.points) {
        const decodedCoords = decodeGooglePolyline(dirData.routes[0].overview_polyline.points);
        if (decodedCoords.length >= 2) {
          const leg = dirData.routes[0].legs?.[0];
          const durationSec = leg?.duration_in_traffic?.value ?? leg?.duration?.value ?? 0;
          const distanceMeters = leg?.distance?.value ?? 0;

          const steps: GoogleRouteStep[] = (leg?.steps || []).map((s: any) => ({
            instruction: (s.html_instructions || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
            distanceMeters: s.distance?.value || 0,
            durationSeconds: s.duration?.value || 0,
          }));

          return {
            success: true,
            provider: 'google_maps',
            coordinates: decodedCoords,
            distanceKm: Number((distanceMeters / 1000).toFixed(2)),
            durationMins: Math.max(1, Math.round(durationSec / 60)),
            routeSummary: dirData.routes[0].summary || 'Google Directions 即時路況路線',
            steps,
          };
        }
      } else if (dirData.error_message) {
        return {
          success: false,
          provider: 'osrm_td_hybrid',
          coordinates: [],
          distanceKm: 0,
          durationMins: 0,
          googleError: {
            code: dirData.status || 'GOOGLE_API_ERROR',
            message: dirData.error_message,
            suggestionZh: cleanKey.startsWith('AQ.')
              ? '此金鑰為 Gemini / AI Studio 格式。Google Maps Platform API 金鑰通常以「AIzaSy...」開頭，請至 Google Cloud Console 複製。'
              : '請至 Google Cloud Console 啟用 Directions API 或 Routes API。',
            suggestionEn: 'Please check your Google Cloud Console to ensure Routes API or Directions API is enabled.',
          },
        };
      }
    }

    const errJson = await res.json().catch(() => null);
    if (errJson?.error) {
      return {
        success: false,
        provider: 'osrm_td_hybrid',
        coordinates: [],
        distanceKm: 0,
        durationMins: 0,
        googleError: {
          code: errJson.error.status || 'UNAUTHENTICATED',
          message: errJson.error.message || 'Google API authentication failed',
          suggestionZh: cleanKey.startsWith('AQ.')
            ? '此金鑰以「AQ.」開頭（屬 Gemini API 金鑰格式），非 Google Maps Platform 金鑰（以「AIzaSy...」開頭）。請於 Google Cloud Console 複製 Maps API 金鑰。'
            : '請至 Google Cloud Console 啟用 Routes API 並確認金鑰沒有限制該 API。',
          suggestionEn: 'Please verify the API key has Routes API enabled in Google Cloud Console.',
        },
      };
    }
  } catch (err) {
    console.warn('Google Routes API fetch encountered error, fallback will be used:', err);
  }

  return null;
}
