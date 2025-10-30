import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../lib/supabase';
import { get } from '../lib/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserProfile = async () => {
    try {
      const profile = await get('/api/users/me');
      setUser(profile);
      return profile;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      setUser(null); // Clear user if profile fetch fails
      return null;
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          if (isMounted) {
            setUser(null);
          }
          return;
        }

        try {
          const profile = await get('/api/users/me');
          if (isMounted) {
            setUser(profile);
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
          await supabase.auth.signOut();
          if (isMounted) {
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Error initializing auth session:', error);
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!isMounted) {
          return;
        }

        if (session) {
          try {
            const profile = await get('/api/users/me');
            if (isMounted) {
              setUser(profile);
            }
          } catch (error) {
            console.error('Error fetching user profile:', error);
            if (isMounted) {
              setUser(null);
            }
          }
        } else {
          setUser(null);
        }
      },
    );

    // Cleanup the listener on unmount
    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);
  
  // The login and logout functions are now just wrappers around supabase.auth
  const value = {
      user,
      isLoading,
      login: async (email, password) => supabase.auth.signInWithPassword({ email, password }),
      logout: async () => supabase.auth.signOut(),
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
