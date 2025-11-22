import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import haversine from 'haversine-distance';
import { ApiError, post } from '../lib/api';
import { useTrailSync } from '../context/TrailSyncContext';

const DEFAULT_WATCH_OPTIONS = {
  accuracy: Location.Accuracy.Highest,
  timeInterval: 4000,
  distanceInterval: 5,
  mayShowUserSettingsDialog: true,
};

const MIN_DISTANCE_METERS = 3;

function toIso(timestamp) {
  try {
    if (timestamp) {
      return new Date(timestamp).toISOString();
    }
    return new Date().toISOString();
  } catch (_error) {
    return new Date().toISOString();
  }
}

export function useTrailRecorder() {
  const watcherRef = useRef(null);
  const watchOptionsRef = useRef(DEFAULT_WATCH_OPTIONS);
  const startTimeRef = useRef(null);
  const pointsRef = useRef([]);
  const distanceRef = useRef(0);
  const { queueOfflineTrail } = useTrailSync();

  const [status, setStatus] = useState('idle');
  const [points, setPoints] = useState([]);
  const [totalDistance, setTotalDistance] = useState(0);
  const [error, setError] = useState(null);
  const [startedAt, setStartedAt] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const clearWatcher = useCallback(() => {
    if (watcherRef.current) {
      watcherRef.current.remove();
      watcherRef.current = null;
    }
  }, []);

  const handleLocationUpdate = useCallback((location) => {
    const coords = location?.coords;
    if (!coords) {
      return;
    }

    const { latitude, longitude, accuracy } = coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return;
    }

    const nextPoint = {
      lat: latitude,
      lng: longitude,
      accuracy: accuracy ?? null,
      at: toIso(location.timestamp),
    };

    setPoints((prev) => {
      if (prev.length === 0) {
        pointsRef.current = [nextPoint];
        return pointsRef.current;
      }

      const lastPoint = prev[prev.length - 1];
      const segment = haversine(
        { lat: lastPoint.lat, lng: lastPoint.lng },
        { lat: nextPoint.lat, lng: nextPoint.lng },
      );

      if (!Number.isFinite(segment)) {
        return prev;
      }

      if (segment < MIN_DISTANCE_METERS) {
        return prev;
      }

      const nextDistance = distanceRef.current + segment;
      distanceRef.current = nextDistance;
      setTotalDistance(nextDistance);

      const updatedPoints = [...prev, nextPoint];
      pointsRef.current = updatedPoints;
      return updatedPoints;
    });
  }, []);

  const startWatcher = useCallback(async () => {
    clearWatcher();
    watcherRef.current = await Location.watchPositionAsync(
      watchOptionsRef.current,
      handleLocationUpdate,
    );
  }, [clearWatcher, handleLocationUpdate]);

  useEffect(() => () => clearWatcher(), [clearWatcher]);

  const start = useCallback(async (options = {}) => {
    if (status === 'recording') {
      return true;
    }

    try {
      const { status: permissionStatus } = await Location.requestForegroundPermissionsAsync();
      if (permissionStatus !== 'granted') {
        setError('Location permission is required to record a trail.');
        return false;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setError('Enable location services to start recording.');
        return false;
      }

      watchOptionsRef.current = { ...DEFAULT_WATCH_OPTIONS, ...options };
      setError(null);
      setPoints([]);
      pointsRef.current = [];
      setTotalDistance(0);
      distanceRef.current = 0;

      const isoNow = new Date().toISOString();
      startTimeRef.current = isoNow;
      setStartedAt(isoNow);

      await startWatcher();
      setStatus('recording');
      return true;
    } catch (startError) {
      console.error('Failed to start trail recorder:', startError);
      setError('Failed to start recording.');
      return false;
    }
  }, [startWatcher, status]);

  const pause = useCallback(() => {
    if (status !== 'recording') {
      return;
    }
    clearWatcher();
    setStatus('paused');
  }, [clearWatcher, status]);

  const resume = useCallback(async () => {
    if (status !== 'paused') {
      return false;
    }
    try {
      await startWatcher();
      setStatus('recording');
      return true;
    } catch (resumeError) {
      console.error('Failed to resume trail recorder:', resumeError);
      setError('Failed to resume recording.');
      return false;
    }
  }, [startWatcher, status]);

  const reset = useCallback(() => {
    clearWatcher();
    startTimeRef.current = null;
    setStartedAt(null);
    setPoints([]);
    pointsRef.current = [];
    setTotalDistance(0);
    distanceRef.current = 0;
    setStatus('idle');
    setError(null);
  }, [clearWatcher]);

  const finish = useCallback(async ({ label } = {}) => {
    clearWatcher();

    if (status === 'recording') {
      setStatus('paused');
    }

    const recordedPoints = pointsRef.current;
    const startedIso = startTimeRef.current;
    if (!startedIso || recordedPoints.length < 2) {
      setError('Record at least two points before saving.');
      reset();
      return false;
    }

    setIsSaving(true);

    const endedAtIso = new Date().toISOString();
    const payload = {
      label: label || null,
      startedAt: startedIso,
      endedAt: endedAtIso,
      points: recordedPoints,
      totalDistanceMeters: Math.round(distanceRef.current * 100) / 100,
    };

    try {
      const savedTrail = await post('/api/trails', payload);
      reset();
      return savedTrail;
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.status === 0) {
        try {
          const offlineEntry = await queueOfflineTrail(payload);
          reset();
          setError(
            'No connection detected. The recording was stored offline and will sync automatically.',
          );
          return {
            id: offlineEntry.id,
            label: payload.label,
            startedAt: payload.startedAt,
            endedAt: payload.endedAt,
            totalDistanceMeters: payload.totalDistanceMeters,
            samples: payload.points.map((point) => ({
              lat: point.lat,
              lng: point.lng,
              accuracy: point.accuracy ?? null,
              at: point.at,
            })),
            isOfflineOnly: true,
          };
        } catch (storageError) {
          console.error('Failed to store trail offline:', storageError);
          setError(
            'Unable to store this recording offline. Please keep the app open until you regain connection.',
          );
          setStatus('paused');
          return null;
        }
      }
      console.error('Failed to save trail:', saveError);
      setError('Failed to save the recorded trail.');
      setStatus('paused');
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [clearWatcher, queueOfflineTrail, reset, status]);

  return {
    status,
    start,
    pause,
    resume,
    finish,
    reset,
    points,
    totalDistance,
    startedAt,
    isSaving,
    error,
  };
}

