'use client';

import React, { useEffect, useState } from 'react';
import EventForm from '../../../components/ui/EventForm';
import withAuth from '../../../components/withAuth';
import { Event } from '../../../types';
import { supabase } from '../../../supabaseClient';
import { useAuth } from '../../../context/AuthContext';
import Popup from '../../../components/ui/Popup';

const CreateEventPage: React.FC = () => {
  const { musicianProfile } = useAuth();

  const fetchEvents = async () => {
    const { data, error } = await supabase.from('events').select('*').eq('performerId', musicianProfile?.id);
    if (error) {
      console.error('Error fetching events:', error);
    } else {
      console.log('fetchEvents', data);
      data.forEach((event: any) => {
        // convert data.event.musicGenres from string "[\"classical\",\"blues\"]" to array of strings, split by comma ["classical","blues"]
        event.musicGenres = JSON.parse(event.musicGenres)
        // convert data.event.performanceStart from string "2022-03-01T00:00:00.000Z" to Date object
        event.performanceStart = new Date(event.performanceStart)
        // convert data.event.performanceEnd from string "2022-03-01T00:00:00.000Z" to Date object
        event.performanceEnd = new Date(event.performanceEnd)
      });
      setEvents(data);
    }
  };

  const [name, setName] = useState('');
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isPopupOpen, setIsPopupOpen] = useState(false);

  useEffect(() => {
    setName(musicianProfile?.name ?? '');
    fetchEvents();
  }, [musicianProfile]);

  const handleAddEvent = (event: Event) => {
    setEvents((prevEvents) => [...prevEvents, event]);
    // print event edited message on screen which dissapears
    setSelectedEvent(null);
    setIsPopupOpen(false);
    alert('Event added successfully' + '\n' + event.name + '\n' + event.location + '\n' + event.performanceStart + '\n' + event.performanceEnd + '\n' + event.musicGenres);

  };

  const handleEditEvent = (updatedEvent: Event) => {
    setEvents((prevEvents) => prevEvents.map((event) => (event.eventId === updatedEvent.eventId ? updatedEvent : event)));
    setSelectedEvent(null);
    setIsPopupOpen(false);
    alert('Event edited successfully' + '\n' + updatedEvent.name + '\n' + updatedEvent.location + '\n' + updatedEvent.performanceStart + '\n' + updatedEvent.performanceEnd + '\n' + updatedEvent.musicGenres);
  };

  const handleDeleteEvent = (eventId: number) => {
    setEvents((prevEvents) => prevEvents.filter((event) => event.eventId !== eventId));
    setSelectedEvent(null);
    setIsPopupOpen(false);
    alert('Event deleted successfully');
  }

  const handleSelectEvent = (event: Event) => {
    setSelectedEvent(event);
    setIsPopupOpen(true);
  };

  const handleCreateNewEvent = () => {
    setSelectedEvent(null);
    setIsPopupOpen(true);
  };

  if (!musicianProfile) {
    return <div>Loading...</div>;
  } else {
    return (
      <div className="flex flex-col md:flex-row p-8 space-y-6 md:space-y-0 md:space-x-6">
        <div className="md:w-1/2">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">{name}&apos;s Events</h2>
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
                className={`p-4 bg-white rounded shadow-md hover:bg-gray-100 cursor-pointer ${
                  selectedEvent?.eventId === event.eventId ? 'bg-blue-100' : ''
                }`}
                onClick={() => handleSelectEvent(event)}
              >
                <strong>{event.name}</strong>
                <br />
                Location: {event.location}
                <br />
                {/* print musicGenres as comma separated values */}
                Music Genres: {event.musicGenres.join(', ')}
                <br />
                Performance Start: {event.performanceStart.toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: 'numeric',
                  hour12: true,
                })}
                <br />
                Performance End: {event.performanceEnd.toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: 'numeric',
                  hour12: true,
                })}
              </li>
            ))}
          </ul>
        </div>
        <Popup isOpen={isPopupOpen} onClose={() => setIsPopupOpen(false)}>
          <h1 className="text-2xl font-bold mb-4">{selectedEvent ? 'Edit Event' : 'Create Event'}</h1>
          <EventForm
            onAddEvent={handleAddEvent}
            onEditEvent={handleEditEvent}
            onDeleteEvent={handleDeleteEvent}
            selectedEvent={selectedEvent}
            performerId={musicianProfile?.id}
          />
        </Popup>
      </div>
    );
  }
};

export default withAuth(CreateEventPage);
