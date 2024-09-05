// 'use client';

// import React, { useState, useEffect } from 'react';
// import { Event, Musician } from '../../types';
// import { supabase } from '../../supabaseClient';
// import Select, { MultiValue } from 'react-select';

// import { genreOptions } from '../../constants/genreOptions'; // Import the genre options


// interface EventFormProps {
//   onAddEvent: (event: Event) => void;
//   onEditEvent: (event: Event) => void;
//   onDeleteEvent: (eventId: number) => void;
//   selectedEvent: Event | null;
//   myPerformerId: string;
// }

// const EventForm: React.FC<EventFormProps> = ({ onAddEvent, onEditEvent, onDeleteEvent, selectedEvent, myPerformerId }) => {
//   const [event, setEvent] = useState<Event>({ eventId: null, name: '', description: '', location: '', realLifeLocation: '', performerIds: [myPerformerId], musicGenres: [], performanceStart: new Date(), performanceEnd: new Date(), summary:'', logo_url: '', ext_url: '' });
//   const [selectedGenres, setSelectedGenres] = useState<MultiValue<{
//     value: string;
//     label: string;
//   }> | null>(null);
//   const [selectedPerformers, setSelectedPerformers] = useState<MultiValue<{
//     value: string;
//     label: string;
//   }> | null>(null);

//   const [validationError, setValidationError] = useState<string | null>(null);

//   const handleChangeGenre = (selectedGenres: MultiValue<{ value: string; label: string }>) => {
//     setSelectedGenres(selectedGenres);
//     setEvent({ ...event, musicGenres: selectedGenres.map((genre) => genre.value) });
//   };

  
//   const performerOptions: { value: string; label: string }[] = [];
//   const handleChangePerformers = (selectedPerformers: MultiValue<{ value: string; label: string }>) => {
//     console.log("handle change placeholder")
//     setSelectedPerformers(selectedPerformers);
//   };

//   useEffect(() => {
//     if (selectedEvent) {
//       setEvent(selectedEvent);
//       // set selected genres with event.musicGenres
//       const genres = genreOptions[0].options.filter((option: { value: string }) => selectedEvent.musicGenres.includes(option.value));
//       setSelectedGenres(genres);
//     } else {
//       // Set performance start as next day 7pm, and end as next day 10pm in local timezone
//       const tomorrow = new Date();
//       tomorrow.setDate(tomorrow.getDate() + 1);
//       tomorrow.setHours(19, 0, 0, 0);
//       const tomorrowEnd = new Date();
//       tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
//       tomorrowEnd.setHours(22, 0, 0, 0);
//       setEvent({ ...event, performanceStart: tomorrow, performanceEnd: tomorrowEnd });
//     }
//   }, [selectedEvent]);

//   const fetchMusicians = async () => {
//     const { data, error } = await supabase.from('musicians').select('*');
//     if (error) {
//       console.error('Error fetching musicians:', error);
//     } else {
//       console.log('fetchMusicians', data);
   
//       performerOptions.push(...data.map((musician: Musician) => ({ value: musician.id, label: musician.name })));
//       // TODO: get name of musician with id myPerformerId, then autofill the performerIds with that name
//     }
//   };
//   fetchMusicians();



//   const handleSubmit = (e: React.FormEvent) => {
//     e.preventDefault();
//     if (event.performanceEnd <= event.performanceStart) {
//       setValidationError('Performance end time must be later than performance start time.');
//       return;
//     }

//     if (selectedEvent) {
//       onEditEvent(event);
//       // update event in supabase db
//       supabase.from('events').update({
//         name: event.name,
//         description: event.description,
//         location: event.location,
//         realLifeLocation: event.realLifeLocation,
//         performerIds: event.performerIds,
//         musicGenres: event.musicGenres,
//         performanceStart: event.performanceStart,
//         performanceEnd: event.performanceEnd
//       }).eq('eventId', selectedEvent.eventId).then(({ data, error }) => {
//         if (error) {
//           console.error('Error updating event:', error);
//         } else {
//           console.log('Event updated successfully:', data);
//         }
//       });
//     } else {
//       onAddEvent({ ...event, eventId: Date.now() });
//       // add event to supabase db
//       supabase.from('events').insert([{
//         name: event.name,
//         description: event.description,
//         location: event.location,
//         realLifeLocation: event.realLifeLocation,
//         performerId: event.performerIds,
//         musicGenres: event.musicGenres,
//         performanceStart: event.performanceStart,
//         performanceEnd: event.performanceEnd
//       }]).then(({ data, error }) => {
//         if (error) {
//           console.error('Error inserting event:', error);
//         } else {
//           console.log('Event inserted successfully:', data);
//         }
//       });
//     }

//     setEvent({ eventId: null, name: '', description: '', location: '', realLifeLocation: '', performerIds: [myPerformerId], musicGenres: [], performanceStart: new Date(), performanceEnd: new Date(), summary:'', logo_url: '', ext_url: ''  });
//     setValidationError(null);
//   };

//   const handleDelete = () => {
//     if (selectedEvent && selectedEvent.eventId) {
//       supabase.from('events').delete().eq('eventId', selectedEvent.eventId).then(({ data, error }) => {
//         if (error) {
//           console.error('Error deleting event:', error);
//         } else {
//           console.log('Event deleted successfully:', data);
//           onDeleteEvent(selectedEvent.eventId ? selectedEvent.eventId : 0); // pass 0 if eventId is null. which will never happen because theres no path that leads to deleting a event with null id 
//           setEvent({ eventId: null, name: '', description: '', location: '', realLifeLocation: '', performerIds: [myPerformerId], musicGenres: [], performanceStart: new Date(), performanceEnd: new Date(), summary:'', logo_url: '', ext_url: ''  });
//           setSelectedGenres(null);
//         }
//       });
//     }
//   };

//   const formatDateToLocalInput = (date: Date): string => {
//     try {
//       const offset = date.getTimezoneOffset();
//       const localDate = new Date(date.getTime() - offset * 60 * 1000);
//       return localDate.toISOString().slice(0, 16);
//     } catch (error) {
//       console.error('Error formatting date:', error);
//       return '';
//     }
//   };

//   const handleDateChange = (dateString: string, field: 'performanceStart' | 'performanceEnd') => {
//     const newDate = new Date(dateString);
//     setEvent(prevEvent => ({
//       ...prevEvent,
//       [field]: newDate
//     }));
//   };

//   return (
//     <form onSubmit={handleSubmit} className="card space-y-4 p-4 border rounded shadow-md">
//       <div>
//         <label className="block text-sm font-medium text-gray-700">Performer(s)</label>
//         <Select
//           isMulti
//           value={selectedPerformers}
//           onChange={handleChangePerformers}
//           options={performerOptions}
//           className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
//           required
//         />
//       </div>

//       <div>
//         <label className="block text-sm font-medium text-gray-700">Event Name</label>
//         <input
//           type="text"
//           value={event.name}
//           onChange={(e) => setEvent({ ...event, name: e.target.value })}
//           className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
//           required
//         />
//       </div>
//       <div>
//         <label className="block text-sm font-medium text-gray-700">Event Description</label>
//         <textarea
//           value={event.description}
//           onChange={(e) => setEvent({ ...event, description: e.target.value })}
//           className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
//           required
//         />
//       </div>
//       <div>
//         <label className="block text-sm font-medium text-gray-700">Location display name</label>
//         <input
//           type="text"
//           value={event.location}
//           onChange={(e) => setEvent({ ...event, location: e.target.value })}
//           className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
//           required
//         />
//       </div>
//       <div>
//         <label className="block text-sm font-medium text-gray-700">Google map location name or address</label>
//         <input
//           type="text"
//           value={event.realLifeLocation}
//           onChange={(e) => setEvent({ ...event, realLifeLocation: e.target.value })}
//           className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
//           required
//         />
//       </div>
//       <div>
//         <label className="block text-sm font-medium text-gray-700">Music Genres</label>
//         <Select
//           isMulti
//           value={selectedGenres}
//           onChange={handleChangeGenre}
//           options={genreOptions}
//           className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
//           required
//         />
//       </div>

//       <div>
//         <label className="block text-sm font-medium text-gray-700">
//           Performance Start Time
//         </label>
//         <input
//           type="datetime-local"
//           step="900"
//           value={event.performanceStart ? formatDateToLocalInput(event.performanceStart) : ''}
//           onChange={(e) => handleDateChange(e.target.value, 'performanceStart')}
//           className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
//           required
//         />
//       </div>
//       <div>
//         <label className="block text-sm font-medium text-gray-700">
//           Performance End Time
//         </label>
//         <input
//           type="datetime-local"
//           step="900"
//           value={event.performanceEnd ? formatDateToLocalInput(event.performanceEnd) : ''}
//           onChange={(e) => handleDateChange(e.target.value, 'performanceEnd')}
//           className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
//           required
//         />
//       </div>

//       {validationError && (
//         <div className="text-red-500 text-sm">
//           {validationError}
//         </div>
//       )}

//       <div className="flex justify-center">
//         <button
//           type="submit"
//           className="w-96 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
//         >
//           {selectedEvent ? 'Save Changes' : 'Add Event'}
//         </button>
//         {selectedEvent && (
//           <button
//             type="button"
//             onClick={handleDelete}
//             className="ml-4 w-96 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
//           >
//             Delete Event
//           </button>
//         )}
//       </div>
//     </form>
//   );
// };

// export default EventForm;
