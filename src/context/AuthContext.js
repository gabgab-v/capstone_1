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
    // Get the initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        // If a session exists, fetch the full user profile from your backend
        get('/api/users/me')
          .then(setUser)
          .catch((err) => {
            console.error('Error fetching user profile:', err);
            // If profile fetch fails, treat as logged out
            supabase.auth.signOut(); 
            setUser(null);
          });
      }
      setIsLoading(false);
    });

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session) {
          // When user logs in, fetch their full profile
          const profile = await get('/api/users/me');
          setUser(profile);
        } else {
          // When user logs out, clear the user state
          setUser(null);
        }
      }
    );

    // Cleanup the listener on unmount
    return () => {
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
