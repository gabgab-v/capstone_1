import React, { createContext, useCallback, useEffect, useState, useContext } from 'react';
import { supabase } from '../lib/supabase';
import { get } from '../lib/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingMfa, setPendingMfa] = useState(null); // { factorId, challengeId, factors }

  const fetchUserProfile = useCallback(async () => {
    try {
      const profile = await get('/api/users/me');
      setUser(profile);
      return profile;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      setUser(null);
      return null;
    }
  }, []);

  const evaluateMfaRequirement = useCallback(async () => {
    try {
      const [{ data: aalData }, { data: factorsData }] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);

      const factors = Array.isArray(factorsData?.totp) ? factorsData.totp : [];
      const currentLevel = aalData?.currentLevel ?? null;
      const nextLevel = aalData?.nextLevel ?? null;

      const requiresMfa = factors.length > 0 && currentLevel !== 'aal2' && nextLevel === 'aal2';
      return { requiresMfa, factors };
    } catch (error) {
      console.error('Failed to evaluate MFA requirement:', error);
      return { requiresMfa: false, factors: [] };
    }
  }, []);

  const ensureMfaChallenge = useCallback(
    async (factors) => {
      const verifiedFactors = Array.isArray(factors) ? factors.filter((f) => f.status === 'verified') : [];
      if (!verifiedFactors.length) {
        throw new Error('No verified two-factor device is available.');
      }

      const existingFactor = verifiedFactors.find((factor) => factor.id === pendingMfa?.factorId);
      if (pendingMfa?.challengeId && existingFactor) {
        const state = { ...pendingMfa, factors: verifiedFactors };
        setPendingMfa(state);
        return state;
      }

      const target = verifiedFactors[0];
      const { data, error } = await supabase.auth.mfa.challenge({ factorId: target.id });
      if (error) {
        throw error;
      }

      const nextState = { factorId: target.id, challengeId: data.id, factors: verifiedFactors };
      setPendingMfa(nextState);
      return nextState;
    },
    [pendingMfa],
  );

  const handleSessionChange = useCallback(
    async (session) => {
      if (!session) {
        setUser(null);
        setPendingMfa(null);
        return 'signed_out';
      }

      const { requiresMfa, factors } = await evaluateMfaRequirement();
      if (requiresMfa) {
        try {
          await ensureMfaChallenge(factors);
        } catch (error) {
          console.error('Failed to start MFA challenge:', error);
        }
        setUser(null);
        return 'mfa_required';
      }

      const profile = await fetchUserProfile();
      if (!profile) {
        return 'profile_error';
      }
      setPendingMfa(null);
      return 'authenticated';
    },
    [ensureMfaChallenge, evaluateMfaRequirement, fetchUserProfile],
  );

  const verifyMfaCode = useCallback(
    async (code) => {
      if (!pendingMfa?.factorId || !pendingMfa?.challengeId) {
        throw new Error('No two-factor challenge is active.');
      }

      const { error } = await supabase.auth.mfa.verify({
        factorId: pendingMfa.factorId,
        challengeId: pendingMfa.challengeId,
        code,
      });

      if (error) {
        throw error;
      }

      setPendingMfa(null);
      await fetchUserProfile();
      return true;
    },
    [fetchUserProfile, pendingMfa],
  );

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!isMounted) return;
        await handleSessionChange(data?.session ?? null);
      } catch (error) {
        console.error('Failed to initialize auth session:', error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    bootstrap();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isMounted) return;
      await handleSessionChange(session);
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [handleSessionChange]);

  const value = {
    user,
    isLoading,
    pendingMfa,
    login: async (email, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setPendingMfa(null);
        return { error };
      }

      const session = data?.session ?? (await supabase.auth.getSession())?.data?.session ?? null;
      const status = await handleSessionChange(session);
      return { error: null, mfaRequired: status === 'mfa_required' };
    },
    verifyMfaCode,
    restartMfaChallenge: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) {
        throw error;
      }
      const factors = data?.totp ?? [];
      return ensureMfaChallenge(factors);
    },
    logout: async () => {
      setPendingMfa(null);
      return supabase.auth.signOut();
    },
    refreshUser: fetchUserProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
