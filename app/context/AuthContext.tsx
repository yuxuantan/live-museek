'use client'
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { User } from '@supabase/supabase-js';

interface AuthContextProps {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  // loginWithProvider: (provider: 'google' | 'facebook') => Promise<void>;
  // signUp: (email: string, password: string) => Promise<void>;
  // resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextProps | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const getUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user ?? null);
    };

    getUserData();

    const authListener = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      authListener.data.subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setUser(data.user);
  };

  // const loginWithProvider = async (provider: 'google' | 'facebook') => {
  //   const { data, error } = await supabase.auth.signInWithOAuth({ provider });
  //   if (error) throw error;
  //   setUser(data.session?.user ?? null);
  // };

  // const signUp = async (email: string, password: string) => {
  //   const { user, error } = await supabase.auth.signUp({ email, password });
  //   if (error) throw error;
  //   setUser(user);
  // };

  // const resetPassword = async (email: string) => {
  //   const { error } = await supabase.auth.api.resetPasswordForEmail(email);
  //   if (error) throw error;
  // };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    // <AuthContext.Provider value={{ user, login, loginWithProvider, signUp, resetPassword, logout, error }}>
    <AuthContext.Provider value={{ user, login, logout, error }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextProps => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
