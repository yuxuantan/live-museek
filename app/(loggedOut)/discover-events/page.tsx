'use client'; // Ensures this component only renders on the client

import { useMemo, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
// import { events, musicians, Event } from '../data/data'; // Adjust the import path as needed
import { Event, Musician } from '../../types'; 
import { supabase } from '../../supabaseClient'; 

const DynamicMap = dynamic(() => import('../../components/ui/Map'), {
  ssr: false,
});

const containerStyle = {
  width: '100%',
  height: '400px',
};

const EventsPage = () => {
  const center = useMemo(() => ({ lat: 1.3521, lng: 103.8198 }), []); // Centered on Singapore
  const [events, setEvents] = useState<Event[]>([]);
  const [musicians, setMusicians] = useState<Musician[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState<string>('All');
  const [selectedDate, setSelectedDate] = useState<string>('2024-05-14'); // Default date

  const genres = ['Rock', 'Jazz', 'Classical', 'Pop', 'Indie', 'Mandopop', 'Top 40s', 'English'];
  const times = ['All', '6am-12noon', '12noon-6pm', '6pm-9pm', '9pm-12midnight'];
  useEffect(() => {
    const fetchEvents = async () => {
      const { data, error } = await supabase.from('events').select('*');
      if (error) {
        console.error('Error fetching events:', error);
      } else {
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
  }, []);

  const filterEvents = (event: Event) => {
    const isGenreMatch = selectedGenres.length === 0 || selectedGenres.some(genre => event.musicGenres.includes(genre));
    const isTimeMatch = selectedTime === 'All' || (
      (selectedTime === '6am-12noon' && event.performanceStart >= '06:00' && event.performanceStart < '12:00') ||
      (selectedTime === '12noon-6pm' && event.performanceStart >= '12:00' && event.performanceStart < '18:00') ||
      (selectedTime === '6pm-9pm' && event.performanceStart >= '18:00' && event.performanceStart < '21:00') ||
      (selectedTime === '9pm-12midnight' && event.performanceStart >= '21:00')
    );
    const isDateMatch = selectedDate === '' || event.performanceStart.substring(0, 10) === selectedDate;
    return isGenreMatch && isTimeMatch && isDateMatch;
  };

  const filteredEvents = events.filter(filterEvents);

  const handleGenreChange = (genre: string) => {
    setSelectedGenres(prev =>
      prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]
    );
  };

  const handleTimeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTime(event.target.value);
  };

  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(event.target.value);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Events</h1>
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Filter by Genre</h2>
        <div className="flex flex-wrap">
          {genres.map(genre => (
            <label key={genre} className="mr-4 mb-2">
              <input
                type="checkbox"
                value={genre}
                checked={selectedGenres.includes(genre)}
                onChange={() => handleGenreChange(genre)}
              />
              <span className="ml-2">{genre}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Filter by Performance Start Time</h2>
        <select value={selectedTime} onChange={handleTimeChange} className="p-2 border rounded">
          {times.map(time => (
            <option key={time} value={time}>
              {time}
            </option>
          ))}
        </select>
      </div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Filter by Performance Start Date</h2>
        <input
          type="date"
          value={selectedDate}
          onChange={handleDateChange}
          className="p-2 border rounded"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1 space-y-4">
          {selectedEvent ? (
            <div className="p-4 bg-white rounded-lg shadow">
              <h2 className="text-xl font-semibold">{selectedEvent.name} - {selectedEvent.musicGenres}</h2>
              <p>Performer: <a href={`/discover-musicians/${selectedEvent.performerId}`} className="text-blue-500 hover:underline">{musicians.find(m => m.id === selectedEvent.performerId)?.name}</a></p>
              <p>Location: <a href={`https://maps.google.com/?q=${selectedEvent.realLifeLocation}`} target="_blank" className="text-blue-500 hover:underline">{selectedEvent.location}</a></p>
              <p>Date: {selectedEvent.performanceStart.substring(0, 10)}</p>
              <p>Time: {selectedEvent.performanceStart} to {selectedEvent.performanceEnd}</p>
            </div>
          ) : (
            <p>Select an event from the map.</p>
          )}
        </div>
        <div className="md:col-span-2">
          <div className="relative w-full h-96 rounded-lg overflow-hidden shadow-lg">
            <DynamicMap center={center} events={filteredEvents} containerStyle={containerStyle} onMarkerClick={setSelectedEvent} />
          </div>
        </div>
      </div>
    </div>
  );
}
export default EventsPage;
