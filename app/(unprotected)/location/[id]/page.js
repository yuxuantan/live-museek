'use client';
import React, { useState, useEffect } from 'react';
import { supabase } from '../../../supabaseClient';

const BuskerDetailPage = ({ params }) => {
    const [performances, setPerformances] = useState([]);
    const [location, setLocation] = useState(null);

    // get current epoch time to ensure caching doesn't make the image stale
    const currentEpochTime = Math.floor(new Date().getTime() / 1000);
    useEffect(() => {
        const fetchPerformances = async () => {
            const { data: performanceData, error: performanceError } = await supabase.from('performances').select('*').eq('location_id', params.id);
            if (performanceError) {
                console.error('Error fetching performances:', error);
            } else {
                const {data: buskersData, error: buskersError} = await supabase.from('buskers').select('*');
                if (buskersError) {
                    console.error('Error fetching buskers:', buskersError);
                } else {
                    // set busker details in performance object
                    performanceData.forEach((performance) => {
                        performance.busker_name = buskersData.find(busker => busker.busker_id === performance.busker_id)?.name;
                        performance.busker_act = buskersData.find(busker => busker.busker_id === performance.busker_id)?.act;
                        performance.busker_art_form = buskersData.find(busker => busker.busker_id === performance.busker_id)?.art_form; 
                    });
                }
                console.log("fetchPerformances", performanceData);
                setPerformances(performanceData);
            }
            const { data: locationsData, error: locationsError } = await supabase.from('locations').select('*').eq('location_id', params.id);
            if (locationsError) {
                console.error('Error fetching locations:', locationsError);
            }
            else {
                console.log("fetchLocations", locationsData);
                setLocation(locationsData[0]);
            }
        };


        const fetchBusker = async () => {
            
        };

        fetchPerformances();
        fetchBusker();
    }, [params.id]);

    return (
        <div className="container mx-auto p-6">
            <div className="card rounded-lg shadow-lg p-6 mb-6">
                <div className="grid grid-cols-1 gap-8">
                    <h1 className="text-bold text-3xl">{location?.name}</h1>
                    {/* image */}
                    <img src={`https://mlbwzkspmgxhudfnsfeb.supabase.co/storage/v1/object/public/location_images/${location?.location_id}.jpg` + `?${currentEpochTime}`} alt={location ? location.name : ''} className="rounded-lg shadow-lg md:w-1/2" />
                    {/* area */}
                    <p className="text-gray-600">{location?.area}</p>
                    {/* description */}
                    <p className="text-gray-600">{location?.description}</p>
                    {/* address */}
                    <p className="text-gray-600">{location?.address}</p>
                    
                </div>
            </div>

            <div className="flex flex-col mb-6 md:space-x-6 space-y-6">
                <div className="card rounded-lg shadow-lg p-6">
                    <h2 className="text-2xl font-semibold mb-4">Upcoming Events</h2>
                    {performances.filter(performance => new Date(performance.start_datetime) > new Date()).length > 0 ? (
                        <ul>
                            {performances.filter(performance => new Date(performance.start_datetime) > new Date())
                                .sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime))
                                .map(performance => (
                                    <li key={performance.event_id} className="mb-4">
                                        <div className="p-4 bg-gray-100 rounded-lg shadow">
                                            <p className="text-gray-700">Date: {String(performance.start_datetime).substring(0, 10)}</p>
                                            <p className="text-gray-700">Time: {String(performance.start_datetime).substring(11, 16)} - {String(performance.end_datetime).substring(11, 16)}</p>
                                            <p className="text-gray-700">Busker: <a href={`/seek-buskers/${performance.busker_id}`} target="_blank" className="text-blue-500 hover:underline">{performance.busker_name}</a></p>
                                            <p className="text-gray-700">Act: {performance.busker_act}</p>
                                            <p className="text-gray-700">Art Form: {performance.busker_art_form}</p>
                                        </div>
                                    </li>
                                ))}
                        </ul>
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
