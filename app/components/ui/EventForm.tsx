'use client';

import React, { useState, useEffect } from 'react';
// TODO: get events from supabase
// import { Event, musicians } from '../../data/data';
import { Event } from '../../types';
interface EventFormProps {
  onAddEvent: (event: Event) => void;
  onEditEvent: (event: Event) => void;
  selectedEvent: Event | null;
}

const EventForm: React.FC<EventFormProps> = ({ onAddEvent, onEditEvent, selectedEvent }) => {
  const [event, setEvent] = useState<Event>({ eventId: 0, name: '', location: '', realLifeLocation: '', performerId: 0, musicGenres: [], performanceStart: '', performanceEnd: '' });

  useEffect(() => {
    if (selectedEvent) {
      setEvent(selectedEvent);
    } else {
      setEvent({ eventId: 0, name: '', location: '', realLifeLocation: '', performerId: 0, musicGenres: [], performanceStart: '', performanceEnd: '' });
    }
  }, [selectedEvent]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedEvent) {
      onEditEvent(event);
    } else {
      onAddEvent({ ...event, eventId: Date.now() });
    }
    setEvent({ eventId: 0, name: '', location: '', realLifeLocation: '', performerId: 0, musicGenres: [], performanceStart: '', performanceEnd: '' });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded bg-white shadow-md">
      <div>
        <label className="block text-sm font-medium text-gray-700">Name</label>
        <input
          type="text"
          value={event.name}
          onChange={(e) => setEvent({ ...event, name: e.target.value })}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Location</label>
        <input
          type="text"
          value={event.location}
          onChange={(e) => setEvent({ ...event, location: e.target.value })}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Real-Life Location</label>
        <input
          type="text"
          value={event.realLifeLocation}
          onChange={(e) => setEvent({ ...event, realLifeLocation: e.target.value })}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Date</label>
        <input
          type="date"
          value={event.performanceStart}
          onChange={(e) => setEvent({ ...event, performanceStart: e.target.value })}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          required
        />
      </div>
      {/* <div>
        <label className="block text-sm font-medium text-gray-700">Performer</label>
        <select
          value={event.performerId}
          onChange={(e) => setEvent({ ...event, performerId: parseInt(e.target.value) })}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          required
        >
          <option value="" disabled>Select performer</option>
          {musicians.map((musician) => (
            <option key={musician.id} value={musician.id}>
              {musician.name}
            </option>
          ))}
        </select>
      </div> */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Music Genres</label>
        <input
          type="text"
          value={event.musicGenres.join(', ')}
          onChange={(e) => setEvent({ ...event, musicGenres: e.target.value.split(',').map(genre => genre.trim()) })}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Performance Start</label>
        <input
          type="time"
          value={event.performanceStart}
          onChange={(e) => setEvent({ ...event, performanceStart: e.target.value })}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Performance End</label>
        <input
          type="time"
          value={event.performanceEnd}
          onChange={(e) => setEvent({ ...event, performanceEnd: e.target.value })}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          required
        />
      </div>
      <button
        type="submit"
        className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        {selectedEvent ? 'Edit Event' : 'Add Event'}
      </button>
    </form>
  );
};

export default EventForm;
