'use client'
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { User } from '@supabase/supabase-js';
import {Musician} from '../types';
interface AuthContextProps {
  user: User | null;
  musicianProfile: Musician | null; 
  updateMusicianProfile: (musicianProfile: Musician) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  // loginWithProvider: (provider: 'google' | 'facebook') => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextProps | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [musicianProfile, setMusicianProfile] = useState<Musician | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const getUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user ?? null);

      console.log("fetching musician profile id " + user?.id.toString())
      const { data, error } = await supabase.from('musicians').select().eq('id', user?.id.toString());
      console.log("fetched musician profile", data? data[0]: null)
      if (error) setError(error.message);
      setMusicianProfile(data ? data[0] as Musician : null);
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

  const updateMusicianProfile = async (musicianProfile: Musician) => {
    const { data, error } = await supabase.from('musicians').upsert(musicianProfile);
    if (error) throw error;
    setMusicianProfile(data);
  }

  // const loginWithProvider = async (provider: 'google' | 'facebook') => {
  //   const { data, error } = await supabase.auth.signInWithOAuth({ provider });
  //   if (error) throw error;
  //   setUser(data.session?.user ?? null);
  // };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    setUser(data.user);
    alert('Check your email for the confirmation link')
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: '/account/update-password' });
    // const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  }

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    // <AuthContext.Provider value={{ user, login, loginWithProvider, signUp, resetPassword, logout, error }}>
    <AuthContext.Provider value={{ user, musicianProfile, updateMusicianProfile, login, signUp, resetPassword, updatePassword, logout, error }}>
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
