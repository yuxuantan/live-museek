'use client'
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext(undefined);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [buskerProfile, setBuskerProfile] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user ?? null);

    console.log('getUserData', user);
    const { data, error } = await supabase.from('buskers').select().eq('user_id', user?.id.toString());
    if (error) setError(error.message);
    setBuskerProfile(data ? data[0] : null);
    console.log('setBuskerProfileData', data);
    setLoading(false); // Set loading to false after user data has been loaded
  };

  useEffect(() => {
    console.log('AuthContext mounted')
    loadUserData();
    const authListener = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => {
      authListener.data.subscription.unsubscribe();
    };
  }, []);

  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setUser(data.user);
  };

  const updateBuskerProfile = async (buskerProfile, customBuskerImage = null) => {
    console.log('updating busker profile', buskerProfile);
    const { data, error } = await supabase.from('buskers').upsert(buskerProfile);
    if (error) throw error;

    if (customBuskerImage) {
      const image_upload_response = await supabase.storage.from('busker_custom_images').upload(`${buskerProfile.busker_id}.jpg`, customBuskerImage, { contentType: 'image/jpg', upsert: true });
      if (image_upload_response.error != null) {
        console.log("Error uploading image");
        console.log(image_upload_response);
      }
    }
    else {
      // delete custom image
      const image_delete_response = await supabase.storage.from('busker_custom_images').remove([`${buskerProfile.busker_id}.jpg`]);
      if (image_delete_response.error != null) {
        console.log("Error deleting image");
        console.log(image_delete_response);
      }
    }
    setBuskerProfile(buskerProfile);
  };

  const loginWithProvider = async (provider) => {
    const { data, error } = await supabase.auth.signInWithOAuth({ provider });
    if (error) throw error;
    console.log("loginWithProvider", data);
  };

  const signUp = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    setUser(data.user);
    alert('Check your email for the confirmation link');
  };

  const resetPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: '/account/update-password' });
    if (error) throw error;
  };

  const updatePassword = async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user, buskerProfile, updateBuskerProfile, login, loginWithProvider, signUp, resetPassword, updatePassword, logout, error, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
