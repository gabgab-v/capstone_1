import { useCallback, useEffect, useState } from 'react';
import { get } from '../lib/api';

export function useUserTrails({ enabled = true } = {}) {
  const [trails, setTrails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await get('/api/trails');
      setTrails(Array.isArray(response) ? response : []);
    } catch (err) {
      console.error('Failed to load trails:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    load();
    return undefined;
  }, [enabled, load]);

  return {
    trails,
    loading,
    error,
    refresh: load,
  };
}