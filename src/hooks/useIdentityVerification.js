import { useCallback, useEffect, useState } from 'react';
import { get, post } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export function useIdentityVerification() {
  const { user, refreshUser } = useAuth();
  const [verification, setVerification] = useState(user?.identityVerification ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setVerification(user?.identityVerification ?? null);
  }, [user?.identityVerification]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await get('/api/users/identity-verification');
      setVerification(response?.verification ?? null);
      await refreshUser?.();
      return response?.verification ?? null;
    } catch (err) {
      console.error('Failed to load identity verification status:', err);
      setError(err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [refreshUser]);

  const submit = useCallback(
    async (payload) => {
      setLoading(true);
      setError(null);
      try {
        const response = await post('/api/users/identity-verification', payload);
        setVerification(response?.verification ?? null);
        await refreshUser?.();
        return response?.verification ?? null;
      } catch (err) {
        console.error('Failed to submit identity verification:', err);
        setError(err);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [refreshUser],
  );

  return { verification, loading, error, refresh, submit };
}
