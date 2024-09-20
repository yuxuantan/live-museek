'use client'; // Ensures this component only renders on the client

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../../supabaseClient';

const LocationsPage = () => {
  const [locations, setLocations] = useState([]);
  
  useEffect(() => {
    const fetchLocations = async () => {
      const { data, error } = await supabase.from('locations').select('*');
      if (error) {
        console.error('Error fetching Locations:', error);
      } else {
        console.log("fetchLocations", data);
        // sort by name
        data.sort((a, b) => a.name.localeCompare(b.name));
        setLocations(data);
      }
    };
    fetchLocations();
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArea, setSelectedArea] = useState('');

  const areas = [...new Set(locations.flatMap(location => location.area))].sort();

  const filteredLocations = locations.filter(location => {
    return (
      (location.name.toLowerCase().includes(searchQuery.toLowerCase())) &&
      (selectedArea === '' || location.area === selectedArea)
    );
  });

  return (
    <div className="container mx-auto p-6">
      {/* <h1 className="text-3xl font-bold mb-6">Buskers</h1> */}
      <div className="mb-6">
        <div className="flex lg:flex-row flex-col lg:space-x-4 space-y-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Locations by name..."
            className="input-box"
          />
          <select
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
            className="input-box"
          >
            <option value="">All Areas</option>
            {areas.map(area => (
              <option key={area} value={area}>{area}</option>
            ))}
          </select>
        </div>
      </div>
      <span className="text-gray-500">{filteredLocations.length} results found</span>
      <ul>
        {filteredLocations.map(location => (
          <li key={location.location_id} className="mb-4">
            <Link href={`/seek-locations/${location.location_id}`} className="hover:underline">
              {location.name}
            </Link>
            <p>{location.area}</p>
            {/* TODO: get number of performances happening */}
            {/* add a line */}
            <hr className="my-4" />
          </li>
        ))}
      </ul>
    </div>
  );
}

LocationsPage.displayName = 'LocationsPage';

export default LocationsPage;
