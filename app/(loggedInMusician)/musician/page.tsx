'use client';
import React, { useState, useEffect } from 'react';
import withAuth from '../../components/withAuth';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabaseClient';

const DashboardPage = () => {
  const { user, musicianProfile, updateMusicianProfile } = useAuth();
  const [name, setName] = useState('Enter name...');
  const [genre, setGenre] = useState('Enter genre...');
  const [language, setLanguage] = useState('Enter language...');
  const [location, setLocation] = useState('Enter location...');
  const [bio, setBio] = useState('Enter bio...');
  const [facebook, setFacebook] = useState('Enter facebook...');
  const [twitter, setTwitter] = useState('Enter twitter...');
  const [instagram, setInstagram] = useState('Enter instagram...');
  const [profileImage, setprofileImage] = useState<string | ArrayBuffer | null>('https://www.gravatar.com/avatar/2c7d99fe281ecd3bcd65ab915bac6dd5?s=250');
  const [successMessage, setSuccessMessage] = useState('');

  // fetch profile image async function
  const fetchProfileImage = async () => {
    const { data, error } = await supabase.storage
      .from('musician-profile-images')
      .download(`${user?.id}-profile-image`);
    if (error) {
      console.error('Error downloading image:', error);
    }
    else {
      console.log('Image downloaded successfully:', data);
      const url = URL.createObjectURL(data as any);
      setprofileImage(url);
    }
  };
  // useEffect to init states because musicianProfile takes awhile to load
  useEffect(() => {
    if (musicianProfile) {
      setName(musicianProfile.name);
      setGenre(musicianProfile.genre);
      setLanguage(musicianProfile.language);
      setLocation(musicianProfile.location);
      setBio(musicianProfile.bio);
      setFacebook(musicianProfile.facebook);
      setTwitter(musicianProfile.twitter);
      setInstagram(musicianProfile.instagram);
      fetchProfileImage();
    }
  }
    , [musicianProfile]);


  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setprofileImage(reader.result);
      };
      reader.readAsDataURL(file);
    }

    // Create a unique file name
    const fileName = `${user?.id}-profile-image`;
    // Upload the image to the bucket with their own uid as folder path. (even before form submit)
    const { data, error } = await supabase.storage
      .from('musician-profile-images')
      .upload(fileName, file as any, {upsert: true});
    if (error) {
      console.error('Error uploading image:', error);
    }
    else {
      console.log('Image uploaded successfully:', data);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateMusicianProfile({
        id: user?.id,
        name: name,
        genre: genre,
        bio: bio,
        language: language,
        location: location,
        facebook: facebook,
        twitter: twitter,
        instagram: instagram
      } as any);
      setSuccessMessage('Profile updated successfully!');
    } catch (error) {
      console.error('Error updating profile:', error);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="p-8 space-y-6 bg-white rounded shadow-md w-full max-w-lg">
        <h2 className="text-2xl font-bold text-center">Welcome to the Musician Dashboard {user?.email}</h2>

        <form onSubmit={handleSubmit} className="space-y-6 grid grid-cols-2 gap-6">
            <div>
              <label htmlFor="profileImage" className="block text-sm font-medium text-gray-700">
                Display Image
              </label>
              {profileImage && (
                <div className="flex justify-center">
                  <img src={profileImage as string} alt="Display" className="w-32 h-32 rounded-full" />
                </div>
              )}
              <input
                id="profileImage"
                name="profileImage"
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="w-full px-3 py-2 border rounded shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="genre" className="block text-sm font-medium text-gray-700">
                Genre
              </label>
              <input
                id="genre"
                name="genre"
                type="text"
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="language" className="block text-sm font-medium text-gray-700">
                Language
              </label>
              <input
                id="language"
                name="language"
                type="text"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label htmlFor="location" className="block text-sm font-medium text-gray-700">
                Location
              </label>
              <input
                id="location"
                name="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="bio" className="block text-sm font-medium text-gray-700">
                Bio
              </label>
              <textarea
                id="bio"
                name="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="facebook" className="block text-sm font-medium text-gray-700">
                Facebook
              </label>
              <input
                id="facebook"
                name="facebook"
                type="text"
                value={facebook}
                onChange={(e) => setFacebook(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="twitter" className="block text-sm font-medium text-gray-700">
                Twitter
              </label>
              <input
                id="twitter"
                name="twitter"
                type="text"
                value={twitter}
                onChange={(e) => setTwitter(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="instagram" className="block text-sm font-medium text-gray-700">
                Instagram
              </label>
              <input
                id="instagram"
                name="instagram"
                type="text"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                required
                className="w-full px-3 py-2 border rounded shadow-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              {/* add button which calls updateMusicianProfile with contents from form */}
              <button type="submit" className="w-full px-3 py-2 text-white bg-blue-500 rounded shadow-sm hover:bg-blue-600">
                Update Profile
              </button>

            </div>
        </form>
        {successMessage && (
          <div className="bg-green-200 text-green-800 p-3 rounded-md">{successMessage}</div>
        )}
      </div>
    </div>
  );
}

export default withAuth(DashboardPage);
