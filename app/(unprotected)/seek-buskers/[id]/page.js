'use client';
import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';

const BuskerDetailPage = ({ params }) => {
  const [performances, setPerformances] = useState([]);
  const [busker, setBusker] = useState(null);
  // const [profileImage, setProfileImage] = useState('https://www.gravatar.com/avatar/2c7d99fe281ecd3bcd65ab915bac6dd5?s=250');

  useEffect(() => {
    const fetchPerformances = async () => {
      const { data, error } = await supabase.from('performances').select('*').eq('busker_id', params.id);
      if (error) {
        console.error('Error fetching performances:', error);
      } else {
        console.log("fetchPerformances", data);
        setPerformances(data);
      }
    };


    const fetchBusker = async () => {
      const { data, error } = await supabase.from('buskers').select('*').eq('busker_id', params.id);
      if (error) {
        console.error('Error fetching Buskers:', error);
      } else {
        console.log("fetchBuskers", data);
        setBusker(data[0]);
      }
    };

    fetchPerformances();
    fetchBusker();
  }, [params.id]);

  return (
    <div className="container mx-auto p-6">
      <div className="card rounded-lg shadow-lg p-6 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>

            <div className="flex justify-center">
              <img src={`https://mlbwzkspmgxhudfnsfeb.supabase.co/storage/v1/object/public/busker_images/${busker?.busker_id}.jpg`} className="h-fit aspect-square object-cover object-center rounded-full" />
            </div>

          </div>
          <div className="self-center">
            <h1 className="text-2xl md:text-3xl font-bold mb-4">{busker?.name}</h1>
            <p className="text-lg md:text-xl text-gray-700 mb-4">{busker?.act}</p>
            <p className="text-lg md:text-xl text-gray-700 mb-4">{busker?.art_form}</p>

          </div>
        </div>
        <p className="text-gray-600 my-8">{busker?.bio}</p>
        {/* <hr className="my-4" /> */}
        {/* <div className="flex space-x-4 justify-evenly">
          <a href={Busker?.facebook} target="_blank" className="text-blue-500 hover:underline">Facebook</a>
          <a href={Busker?.twitter} target="_blank" className="text-blue-500 hover:underline">Twitter</a>
          <a href={Busker?.instagram} target="_blank" className="text-blue-500 hover:underline">Instagram</a>
        </div> */}
      </div>

      <div className="flex flex-col mb-6 md:space-x-6 space-y-6">
        <div className="card rounded-lg shadow-lg p-6">
          <h2 className="text-2xl font-semibold mb-4">Upcoming Events</h2>
          {performances.filter(performance => new Date(performance.start_datetime) > new Date()).length > 0 ? (
            <ul>
              {performances.filter(performance => new Date(performance.start_datetime) > new Date())
                .sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime))
                .map(performance => (
                  <li key={performance.event_id} className="mb-4">
                    <div className="p-4 bg-gray-100 rounded-lg shadow">
                      <p className="text-gray-700">Date: {String(performance.start_datetime).substring(0, 10)}</p>
                      <p className="text-gray-700">Time: {String(performance.start_datetime).substring(11, 16)} - {String(performance.end_datetime).substring(11, 16)}</p>
                      <p className="text-gray-700">Location: <a href={`https://maps.google.com/?q=${performance.location_address}`} target="_blank" className="text-blue-500 hover:underline">{performance.location_name}</a></p>
                    </div>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="text-gray-600">No upcoming performances found for this Busker.</p>
          )}
        </div>
      </div>
    </div>
  );
}

BuskerDetailPage.displayName = 'BuskerDetailPage';
export default BuskerDetailPage;
