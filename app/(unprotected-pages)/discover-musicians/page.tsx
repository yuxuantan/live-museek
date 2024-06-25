'use client'; // Ensures this component only renders on the client

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../../supabaseClient';
import { Musician } from '../../types';

const MusiciansPage = () => {
  const [musicians, setMusicians] = useState<Musician[]>([]);
  useEffect(() => {
    const fetchMusicians = async () => {
      const { data, error } = await supabase.from('musicians').select('*');
      if (error) {
        console.error('Error fetching musicians:', error);
      } else {
        console.log("fetchMusicians", data)
        setMusicians(data);
      }
    };
    fetchMusicians();
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');

  const genres = [...new Set(musicians.map(musician => musician.genre))];
  const languages = [...new Set(musicians.map(musician => musician.language))];
  const locations = [...new Set(musicians.map(musician => musician.location))];

  const filteredMusicians = musicians.filter(musician => {
    return (
      (musician.name.toLowerCase().includes(searchQuery.toLowerCase())) &&
      (selectedGenre === '' || musician.genre === selectedGenre) &&
      (selectedLanguage === '' || musician.language === selectedLanguage) &&
      (selectedLocation === '' || musician.location === selectedLocation)
    );
  });

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Musicians</h1>
      <div className="mb-6">
        <div className="flex md:flex-row flex-col md:space-x-4 space-y-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search musicians by name..."
            className="input-box md:w-1/3"
          />
          <select
            value={selectedGenre}
            onChange={(e) => setSelectedGenre(e.target.value)}
            className="input-box"
          >
            <option value="">All Genres</option>
            {genres.map(genre => (
              <option key={genre} value={genre}>{genre}</option>
            ))}
          </select>
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="input-box"
          >
            <option value="">All Languages</option>
            {languages.map(language => (
              <option key={language} value={language}>{language}</option>
            ))}
          </select>
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="input-box"
          >
            <option value="">All Locations</option>
            {locations.map(location => (
              <option key={location} value={location}>{location}</option>
            ))}
          </select>
        </div>
      </div>
      <ul>
        {filteredMusicians.map(musician => (
          <li key={musician.id} className="mb-4">
            <Link href={`/discover-musicians/${musician.id}`} className="hover:underline">
              {musician.name}
            </Link>
            <p className="">{musician.genre} - {musician.language} - {musician.location}</p>
            <p className="">{musician.bio}</p>
            {/* add a line */}
            <hr className="my-4" />
          </li>
        ))}
      </ul>
    </div>
  );
}

MusiciansPage.displayName = 'MusiciansPage';

export default MusiciansPage;