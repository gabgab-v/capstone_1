import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { get, ApiError } from '../lib/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState(null);

  const describeBootstrapError = useCallback((error) => {
    if (error instanceof ApiError) {
      if (error.status === 0) {
        return 'Unable to reach the Pabukid servers. Check your connection and try again.';
      }
      if (error.status === 401) {
        return null;
      }
      return error.body?.message || error.message || 'Failed to load your profile.';
    }
    if (error?.message) {
      return error.message;
    }
    return 'An unexpected error occurred while contacting the server.';
  }, []);

  const safeSignOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn('Sign-out failed:', error?.message ?? error);
    } finally {
      setUser(null);
      setBootstrapError(null);
    }
  }, []);

  const fetchUserProfile = useCallback(async () => {
    try {
      const profile = await get('/api/users/me');
      setUser(profile);
      setBootstrapError(null);
      return profile;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      if (error instanceof ApiError && error.status === 401) {
        await safeSignOut();
        return null;
      }
      setBootstrapError(describeBootstrapError(error));
      setUser(null);
      return null;
    }
  }, [describeBootstrapError, safeSignOut]);

  const refreshSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        throw error;
      }
      if (data?.session) {
        await fetchUserProfile();
      } else {
        setUser(null);
        setBootstrapError(null);
      }
    } catch (error) {
      console.error('Failed to initialise auth session:', error);
      setUser(null);
      setBootstrapError(describeBootstrapError(error));
    } finally {
      setIsLoading(false);
    }
  }, [describeBootstrapError, fetchUserProfile]);

  useEffect(() => {
    let isMounted = true;
    refreshSession();

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!isMounted) {
          return;
        }
        if (session) {
          await fetchUserProfile();
        } else {
          setUser(null);
          setBootstrapError(null);
        }
      }
    );

    // Cleanup the listener on unmount
    return () => {
      isMounted = false;
      authListener?.subscription?.unsubscribe?.();
    };
  }, [fetchUserProfile, refreshSession]);
  
  // The login and logout functions are now just wrappers around supabase.auth
  const value = {
      user,
      isLoading,
      bootstrapError,
      retryBootstrap: refreshSession,
      login: async (email, password) => supabase.auth.signInWithPassword({ email, password }),
      logout: safeSignOut,
      refreshUser: fetchUserProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};
