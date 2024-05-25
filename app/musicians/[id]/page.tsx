'use client';
// import { notFound } from 'next/navigation';
import React, {useState, useEffect} from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Event, Musician } from '../../types'; 

export default function MusicianDetailPage({ params }: { params: { id: string } }) {
  const [events, setEvents] = useState<Event[]>([]);
  const [musician, setMusician] = useState<Musician>();
  useEffect(() => {
    const fetchEvents = async () => {
      const { data, error } = await supabase.from('events').select('*').eq('performerId', parseInt(params.id));
      if (error) {
        console.error('Error fetching events:', error);
      } else {
        console.log("fetchEvents", data)
        setEvents(data);
      }
    };

    const fetchMusicians = async () => {
      const { data, error } = await supabase.from('musicians').select('*').eq('id', parseInt(params.id));
      if (error) {
        console.error('Error fetching musicians:', error);
      } else {
        console.log("fetchMusicians", data)
        setMusician(data[0]);
      }
    };

    fetchEvents();
    fetchMusicians();
  }, []);

  return (
    <div className="container mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h1 className="text-3xl font-bold mb-4">{musician?.name}</h1>
        <p className="text-xl text-gray-700 mb-4">Genre: {musician?.genre}</p>
        <p className="text-lg text-gray-600 mb-4">{musician?.bio}</p>
        <div className="flex space-x-4">
          <a href={musician?.facebook} target="_blank" className="text-blue-500 hover:underline">Facebook</a>
          <a href={musician?.twitter} target="_blank" className="text-blue-500 hover:underline">Twitter</a>
          <a href={musician?.instagram} target="_blank" className="text-blue-500 hover:underline">Instagram</a>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-semibold mb-4">Events</h2>
        {events.length > 0 ? (
          <ul>
            {events.map(event => (
              <li key={event.eventId} className="mb-4">
                <div className="p-4 bg-gray-100 rounded-lg shadow">
                  <h3 className="text-lg font-semibold mb-2">{event.name}</h3>
                  <p className="text-gray-700">Date: {event.performanceStart.substring(0,10)}</p>
                  <p className="text-gray-700">Time: {event.performanceStart.substring(11,16)} - {event.performanceEnd.substring(11,16)}</p>
                  <p className="text-gray-700">Location: <a href={`https://maps.google.com/?q=${event.realLifeLocation}`} target="_blank" className="text-blue-500 hover:underline">{event.location}</a></p>
                  <p className="text-gray-700">Genres: {event.musicGenres}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-600">No events found for this musician.</p>
        )}
      </div>
    </div>
  );
}
