'use client';
import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';

const BuskerDetailPage = ({ params }) => {
    const [performances, setPerformances] = useState([]);
    const [location, setLocation] = useState(null);

    // Get current epoch time to avoid image caching issues
    const currentEpochTime = Math.floor(new Date().getTime() / 1000);

    useEffect(() => {
        const fetchPerformances = async () => {
            const { data: performanceData, error: performanceError } = await supabase.from('performances').select('*').eq('location_id', params.id);
            if (performanceError) {
                console.error('Error fetching performances:', performanceError);
            } else {
                const { data: buskersData, error: buskersError } = await supabase.from('buskers').select('*');
                if (buskersError) {
                    console.error('Error fetching buskers:', buskersError);
                } else {
                    // Set busker details in performance object
                    performanceData.forEach((performance) => {
                        const busker = buskersData.find(busker => busker.busker_id === performance.busker_id);
                        performance.busker_name = busker?.name;
                        performance.busker_act = busker?.act;
                        performance.busker_art_form = busker?.art_form;
                    });
                    setPerformances(performanceData);
                }
            }

            const { data: locationsData, error: locationsError } = await supabase.from('locations').select('*').eq('location_id', params.id);
            if (locationsError) {
                console.error('Error fetching locations:', locationsError);
            } else {
                setLocation(locationsData[0]);
            }
        };

        fetchPerformances();
    }, [params.id]);

    // Get today's date and tomorrow's date
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Function to format the date label
    const formatDateLabel = (dateString) => {
        const date = new Date(dateString);

        // Check if the date is today, tomorrow, or a different day of the week
        if (date.toDateString() === today.toDateString()) {
            return 'Today';
        } else if (date.toDateString() === tomorrow.toDateString()) {
            return 'Tmr';
        } else {
            // Return the day of the week (e.g., 'Monday')
            return date.toLocaleDateString('en-US', { weekday: 'short' });
        }
    };

    // Group performances by date
    const groupedPerformances = performances
        .filter(performance => new Date(performance.start_datetime) > new Date())
        .reduce((acc, performance) => {
            const date = new Date(performance.start_datetime).toISOString().substring(0, 10);
            if (!acc[date]) acc[date] = [];
            acc[date].push(performance);
            return acc;
        }, {});

    return (
        <div className="container mx-auto p-6">
            <div className="card rounded-lg shadow-lg p-6 mb-6">
                <div className="grid grid-cols-1">
                    <h1 className="text-bold text-3xl">{location?.name}</h1>
                    <p className="text-gray-600">{location?.address}</p>
                    <img src={`https://mlbwzkspmgxhudfnsfeb.supabase.co/storage/v1/object/public/location_images/${location?.location_id}.jpg?${currentEpochTime}`} alt={location ? location.name : ''} className="rounded-lg shadow-lg md:w-1/2 my-4" />
                    <p className="text-gray-600">{location?.description}</p>
                </div>
            </div>

            <div className="flex flex-col mb-6 md:space-x-6 space-y-6">
                <div className="card rounded-lg shadow-lg p-6">
                    <h2 className="text-2xl font-semibold mb-4">Upcoming Events</h2>
                    {Object.keys(groupedPerformances).length > 0 ? (
                        <div>
                            {Object.keys(groupedPerformances).sort().map(date => (
                                <details key={date} className="mb-4">
                                    <summary className="cursor-pointer text-xl mb-2">
                                        {date} ({formatDateLabel(date)}) [{groupedPerformances[date].length}]
                                    </summary>
                                    <ul className="pl-4">
                                        {groupedPerformances[date].map(performance => (
                                            <li key={performance.event_id} className="mb-4">
                                                <div className="p-4 bg-gray-100 rounded-lg shadow">
                                                    <p className="text-gray-700">Time: {String(performance.start_datetime).substring(11, 16)} - {String(performance.end_datetime).substring(11, 16)}</p>
                                                    <p className="text-gray-700">Busker: <a href={`/seek-buskers/${performance.busker_id}`} target="_blank" className="text-blue-500 hover:underline">{performance.busker_name}</a></p>
                                                    <p className="text-gray-700">Act: {performance.busker_act}</p>
                                                    <p className="text-gray-700">Art Form: {performance.busker_art_form}</p>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            ))}
                        </div>
                    ) : (
                        <p className="text-gray-600">No upcoming performances found for this location.</p>
                    )}
                </div>
            </div>
        </div>
    );
}

BuskerDetailPage.displayName = 'BuskerDetailPage';
export default BuskerDetailPage;
