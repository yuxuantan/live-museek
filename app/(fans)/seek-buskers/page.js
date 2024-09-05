'use client'; // Ensures this component only renders on the client

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../../supabaseClient';

const BuskersPage = () => {
  const [buskers, setBuskers] = useState([]);
  
  useEffect(() => {
    const fetchBuskers = async () => {
      const { data, error } = await supabase.from('buskers').select('*');
      if (error) {
        console.error('Error fetching Buskers:', error);
      } else {
        console.log("fetchBuskers", data);
        setBuskers(data);
      }
    };
    fetchBuskers();
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAct, setselectedAct] = useState('');
  const [selectedArtForm, setselectedArtForm] = useState('');

  const acts = [...new Set(buskers.map(busker => busker.act))];
  const art_forms = [...new Set(buskers.map(busker => busker.art_form))];

  const filteredBuskers = buskers.filter(busker => {
    return (
      (busker.name.toLowerCase().includes(searchQuery.toLowerCase())) &&
      (selectedAct === '' || busker.act === selectedAct) &&
      (selectedArtForm === '' || busker.art_form === selectedArtForm)
    );
  });

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Buskers</h1>
      <div className="mb-6">
        <div className="flex lg:flex-row flex-col lg:space-x-4 space-y-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Buskers by name..."
            className="input-box"
          />
          <select
            value={selectedAct}
            onChange={(e) => setselectedAct(e.target.value)}
            className="input-box"
          >
            <option value="">All Acts</option>
            {acts.map(act => (
              <option key={act} value={act}>{act}</option>
            ))}
          </select>
          <select
            value={selectedArtForm}
            onChange={(e) => setselectedArtForm(e.target.value)}
            className="input-box"
          >
            <option value="">All Art Forms</option>
            {art_forms.map(art_form => (
              <option key={art_form} value={art_form}>{art_form}</option>
            ))}
          </select>
        </div>
      </div>
      <ul>
        {filteredBuskers.map(busker => (
          <li key={busker.id} className="mb-4">
            <Link href={`/seek-buskers/${busker.busker_id}`} className="hover:underline">
              {busker.name}
            </Link>
            <p className="">{busker.act} - {busker.art_form}</p>
            <p className="">{busker.bio}</p>
            {/* add a line */}
            <hr className="my-4" />
          </li>
        ))}
      </ul>
    </div>
  );
}

BuskersPage.displayName = 'BuskersPage';

export default BuskersPage;
