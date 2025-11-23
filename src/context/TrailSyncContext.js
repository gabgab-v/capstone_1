import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import * as Network from 'expo-network';
import { post, ApiError } from '../lib/api';
import {
  appendPendingTrail,
  getStoredPendingTrails,
  removePendingTrail as removeStored,
  setStoredPendingTrails,
} from '../utils/offlineTrailStorage';

const TrailSyncContext = createContext(null);

function isStateOnline(state) {
  if (!state) {
    return true;
  }
  if (state.isInternetReachable === false) {
    return false;
  }
  if (state.isConnected === false) {
    return false;
  }
  return true;
}

function mapEntryToPayload(entry) {
  return {
    label: entry.label || null,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
    points: entry.points || [],
    totalDistanceMeters: entry.totalDistanceMeters ?? 0,
  };
}

export function TrailSyncProvider({ children }) {
  const [pendingTrails, setPendingTrails] = useState([]);
  const [networkState, setNetworkState] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncError, setLastSyncError] = useState(null);
  const syncPromiseRef = useRef(null);

  const refreshPending = useCallback(async () => {
    const stored = await getStoredPendingTrails();
    setPendingTrails(stored);
  }, []);

  useEffect(() => {
    refreshPending();
  }, [refreshPending]);

  useEffect(() => {
    let isMounted = true;
    let subscription = null;

    Network.getNetworkStateAsync()
      .then((state) => {
        if (isMounted) {
          setNetworkState(state);
        }
      })
      .catch((error) => {
        console.warn('Unable to fetch network state:', error?.message || error);
      });

    if (typeof Network.addNetworkStateListener === 'function') {
      try {
        subscription = Network.addNetworkStateListener((state) => {
          setNetworkState(state);
        });
      } catch (listenerError) {
        console.warn(
          'Unable to subscribe to network state changes:',
          listenerError?.message || listenerError,
        );
      }
    } else if (__DEV__) {
      console.warn(
        'Network state listener is unavailable on this platform; background sync may be delayed.',
      );
    }

    return () => {
      isMounted = false;
      if (subscription && typeof subscription.remove === 'function') {
        subscription.remove();
      } else if (typeof subscription === 'function') {
        subscription();
      }
    };
  }, []);

  const queueOfflineTrail = useCallback(
    async (payload) => {
      const offlineEntry = {
        id: `offline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        label: payload.label || null,
        startedAt: payload.startedAt,
        endedAt: payload.endedAt,
        totalDistanceMeters: payload.totalDistanceMeters ?? 0,
        points: Array.isArray(payload.points) ? payload.points.map((point) => ({ ...point })) : [],
        createdAt: new Date().toISOString(),
        lastAttemptAt: null,
        attemptCount: 0,
        errorMessage: null,
      };
      await appendPendingTrail(offlineEntry);
      setPendingTrails((prev) => [...prev, offlineEntry]);
      return offlineEntry;
    },
    [setPendingTrails],
  );

  const syncPendingTrails = useCallback(async () => {
    if (isSyncing || syncPromiseRef.current) {
      return false;
    }
    const online = isStateOnline(networkState);
    if (!online) {
      return false;
    }

    const stored = await getStoredPendingTrails();
    if (!stored.length) {
      setPendingTrails([]);
      return true;
    }

    setIsSyncing(true);
    setLastSyncError(null);

    const syncPromise = (async () => {
      const remaining = [];
      for (const entry of stored) {
        try {
          await post('/api/trails', mapEntryToPayload(entry));
        } catch (error) {
          const next = {
            ...entry,
            lastAttemptAt: new Date().toISOString(),
            attemptCount: (entry.attemptCount || 0) + 1,
            errorMessage: error?.message || 'Failed to sync this recording.',
          };
          remaining.push(next);
          if (error instanceof ApiError && error.status === 0) {
            // Stop the loop if we are offline again.
            const remainingIndex = stored.indexOf(entry);
            const rest = stored.slice(remainingIndex + 1).map((item) => ({
              ...item,
              errorMessage: next.errorMessage,
            }));
            remaining.push(...rest);
            break;
          }
        }
      }

      await setStoredPendingTrails(remaining);
      setPendingTrails(remaining);
      return remaining.length === 0;
    })();

    syncPromiseRef.current = syncPromise;

    try {
      const syncedAll = await syncPromise;
      if (syncedAll) {
        setLastSyncError(null);
      }
      return syncedAll;
    } catch (error) {
      console.error('Unexpected trail sync failure:', error);
      setLastSyncError(error?.message || 'Something went wrong while syncing recordings.');
      return false;
    } finally {
      syncPromiseRef.current = null;
      setIsSyncing(false);
    }
  }, [isSyncing, networkState]);

  const discardPendingTrail = useCallback(
    async (id) => {
      if (!id) {
        return;
      }
      const updated = await removeStored(id);
      setPendingTrails(updated);
    },
    [setPendingTrails],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active' && pendingTrails.length > 0) {
        syncPendingTrails();
      }
    });
    return () => subscription.remove();
  }, [pendingTrails.length, syncPendingTrails]);

  useEffect(() => {
    if (!pendingTrails.length) {
      return;
    }
    if (isStateOnline(networkState)) {
      syncPendingTrails();
    }
  }, [pendingTrails.length, networkState, syncPendingTrails]);

  const value = useMemo(
    () => ({
      pendingTrails,
      isOnline: isStateOnline(networkState),
      isSyncing,
      lastSyncError,
      queueOfflineTrail,
      syncPendingTrails,
      discardPendingTrail,
      refreshPending,
    }),
    [
      pendingTrails,
      networkState,
      isSyncing,
      lastSyncError,
      queueOfflineTrail,
      syncPendingTrails,
      discardPendingTrail,
      refreshPending,
    ],
  );

  return <TrailSyncContext.Provider value={value}>{children}</TrailSyncContext.Provider>;
}

export function useTrailSync() {
  const context = useContext(TrailSyncContext);
  if (!context) {
    throw new Error('useTrailSync must be used within a TrailSyncProvider.');
  }
  return context;
}
