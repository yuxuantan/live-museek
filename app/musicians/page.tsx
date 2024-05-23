'use client'; // Ensures this component only renders on the client

import React, { useState } from 'react';
import Link from 'next/link';
import { musicians } from '../data/data'; // Adjust the import path as needed

export default function MusiciansPage() {
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
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search musicians by name..."
          className="p-2 border rounded w-full mb-4"
        />
        <div className="flex space-x-4">
          <select
            value={selectedGenre}
            onChange={(e) => setSelectedGenre(e.target.value)}
            className="p-2 border rounded"
          >
            <option value="">All Genres</option>
            {genres.map(genre => (
              <option key={genre} value={genre}>{genre}</option>
            ))}
          </select>
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="p-2 border rounded"
          >
            <option value="">All Languages</option>
            {languages.map(language => (
              <option key={language} value={language}>{language}</option>
            ))}
          </select>
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="p-2 border rounded"
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
            <Link href={`/musicians/${musician.id}`} className="text-blue-500 hover:underline">
              {musician.name}
            </Link>
            <p className="text-gray-700">{musician.genre} - {musician.language} - {musician.location}</p>
            <p className="text-gray-600">{musician.bio}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
