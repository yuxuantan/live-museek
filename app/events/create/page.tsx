'use client'; // Mark this page as a client component if it manages state or effects

import React, { useState } from 'react';
import EventForm from '../../components/EventForm';

const CreateEventPage: React.FC = () => {
  const [events, setEvents] = useState<EventData[]>([]);

  const handleAddEvent = (event: EventData) => {
    setEvents(prevEvents => [...prevEvents, event]);
  };

  return (
    <div>
      <h1>Create Event</h1>
      <EventForm onAddEvent={handleAddEvent} />
      <h2>Existing Events</h2>
      <ul>
        {events.map((event, index) => (
          <li key={index}>
            <strong>{event.name}</strong> - {event.location} - {event.date}
            <br />
            Languages: {event.languages.join(', ')}
            <br />
            Tags: {event.tags.join(', ')}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CreateEventPage;
