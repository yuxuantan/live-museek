'use client'; // Ensures this component only renders on the client

import { useMemo, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Select, { MultiValue } from 'react-select';
import { Event, Musician } from '../../types';
import { supabase } from '../../supabaseClient';
import { genreOptions } from '@/app/constants/genreOptions';

const DynamicMap = dynamic(() => import('../../components/ui/Map'), {
  ssr: false,
});

const containerStyle = {
  width: '100%',
  height: '400px',
};

const EventsPage = () => {
  const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [musicians, setMusicians] = useState<Musician[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedGenres, setSelectedGenres] = useState<MultiValue<{ value: string, label: string }>>([]);
  const [selectedTime, setSelectedTime] = useState<string>('All');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toLocaleDateString('sv-SE'));
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

  const center = useMemo(() => (userLocation ? userLocation : { lat: 1.3521, lng: 103.8198 }), [userLocation]);
  const times = ['All', '6am-12noon', '12noon-6pm', '6pm-9pm', '9pm-12midnight'];

  useEffect(() => {
    const getUserLocation = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setUserLocation({
              lat: position.coords.latitude,
              lng: position.coords.longitude
            });
          },
          (error) => {
            console.error('Error getting user location:', error);
          }
        );
      } else {
        console.error('Geolocation is not supported by this browser.');
      }
    };

    const fetchEvents = async () => {
      const { data, error } = await supabase.from('events').select('*');
      if (error) {
        console.error('Error fetching events:', error);
      } else {
        data.forEach((event: any) => {
          event.musicGenres = JSON.parse(event.musicGenres);
          event.performanceStart = new Date(event.performanceStart);
          event.performanceEnd = new Date(event.performanceEnd);
        });
        setEvents(data);
      }
    };

    const fetchMusicians = async () => {
      const { data, error } = await supabase.from('musicians').select('*');
      if (error) {
        console.error('Error fetching musicians:', error);
      } else {
        setMusicians(data);
      }
    };

    fetchEvents();
    fetchMusicians();
    getUserLocation();
  }, []);

  const filterEvents = (event: Event) => {
    const selectedGenreValues = selectedGenres.map(genre => genre.value);
    const isGenreMatch = selectedGenreValues.length === 0 || selectedGenreValues.some(genre => event.musicGenres.includes(genre));
    const isTimeMatch = selectedTime === 'All' || (
      (selectedTime === '6am-12noon' && event.performanceStart?.getHours() >= 6 && event.performanceStart?.getHours() < 12) ||
      (selectedTime === '12noon-6pm' && event.performanceStart?.getHours() >= 12 && event.performanceStart?.getHours() < 18) ||
      (selectedTime === '6pm-9pm' && event.performanceStart?.getHours() >= 18 && event.performanceStart?.getHours() < 21) ||
      (selectedTime === '9pm-12midnight' && event.performanceStart?.getHours() >= 21)
    );
    const isDateMatch = selectedDate === '' || (event.performanceStart instanceof Date && event.performanceStart.toISOString().substring(0, 10) === selectedDate);
    return isGenreMatch && isTimeMatch && isDateMatch;
  };

  const filteredEvents = events.filter(filterEvents);

  const handleGenreChange = (genres: MultiValue<{ value: string, label: string }>) => {
    setSelectedGenres(genres);
  };

  const handleTimeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTime(event.target.value);
  };

  const toggleDescription = (eventId: number) => {
    setExpandedEvents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(eventId)) {
        newSet.delete(eventId);
      } else {
        newSet.add(eventId);
      }
      return newSet;
    });
  };

  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(new Date(event.target.value).toISOString().substring(0, 10));
  };

  const handleDateChangeByOffset = (offset: number) => {
    const currentDate = new Date(selectedDate);
    currentDate.setDate(currentDate.getDate() + offset);
    setSelectedDate(currentDate.toISOString().substring(0, 10));
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Events</h1>

      <div className="flex md:flex-row flex-col md:space-x-4">
        <div className='flex flex-row space-x-4'>
          <div className="mb-4">
            <h2 className="text-sm font-semibold">Performance Start Date</h2>
            <div className="flex items-center">
              <button
                onClick={() => handleDateChangeByOffset(-1)}
                className="p-2 rounded-full bg-black hover:bg-gray-500 focus:outline-none"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 transform -rotate-90" // Add transform rotate-180 class here
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 3a.5.5 0 01.5.5v12a.5.5 0 01-1 0v-12A.5.5 0 0110 3zm-7.354 8.646a.5.5 0 010-.708l6-6a.5.5 0 01.708 0l6 6a.5.5 0 01-.708.708L10 6.707 3.354 13.354a.5.5 0 01-.708 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={handleDateChange}
                className="input-box mt-1 px-3 py-2 rounded-md shadow-sm"
              />
              <button
                onClick={() => handleDateChangeByOffset(1)}
                className="p-2 rounded-full bg-black hover:bg-gray-500 focus:outline-none"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 transform rotate-90" // Add transform rotate-180 class here
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 3a.5.5 0 01.5.5v12a.5.5 0 01-1 0v-12A.5.5 0 0110 3zm-7.354 8.646a.5.5 0 010-.708l6-6a.5.5 0 01.708 0l6 6a.5.5 0 01-.708.708L10 6.707 3.354 13.354a.5.5 0 01-.708 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
          <div className="mb-4">
            <h2 className="text-sm font-semibold">Performance Start Time</h2>
            <select value={selectedTime} onChange={handleTimeChange} className="input-box mt-1 px-3 py-2 rounded-md shadow-sm">
              {times.map(time => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-semibold">Music Genre</label>
          <Select
            isMulti
            value={selectedGenres}
            onChange={handleGenreChange}
            options={genreOptions[0].options}
            className="input-box w-80 rounded-md shadow-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <div className="relative w-full h-96 rounded-lg overflow-hidden shadow-lg">
            <DynamicMap center={center} events={filteredEvents} containerStyle={containerStyle} onMarkerClick={setSelectedEvent} />
          </div>
        </div>
        <div className="md:col-span-1 space-y-4">
          {filteredEvents.map(event => (
            <div key={event.eventId} className={`p-4 rounded-lg shadow ${selectedEvent && selectedEvent.eventId === event.eventId ? 'bg-green-800' : 'card'}`}>
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">{event.name}</h2>
                <button onClick={() => toggleDescription(event.eventId ?? 0)}>
                  <span>{expandedEvents.has(event.eventId ?? 0) ? '▲' : '▼'}</span>
                </button>
              </div>
              <img src={event.logo_url} alt={event.name} className="w-full h-64 object-contain" />
              {event.performerIds && musicians.find(m => event.performerIds?.includes(m.id)) && (
                <>
                  <p>Performer: <a href={`/seek-musicians/${event.performerIds}`} className="text-blue-500 hover:underline">{musicians.find(m => event.performerIds?.includes(m.id))?.name}</a></p>
                </>
              )}
              <p>Location: <a href={`https://maps.google.com/?q=${event.realLifeLocation}`} target="_blank" className="text-blue-500 hover:underline">{event.location}</a></p>
              <p>Date: {event.performanceStart.toLocaleString('en-US').substring(0, 9)}</p>
              <p>Time: {event.performanceStart.toLocaleString('en-US').substring(11,)} to {event.performanceEnd.toLocaleString('en-US').substring(11,)}</p>
              {expandedEvents.has(event.eventId ?? 0) && (
                <>
                  <p className="mt-2">{event.musicGenres && event.musicGenres.length > 0 ? event.musicGenres.join(', ') : ''}</p>
                  <p className="mt-2"><a href={event.ext_url} target="_blank" className="text-blue-500 hover:underline">Event URL</a></p>
                  <hr className="my-2" />
                  <p className="mt-2" dangerouslySetInnerHTML={{ __html: event.description }}></p>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

EventsPage.displayName = 'EventsPage';
export default EventsPage;
