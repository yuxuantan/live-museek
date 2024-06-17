'use client';

import React, { useState } from 'react';
import EventForm from '../../components/ui/EventForm';
import { events as initialEvents, Event, musicians } from '../../data/data';

const CreateEventPage: React.FC = () => {
  const johnDoeEvents = initialEvents.filter(event => event.performerId === 1); // Filter events for John Doe
  const [events, setEvents] = useState<Event[]>(johnDoeEvents);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  const handleAddEvent = (event: Event) => {
    setEvents((prevEvents) => [...prevEvents, event]);
  };

  const handleEditEvent = (updatedEvent: Event) => {
    setEvents((prevEvents) => prevEvents.map((event) => (event.eventId === updatedEvent.eventId ? updatedEvent : event)));
    setSelectedEvent(null);
  };

  const handleSelectEvent = (event: Event) => {
    setSelectedEvent(event);
  };

  const handleCreateNewEvent = () => {
    setSelectedEvent(null);
  };

  return (
    <div className="flex flex-col md:flex-row p-8 space-y-6 md:space-y-0 md:space-x-6">
      <div className="md:w-1/2">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">John Doe&apos;s Events</h2>
          <button
            onClick={handleCreateNewEvent}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Create New Event
          </button>
        </div>
        <ul className="space-y-4">
          {events.map((event) => (
            <li
              key={event.eventId}
              className={`p-4 bg-white rounded shadow-md hover:bg-gray-100 cursor-pointer ${selectedEvent?.eventId === event.eventId ? 'bg-blue-100' : ''}`}
              onClick={() => handleSelectEvent(event)}
            >
              <strong>{event.name}</strong> - {event.location} - {event.date}
              <br />
              Music Genres: {event.musicGenres.join(', ')}
              <br />
              Performer: {musicians.find((musician) => musician.id === event.performerId)?.name}
              <br />
              Performance Time: {event.performanceStart} - {event.performanceEnd}
            </li>
          ))}
        </ul>
      </div>
      <div className="md:w-1/2">
        <h1 className="text-2xl font-bold mb-4">{selectedEvent ? 'Edit Event' : 'Create Event'}</h1>
        <EventForm onAddEvent={handleAddEvent} onEditEvent={handleEditEvent} selectedEvent={selectedEvent} />
      </div>
    </div>
  );
};

export default CreateEventPage;
