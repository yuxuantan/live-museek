'use client';
import React, { useState } from 'react';
import withAuth from '../../components/withAuth';
import { useAuth } from '../../context/AuthContext';
const DashboardPage = () => {
  const { user, musicianProfile, updateMusicianProfile } = useAuth();
  const [loadedMusicianProfile, setLoadedMusicianProfile] = musicianProfile ? useState(musicianProfile) : useState(null);
  // const [name, setName] = musicianProfile ? useState(musicianProfile.name) : useState('Fake Name');
  // const [genre, setGenre] = musicianProfile ? useState(musicianProfile.genre) : useState('Rock');
  // const [bio, setBio] = musicianProfile ? useState(musicianProfile.bio) : useState('Rock Singer from LA');
  const [displayImage, setDisplayImage] = useState<string | ArrayBuffer | null>('https://www.gravatar.com/avatar/2c7d99fe281ecd3bcd65ab915bac6dd5?s=250');

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setDisplayImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Implement your update logic here
    updateMusicianProfile({ 
      id: user?.id, 
      name: loadedMusicianProfile?.name, 
      genre: loadedMusicianProfile?.genre, 
      bio: loadedMusicianProfile?.bio,
      language: '', 
      location: '', 
      facebook: '', 
      twitter: '', 
      instagram: ''
    } as any);

    alert('Profile updated successfully');
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="p-8 space-y-6 bg-white rounded shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold text-center">Welcome to the Musician Dashboard {user?.email}</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              value={loadedMusicianProfile?.name}
              // onChange={(e) => setName(e.target.value)}
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
              value={loadedMusicianProfile?.genre}
              // onChange={(e) => setGenre(e.target.value)}
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
              value={loadedMusicianProfile?.bio}
              // onChange={(e) => setBio(e.target.value)}
              required
              className="w-full px-3 py-2 border rounded shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label htmlFor="displayImage" className="block text-sm font-medium text-gray-700">
              Display Image
            </label>
            <input
              id="displayImage"
              name="displayImage"
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="w-full px-3 py-2 border rounded shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          {displayImage && (
            <div className="flex justify-center">
              <img src={displayImage as string} alt="Display" className="w-32 h-32 rounded-full" />
            </div>
          )}
          <div>
            {/* add button which calls updateMusicianProfile with contents from form */}
            <button type="submit" className="w-full px-3 py-2 text-white bg-blue-500 rounded shadow-sm hover:bg-blue-600">
              Update Profile
            </button>
           
          </div>
        </form>
      </div>
    </div>
  );
}

export default withAuth(DashboardPage);