'use client';
import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';

const BuskerDetailPage = ({ params }) => {
  const [performances, setPerformances] = useState([]);
  const [busker, setBusker] = useState(null);

  // Get current epoch time to avoid image caching issues
  const currentEpochTime = Math.floor(new Date().getTime() / 1000);

  useEffect(() => {
    const fetchPerformances = async () => {
      const { data, error } = await supabase.from('performances').select('*').eq('busker_id', params.id);
      if (error) {
        console.error('Error fetching performances:', error);
      } else {
        // Fetch locations
        const { data: locationsData, error: locationsError } = await supabase.from('locations').select('*');
        // Join locations to performances
        data.forEach((performance) => {
          performance.location_name = locationsData.find(location => location.location_id === performance.location_id)?.name;
          performance.location_address = locationsData.find(location => location.location_id === performance.location_id)?.address;
        });
        setPerformances(data);
      }
    };

    const fetchBusker = async () => {
      const { data, error } = await supabase.from('buskers').select('*').eq('busker_id', params.id);
      if (error) {
        console.error('Error fetching busker:', error);
      } else {
        setBusker(data[0]);
      }
    };

    fetchPerformances();
    fetchBusker();
  }, [params.id]);

  // Get today's date and tomorrow's date
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  // Function to format the date label
  const formatDateLabel = (dateString) => {
    const date = new Date(dateString);

    // Check if the date is today, tomorrow, or a different day of the week
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tmr';
    } else {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    }
  };

  // Group performances by date
  const groupedPerformances = performances
    .filter(performance => new Date(performance.start_datetime) > new Date())
    .reduce((acc, performance) => {
      const date = new Date(performance.start_datetime).toISOString().substring(0, 10);
      if (!acc[date]) acc[date] = [];
      acc[date].push(performance);
      return acc;
    }, {});

  return (
    <div className="container mx-auto p-6">
      <div className="card rounded-lg shadow-lg p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex justify-center">
              <img
                src={`https://mlbwzkspmgxhudfnsfeb.supabase.co/storage/v1/object/public/busker_custom_images/${busker?.busker_id}.jpg?${currentEpochTime}`}
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = `https://mlbwzkspmgxhudfnsfeb.supabase.co/storage/v1/object/public/busker_images/${busker?.busker_id}.jpg?${currentEpochTime}`;
                }}
                className="h-fit aspect-square object-cover object-center rounded-full"
              />
            </div>
          </div>
          <div className="self-center">
            <h1 className="text-2xl md:text-3xl font-bold mb-4">{busker?.name}</h1>
            <p className="text-lg md:text-xl text-gray-700 mb-4">{busker?.act}</p>
            <p className="text-lg md:text-xl text-gray-700 mb-4">{busker?.art_form}</p>
          </div>
        </div>
        {busker?.custom_profile?.custom_bio || busker?.bio?.trim() ? (
          <p className="text-gray-600 mt-2 mb-8">{busker?.custom_profile?.custom_bio ?? busker?.bio.trim()}</p>
        ) : null}
      </div>

      <div className="flex flex-col mb-6 md:space-x-6 space-y-6">
        <div className="card rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4">Upcoming Events</h2>
          {Object.keys(groupedPerformances).length > 0 ? (
            <div>
              {Object.keys(groupedPerformances).sort().map(date => (
                <details key={date} className="mb-4">
                  <summary className="cursor-pointer text-xl mb-2">
                    {date} ({formatDateLabel(date)}) [{groupedPerformances[date].length}]
                  </summary>
                  <ul className="pl-4">
                    {groupedPerformances[date].map(performance => (
                      <li key={performance.event_id} className="mb-4">
                        <div className="p-4 bg-gray-100 rounded-lg shadow">
                          <p className="text-gray-700">Time: {String(performance.start_datetime).substring(11, 16)} - {String(performance.end_datetime).substring(11, 16)}</p>
                          <p className="text-gray-700">Location: <a href={`https://maps.google.com/?q=${performance.location_address}`} target="_blank" className="text-blue-500 hover:underline">{performance.location_name}</a></p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          ) : (
            <p className="text-gray-600">No upcoming performances found for this busker.</p>
          )}
        </div>
      </div>
    </div>
  );
}

BuskerDetailPage.displayName = 'BuskerDetailPage';
export default BuskerDetailPage;
