'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';
import { mergeBackToBackPerformances } from '../../../utils';
import { QRCodeSVG } from 'qrcode.react';

export default function BuskerDetailPage({ params }) {
  const [performances, setPerformances] = useState([]);
  const [busker, setBusker] = useState(null);
  const [showQR, setShowQR] = useState(false);

  const currentEpochTime = Math.floor(new Date().getTime() / 1000);
  const qrCodeUrl = `livemuseek.com/seek-buskers/${params.id}`;

  useEffect(() => {
    const fetchPerformances = async () => {
      const { data, error } = await supabase.from('performances').select('*').eq('busker_id', params.id);
      if (error) {
        console.error('Error fetching performances:', error);
      } else {
        const { data: locationsData, error: locationsError } = await supabase.from('locations').select('*');
        if (locationsError) {
          console.error('Error fetching locations:', locationsError);
        } else {
          const performancesWithLocations = data.map((performance) => ({
            ...performance,
            location_name: locationsData.find(location => location.location_id === performance.location_id)?.name,
            location_address: locationsData.find(location => location.location_id === performance.location_id)?.address,
          }));
          const mergedPerformances = mergeBackToBackPerformances(performancesWithLocations);
          setPerformances(mergedPerformances);
        }
      }
    };

    const fetchBusker = async () => {
      const { data, error } = await supabase.from('buskers').select('*').eq('busker_id', params.id).single();
      if (error) {
        console.error('Error fetching busker:', error);
      } else {
        setBusker(data);
      }
    };

    fetchPerformances();
    fetchBusker();
  }, [params.id]);

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const formatDateLabel = (dateString) => {
    const date = new Date(dateString);
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tmr';
    } else {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    }
  };

  const groupedPerformances = performances
    .reduce((acc, performance) => {
      const date = new Date(performance.start_datetime).toISOString().substring(0, 10);
      if (!acc[date]) acc[date] = [];
      acc[date].push(performance);
      return acc;
    }, {});

  return (
    <div className="container mx-auto p-6">
      <div className="card bg-base-100 shadow-xl mb-6">
        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="relative">
              <img
                src={`https://mlbwzkspmgxhudfnsfeb.supabase.co/storage/v1/object/public/busker_custom_images/${busker?.busker_id}.jpg?${currentEpochTime}`}
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = `https://mlbwzkspmgxhudfnsfeb.supabase.co/storage/v1/object/public/busker_images/${busker?.busker_id}.jpg?${currentEpochTime}`;
                }}
                className="w-full aspect-square object-cover object-center rounded-full"
                alt={busker?.name}
              />
              <button
                className="btn btn-primary btn-sm absolute bottom-0 right-0 m-2"
                onClick={() => setShowQR(!showQR)}
              >
                {showQR ? 'Hide QR' : 'Generate Sharing QR'}
              </button>
            </div>
            <div className="self-center col-span-2">
              <h1 className="text-2xl md:text-3xl font-bold mb-4">{busker?.name}</h1>
              <p className="text-lg md:text-xl text-base-content mb-4">{busker?.act}</p>
              <p className="text-lg md:text-xl text-base-content mb-4">{busker?.art_form}</p>
              {showQR && (
                <div className="mt-4">
                  <QRCodeSVG value={qrCodeUrl} size={128} />
                  <p className="mt-2 text-sm text-base-content/70">Scan to get link to current page</p>
                </div>
              )}
            </div>
          </div>
          {busker?.custom_profile?.custom_bio || busker?.bio?.trim() ? (
            <p className="text-base-content/80 mt-6">{busker?.custom_profile?.custom_bio ?? busker?.bio.trim()}</p>
          ) : null}
        </div>
      </div>

      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="text-2xl font-semibold mb-4">Upcoming Events</h2>
          {Object.keys(groupedPerformances).length > 0 ? (
            <div className="space-y-4">
              {Object.keys(groupedPerformances).sort().map(date => (
                <div key={date} className="collapse collapse-arrow bg-gray-200">
                  <input type="checkbox" /> 
                  <div className="collapse-title text-xl font-medium">
                    {date} ({formatDateLabel(date)}) [{groupedPerformances[date].length}]
                  </div>
                  <div className="collapse-content">
                    <ul className="space-y-4">
                      {groupedPerformances[date]
                        .sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime))
                        .map(performance => (
                          <li key={performance.event_id}>
                            <div className="card bg-base-100 shadow-sm">
                              <div className="card-body p-4">
                              <p className="text-gray-700">Time: {String(performance.start_datetime).substring(11, 16)} - {String(performance.end_datetime).substring(11, 16)}</p>
                                <p className="text-base-content">Location: <a href={`/seek-locations/${performance.location_id}`} className="link link-primary">{performance.location_name}</a></p>
                              </div>
                            </div>
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-base-content/70">No upcoming performances found for this busker.</p>
          )}
        </div>
      </div>
    </div>
  );
}