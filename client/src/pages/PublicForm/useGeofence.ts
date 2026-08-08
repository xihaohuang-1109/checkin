import { useState, useEffect, useRef, useCallback } from 'react';
import { haversineDistance } from '@shared/haversine';

interface GeofenceState {
  withinGeofence: boolean;
  currentDistance: number | null;
  accuracy: number | null;
  error: string | null;
  loading: boolean;
}

interface GeofenceConfig {
  lat: number;
  lng: number;
  radiusM: number;
}

const MAX_RETRIES = 5;
const RETRY_DELAY = 2000;
const WATCH_TIMEOUT = 60000;

/**
 * Real-time geofence monitoring using the browser Geolocation API.
 * Uses watchPosition for continuous updates with fallback to getCurrentPosition.
 */
export function useGeofence(config: GeofenceConfig | null): GeofenceState {
  const [state, setState] = useState<GeofenceState>({
    withinGeofence: false,
    currentDistance: null,
    accuracy: null,
    error: null,
    loading: true,
  });

  const lastUpdateRef = useRef<number>(0);
  const lastDistanceRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateState = useCallback(
    (lat: number, lng: number, accuracy: number) => {
      if (!config) return;

      const now = Date.now();
      const distance = haversineDistance(
        { lat, lng },
        { lat: config.lat, lng: config.lng }
      );

      // Throttle: update at most every 2s, or if distance changes by >2m
      if (
        lastDistanceRef.current !== null &&
        now - lastUpdateRef.current < 2000 &&
        Math.abs(distance - lastDistanceRef.current) < 2
      ) {
        return;
      }

      lastUpdateRef.current = now;
      lastDistanceRef.current = distance;
      retryCountRef.current = 0; // reset retry on success

      setState({
        withinGeofence: distance <= config.radiusM,
        currentDistance: Math.round(distance),
        accuracy: Math.round(accuracy),
        error: null,
        loading: false,
      });
    },
    [config]
  );

  const startWatching = useCallback(() => {
    if (!config || !navigator.geolocation) return;

    // Clear any existing watch
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        updateState(
          position.coords.latitude,
          position.coords.longitude,
          position.coords.accuracy
        );
      },
      (err) => {
        console.error('[Geofence] Error code:', err.code, 'message:', err.message);
        let errorMsg: string;
        switch (err.code) {
          case err.PERMISSION_DENIED:
            errorMsg = '需开启定位权限才能签到，请在浏览器设置中允许定位';
            setState({
              withinGeofence: false,
              currentDistance: null,
              accuracy: null,
              error: errorMsg,
              loading: false,
            });
            return;
          case err.POSITION_UNAVAILABLE:
            errorMsg = '无法获取位置信息，请检查设备定位服务';
            break;
          case err.TIMEOUT:
            errorMsg = '获取位置超时，正在重试...';
            break;
          default:
            errorMsg = '定位失败，请检查设备设置';
            break;
        }

        // Retry with getCurrentPosition as fallback
        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current++;
          console.log(`[Geofence] Retry ${retryCountRef.current}/${MAX_RETRIES}...`);

          retryTimerRef.current = setTimeout(() => {
            // Try getCurrentPosition as fallback, with lower accuracy first
            const useHighAccuracy = retryCountRef.current <= 2;
            navigator.geolocation.getCurrentPosition(
              (position) => {
                updateState(
                  position.coords.latitude,
                  position.coords.longitude,
                  position.coords.accuracy
                );
                startWatching();
              },
              (fallbackErr) => {
                console.error('[Geofence] Fallback also failed, code:', fallbackErr.code);
                setState((s) => ({
                  ...s,
                  error: `正在获取位置 (${retryCountRef.current}/${MAX_RETRIES})...`,
                  loading: true,
                }));
                startWatching();
              },
              {
                enableHighAccuracy: useHighAccuracy,
                timeout: 30000,
                maximumAge: 0,
              }
            );
          }, RETRY_DELAY);
        } else {
          setState({
            withinGeofence: false,
            currentDistance: null,
            accuracy: null,
            error: errorMsg + '。请确认已开启GPS和定位权限，并处于室外或窗边。',
            loading: false,
          });
        }
      },
      {
        enableHighAccuracy: false,
        maximumAge: 30000,
        timeout: WATCH_TIMEOUT,
      }
    );
  }, [config, updateState]);

  useEffect(() => {
    // Cleanup
    retryCountRef.current = 0;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    if (!config) {
      setState((s) => ({ ...s, loading: false, error: null }));
      return;
    }

    if (!navigator.geolocation) {
      setState({
        withinGeofence: false,
        currentDistance: null,
        accuracy: null,
        error: '您的浏览器不支持定位功能',
        loading: false,
      });
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));
    startWatching();

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [config, startWatching]);

  return state;
}