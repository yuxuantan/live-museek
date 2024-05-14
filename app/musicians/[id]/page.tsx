import { notFound } from 'next/navigation';
import React from 'react';

interface Musician {
  id: number;
  name: string;
  genre: string;
  bio: string;
  socialMedia: {
    facebook: string;
    twitter: string;
    instagram: string;
  };
}

interface Event {
  id: number;
  name: string;
  location: string;
  realLifeLocation: string;
  date: string;
  performer: string;
  musicGenres: string[];
  performanceStart: string;
  performanceEnd: string;
}

// Example musicians data
const musicians: Musician[] = [
  { id: 1, name: 'John Doe', genre: 'Rock', bio: 'Rock musician from LA', socialMedia: { facebook: 'https://facebook.com/johndoe', twitter: 'https://twitter.com/johndoe', instagram: 'https://instagram.com/johndoe' } },
  { id: 2, name: 'Jane Smith', genre: 'Jazz', bio: 'Jazz musician from NY', socialMedia: { facebook: 'https://facebook.com/janesmith', twitter: 'https://twitter.com/janesmith', instagram: 'https://instagram.com/janesmith' } },
];

// Example events data from Singapore
const events: Event[] = [
  {
    id: 1,
    name: 'Rock Night',
    location: 'Esplanade Concert Hall',
    realLifeLocation: '1 Esplanade Dr, Singapore 038981',
    date: '2024-05-20',
    performer: 'John Doe',
    musicGenres: ['Rock', 'English'],
    performanceStart: '20:00',
    performanceEnd: '23:00'
  },
  {
    id: 2,
    name: 'Jazz Evening',
    location: 'Blu Jaz Cafe',
    realLifeLocation: '11 Bali Ln, Singapore 189848',
    date: '2024-06-15',
    performer: 'Jane Smith',
    musicGenres: ['Jazz', 'English'],
    performanceStart: '18:00',
    performanceEnd: '21:00'
  },
  {
    id: 3,
    name: 'Classical Night',
    location: 'Victoria Concert Hall',
    realLifeLocation: '9 Empress Pl, Singapore 179556',
    date: '2024-07-10',
    performer: 'Alice Tan',
    musicGenres: ['Classical'],
    performanceStart: '19:00',
    performanceEnd: '22:00'
  },
  {
    id: 4,
    name: 'Pop Fiesta',
    location: 'The Star Theatre',
    realLifeLocation: '1 Vista Exchange Green, Singapore 138617',
    date: '2024-08-05',
    performer: 'Bob Lim',
    musicGenres: ['Pop', 'Top 40s'],
    performanceStart: '20:00',
    performanceEnd: '23:00'
  },
  {
    id: 5,
    name: 'Indie Vibes',
    location: 'Kult Kafe',
    realLifeLocation: '11 Upper Wilkie Rd, Singapore 228120',
    date: '2024-09-12',
    performer: 'Charlie Wong',
    musicGenres: ['Indie', 'Mandopop'],
    performanceStart: '17:00',
    performanceEnd: '20:00'
  },
];

export default function MusicianDetailPage({ params }: { params: { id: string } }) {
  const musician = musicians.find(m => m.id === parseInt(params.id));

  if (!musician) {
    notFound();
  }

  const musicianEvents = events.filter(event => event.performer === musician.name);

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
              <li key={event.id} className="mb-4">
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
