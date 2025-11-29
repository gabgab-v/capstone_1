import { useCallback, useEffect, useState } from 'react';
import { get, post } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export function useFacebookVerification() {
  const { user, refreshUser } = useAuth();
  const [verification, setVerification] = useState(user?.facebookVerification ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setVerification(user?.facebookVerification ?? null);
  }, [user?.facebookVerification]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await get('/api/users/facebook-verification');
      setVerification(response?.verification ?? null);
      await refreshUser?.();
      return response?.verification ?? null;
    } catch (err) {
      console.error('Failed to load Facebook verification:', err);
      setError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [refreshUser]);

  const analyze = useCallback(
    async (payload) => {
      setLoading(true);
      setError(null);
      try {
        const response = await post('/api/users/facebook-verification', payload);
        setVerification(response?.verification ?? null);
        await refreshUser?.();
        return response?.verification ?? null;
      } catch (err) {
        console.error('Failed to analyze Facebook page:', err);
        setError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [refreshUser],
  );

  return { verification, loading, error, refresh, analyze };
}
