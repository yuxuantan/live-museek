'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

interface EventFormProps {
  onAddEvent: (event: EventData) => void;
}

interface EventData {
  name: string;
  location: string;
  date: string;
  languages: string[];
  tags: string[];
}

const EventForm: React.FC<EventFormProps> = ({ onAddEvent }) => {
  const router = useRouter();
  const [eventName, setEventName] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedLanguage = e.target.value;
    setSelectedLanguages(prevLanguages => [...prevLanguages, selectedLanguage]);
  };

  const handleTagChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedTag = e.target.value;
    setSelectedTags(prevTags => [...prevTags, selectedTag]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const eventData: EventData = {
      name: eventName,
      location: eventLocation,
      date: eventDate,
      languages: selectedLanguages,
      tags: selectedTags,
    };
    onAddEvent(eventData);
    router.push('/events');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-col">
        <label htmlFor="eventName" className="font-bold mb-1">Event Name:</label>
        <input type="text" id="eventName" value={eventName} onChange={e => setEventName(e.target.value)} className="p-2 border border-gray-300 rounded-md"/>
      </div>
      <div className="flex flex-col">
        <label htmlFor="location" className="font-bold mb-1">Location:</label>
        <input type="text" id="location" value={eventLocation} onChange={e => setEventLocation(e.target.value)} className="p-2 border border-gray-300 rounded-md"/>
      </div>
      <div className="flex flex-col">
        <label htmlFor="date" className="font-bold mb-1">Date:</label>
        <input type="date" id="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className="p-2 border border-gray-300 rounded-md"/>
      </div>
      <div className="flex flex-col">
        <label htmlFor="languages" className="font-bold mb-1">Song Languages:</label>
        <select id="languages" onChange={handleLanguageChange} className="p-2 border border-gray-300 rounded-md">
          <option value="" disabled>Select Language</option>
          <option value="English">English</option>
          <option value="Spanish">Spanish</option>
          <option value="French">French</option>
        </select>
      </div>
      <div className="flex flex-col">
        <label htmlFor="tags" className="font-bold mb-1">Tags:</label>
        <select id="tags" onChange={handleTagChange} className="p-2 border border-gray-300 rounded-md">
          <option value="" disabled>Select Tag</option>
          <option value="Rock">Rock</option>
          <option value="Jazz">Jazz</option>
          <option value="Pop">Pop</option>
        </select>
      </div>
      <button type="submit" className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
        Add Event
      </button>
    </form>
  );
};

export default EventForm;
