import React, { createContext, useCallback, useEffect, useState, useContext, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ApiError, get } from '../lib/api';

const AuthContext = createContext(null);

const emailNotConfirmedFallback = 'Please confirm your email before logging in.';

function resolveEmailNotConfirmedMessage(error) {
  if (!error || typeof error !== 'object') return null;
  const status = error.status;
  const code = error?.body?.code;
  if (status === 403 && code === 'EMAIL_NOT_CONFIRMED') {
    const message = typeof error.message === 'string' ? error.message.trim() : '';
    return message || emailNotConfirmedFallback;
  }
  return null;
}

function isNetworkProfileError(error) {
  return error instanceof ApiError && error.status === 0;
}

function buildFallbackProfile(session) {
  const authUser = session?.user;
  if (!authUser) return null;
  const metadata = authUser.user_metadata ?? {};
  const email = typeof authUser.email === 'string' ? authUser.email.trim() : null;
  const name =
    (typeof metadata.full_name === 'string' && metadata.full_name.trim()) ||
    (typeof metadata.name === 'string' && metadata.name.trim()) ||
    null;
  const avatarUrl =
    typeof metadata.avatar_url === 'string' && metadata.avatar_url.trim() ? metadata.avatar_url.trim() : null;

  return {
    id: authUser.id,
    email,
    name,
    avatarUrl,
  };
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingMfa, setPendingMfa] = useState(null); // { factorId, challengeId, factors }
  const profileErrorRef = useRef(null);

  const fetchUserProfile = useCallback(async () => {
    try {
      const profile = await get('/api/users/me');
      profileErrorRef.current = null;
      setUser(profile);
      return profile;
    } catch (error) {
      if (error instanceof ApiError) {
        profileErrorRef.current = error;
      } else {
        profileErrorRef.current = null;
      }
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
        const emailMessage = resolveEmailNotConfirmedMessage(profileErrorRef.current);
        if (emailMessage) {
          await supabase.auth.signOut();
          setPendingMfa(null);
          return 'email_unverified';
        }
        if (isNetworkProfileError(profileErrorRef.current)) {
          const fallbackProfile = buildFallbackProfile(session);
          if (fallbackProfile) {
            setUser(fallbackProfile);
            setPendingMfa(null);
            return 'authenticated';
          }
        }
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
      const profile = await fetchUserProfile();
      if (!profile) {
        if (isNetworkProfileError(profileErrorRef.current)) {
          const { data } = await supabase.auth.getSession();
          const fallbackProfile = buildFallbackProfile(data?.session ?? null);
          if (fallbackProfile) {
            setUser(fallbackProfile);
            return true;
          }
        }
        await supabase.auth.signOut();
        const emailMessage = resolveEmailNotConfirmedMessage(profileErrorRef.current);
        throw new Error(
          emailMessage || 'Verification succeeded, but we could not load your profile. Please try again.',
        );
      }
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
      setPendingMfa(null);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setPendingMfa(null);
        return { error };
      }

      const session = data?.session ?? (await supabase.auth.getSession())?.data?.session ?? null;
      const status = await handleSessionChange(session);

      if (status === 'email_unverified') {
        const emailMessage = resolveEmailNotConfirmedMessage(profileErrorRef.current);
        return { error: new Error(emailMessage || emailNotConfirmedFallback) };
      }

      if (status === 'profile_error') {
        await supabase.auth.signOut();
        const message =
          typeof profileErrorRef.current?.message === 'string' && profileErrorRef.current.message.trim()
            ? profileErrorRef.current.message.trim()
            : 'Signed in, but failed to load your profile. Please try again.';
        return { error: new Error(message) };
      }

      if (status === 'signed_out') {
        return { error: new Error('We could not establish a session. Please try again.') };
      }

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
