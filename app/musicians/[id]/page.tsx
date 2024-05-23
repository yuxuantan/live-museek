import { notFound } from 'next/navigation';
import React from 'react';
import { musicians, events } from '../../data/data'; // Adjust the import path as needed

export default function MusicianDetailPage({ params }: { params: { id: string } }) {
  const musician = musicians.find(m => m.id === parseInt(params.id));

  if (!musician) {
    notFound();
  }

  const musicianEvents = events.filter(event => event.performerId === musician.id);

  return (
    <div className="container mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h1 className="text-3xl font-bold mb-4">{musician.name}</h1>
        <p className="text-xl text-gray-700 mb-4">Genre: {musician.genre}</p>
        <p className="text-lg text-gray-600 mb-4">{musician.bio}</p>
        <div className="flex space-x-4">
          <a href={musician.socialMedia.facebook} target="_blank" className="text-blue-500 hover:underline">Facebook</a>
          <a href={musician.socialMedia.twitter} target="_blank" className="text-blue-500 hover:underline">Twitter</a>
          <a href={musician.socialMedia.instagram} target="_blank" className="text-blue-500 hover:underline">Instagram</a>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-semibold mb-4">Events</h2>
        {musicianEvents.length > 0 ? (
          <ul>
            {musicianEvents.map(event => (
              <li key={event.eventId} className="mb-4">
                <div className="p-4 bg-gray-100 rounded-lg shadow">
                  <h3 className="text-lg font-semibold mb-2">{event.name}</h3>
                  <p className="text-gray-700">Date: {event.date}</p>
                  <p className="text-gray-700">Time: {event.performanceStart} - {event.performanceEnd}</p>
                  <p className="text-gray-700">Location: <a href={`https://maps.google.com/?q=${event.realLifeLocation}`} target="_blank" className="text-blue-500 hover:underline">{event.location}</a></p>
                  <p className="text-gray-700">Genres: {event.musicGenres.join(', ')}</p>
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
