'use client'; // Ensures this component only renders on the client

import { useMemo, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '../../supabaseClient';
import {faAngleLeft, faAngleRight} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

const DynamicMap = dynamic(() => import('../../components/ui/Map'), {
  ssr: false,
});
const containerStyle = {
  width: '100%',
  height: '100%',
};

const PerformancesPage = () => {
  const [userLocation, setUserLocation] = useState(null);
  const [performances, setPerformances] = useState([]);
  const [buskers, setBuskers] = useState({});
  const [selectedPerformance, setSelectedPerformance] = useState(null);
  const [selectedTime, setSelectedTime] = useState('Time: All');
  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('sv-SE'));

  const center = useMemo(() => (userLocation ? userLocation : { lat: 1.3521, lng: 103.8198 }), [userLocation]);
  const times = ['Time: All', '6am-12noon', '12noon-6pm', '6pm-9pm', '9pm-12midnight'];

  useEffect(() => {
    const getUserLocation = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setUserLocation({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
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

    const fetchBuskers = async () => {
      const { data, error } = await supabase.from('buskers').select('*');
      if (error) {
        console.error('Error fetching buskers:', error);
      }
      else {
        // set busker_id as key for buskers object
        let buskersDict = {};
        data.forEach((busker) => {
          buskersDict[busker.busker_id] = busker;
        });
        setBuskers(buskersDict);
      }
    };

    const fetchPerformances = async () => {
      const { data, error } = await supabase.from('performances').select('*');
      if (error) {
        console.error('Error fetching performances:', error);
      } else {
        data.forEach((performance) => {
          performance.start_datetime = new Date(performance.start_datetime);
          performance.end_datetime = new Date(performance.end_datetime);
        });
        setPerformances(data);
      }
    };

    fetchPerformances();
    fetchBuskers();
    getUserLocation();
  }, []);

  const filterPerformances = (performance) => {
    const isTimeMatch = selectedTime === 'Time: All' || (
      (selectedTime === '6am-12noon' && performance.start_datetime?.getHours() >= 6 && performance.start_datetime?.getHours() < 12) ||
      (selectedTime === '12noon-6pm' && performance.start_datetime?.getHours() >= 12 && performance.start_datetime?.getHours() < 18) ||
      (selectedTime === '6pm-9pm' && performance.start_datetime?.getHours() >= 18 && performance.start_datetime?.getHours() < 21) ||
      (selectedTime === '9pm-12midnight' && performance.start_datetime?.getHours() >= 21)
    );
    const isDateMatch = selectedDate === '' || (performance.start_datetime instanceof Date && performance.start_datetime.toISOString().substring(0, 10) === selectedDate);
    return isTimeMatch && isDateMatch;
  };

  const filteredPerformances = performances.filter(filterPerformances);

  const handleTimeChange = (event) => {
    setSelectedTime(event.target.value);
  };

  const handleDateChange = (event) => {
    setSelectedDate(new Date(event.target.value).toISOString().substring(0, 10));
  };

  const handleDateChangeByOffset = (offset) => {
    const currentDate = new Date(selectedDate);
    currentDate.setDate(currentDate.getDate() + offset);
    setSelectedDate(currentDate.toISOString().substring(0, 10));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="relative w-full h-full rounded-lg overflow-hidden shadow-lg">
        <DynamicMap
          center={center}
          performances={filteredPerformances}
          containerStyle={containerStyle}
          onMarkerClick={setSelectedPerformance}
        />

        {/* Date and Time Filter Boxes */}
        <div className="absolute bottom-8 right-16 sm:w-40 w-42 p-2 bg-gray-600 rounded-lg shadow-md space-y-2 sm:space-y-4">
          <div className="flex items-center justify-between space-x-2">
            <button
              onClick={() => handleDateChangeByOffset(-1)}
              className="p-1 px-2 rounded bg-white focus:outline-none"
            >
              <FontAwesomeIcon icon={faAngleLeft} size="lg" color="black" />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={handleDateChange}
              className="text-xs rounded bg-white shadow-sm text-black"
            />
            <button
              onClick={() => handleDateChangeByOffset(1)}
              className="p-1 px-2 rounded bg-white focus:outline-none"
            >
              <FontAwesomeIcon icon={faAngleRight} size="lg" color="black" />
            </button>
          </div>
          <div className="flex items-center">
            <select value={selectedTime} onChange={handleTimeChange} className="text-xs px-1 py-1 rounded bg-color-white shadow-sm w-full text-black">
              {times.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Popup to show performance details */}
      {selectedPerformance && (
        <div className="fixed top-0 left-0 w-full h-full flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-4 rounded-lg shadow-lg w-4/5 md:w-1/3 md:align-right">
            <h1 className="text-xlg font-semibold text-gray-500">{buskers[selectedPerformance.busker_id]['name']}</h1>
            <h2 className="text-sm font-semibold text-gray-500">{buskers[selectedPerformance.busker_id]['act']}</h2>
            <img src={`https://eservices.nac.gov.sg${buskers[selectedPerformance.busker_id]['image_url']}`} alt={buskers[selectedPerformance.busker_id]['name']} className="w-40 h-40 rounded-lg mt-2" />
            <p className="text-sm text-gray-500">
              {selectedPerformance.start_datetime.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              <br />
              {selectedPerformance.start_datetime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {selectedPerformance.end_datetime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
            <p className="text-sm text-gray-500">{selectedPerformance.description}</p>
            <button
              onClick={() => setSelectedPerformance(null)}
              className="mt-4 px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PerformancesPage;
