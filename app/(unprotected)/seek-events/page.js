'use client'

import { useMemo, useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '../../supabaseClient'
import { Calendar, Clock, MapPin, Filter } from 'lucide-react'
import { format } from "date-fns"
import { mergeBackToBackPerformances } from '../../utils';

const DynamicMap = dynamic(() => import('../../components/ui/Map'), {
  ssr: false,
})

const containerStyle = {
  width: '100%',
  height: '100%',
}

export default function PerformancesPage() {
  const [userLocation, setUserLocation] = useState(null)
  const [performances, setPerformances] = useState([])
  const [buskers, setBuskers] = useState({})
  const [locations, setLocations] = useState([])
  const [selectedPerformanceLocation, setSelectedPerformanceLocation] = useState(null)
  const [selectedTime, setSelectedTime] = useState('All')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [filterType, setFilterType] = useState('time')
  const [selectedLocation, setSelectedLocation] = useState(null)

  const center = useMemo(() => (userLocation ? userLocation : { lat: 1.3521, lng: 103.8198 }), [userLocation])
  const times = ['All', '6am-12noon', '12noon-6pm', '6pm-9pm', '9pm-12midnight']

  useEffect(() => {
    const getUserLocation = () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setUserLocation({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            })
          },
          (error) => {
            console.error('Error getting user location:', error)
          }
        )
      } else {
        console.error('Geolocation is not supported by this browser.')
      }
    }

    const fetchBuskers = async () => {
      const { data, error } = await supabase.from('buskers').select('*')
      if (error) {
        console.error('Error fetching buskers:', error)
      }
      else {
        let buskersDict = {}
        data.forEach((busker) => {
          buskersDict[busker.busker_id] = busker
        })
        setBuskers(buskersDict)
      }
    }

    const fetchPerformances = async () => {
      const { data, error } = await supabase.from('performances').select('*')
      if (error) {
        console.error('Error fetching performances:', error)
      } else {
        const { data: locationsData, error: locationsError } = await supabase.from('locations').select('*')
        if (locationsError) {
          console.error('Error fetching locations:', locationsError)
        } else {
          data.forEach((performance) => {
            performance.location_name = locationsData.find(location => location.location_id === performance.location_id)?.name
            performance.location_address = locationsData.find(location => location.location_id === performance.location_id)?.address
            performance.lat = locationsData.find(location => location.location_id === performance.location_id)?.lat
            performance.lng = locationsData.find(location => location.location_id === performance.location_id)?.lng
          })
          console.log('Performances:', data)
          setPerformances(mergeBackToBackPerformances(data))
          setLocations(locationsData)
        }
      }
    }


    fetchPerformances()
    fetchBuskers()
    getUserLocation()
  }, [])

  const filterPerformances = (performance) => {
    const start_datetime_date = new Date(performance.start_datetime);
    start_datetime_date.setHours(start_datetime_date.getHours() - 8);
    const isTimeMatch = selectedTime === 'All' || (
      (selectedTime === '6am-12noon' && start_datetime_date.getHours() >= 6 && start_datetime_date.getHours() < 12) ||
      (selectedTime === '12noon-6pm' && start_datetime_date.getHours() >= 12 && start_datetime_date.getHours() < 18) ||
      (selectedTime === '6pm-9pm' && start_datetime_date.getHours() >= 18 && start_datetime_date.getHours() < 21) ||
      (selectedTime === '9pm-12midnight' && start_datetime_date.getHours() >= 21)
    )
    const isDateMatch = selectedDate === '' || (start_datetime_date instanceof Date && start_datetime_date.toDateString() === selectedDate.toDateString())

    return isTimeMatch && isDateMatch
  }

  const filteredPerformances = performances.filter(filterPerformances)

  const handleTimeChange = (e) => {
    setSelectedTime(e.target.value)
  }

  const handleDateChange = (e) => {
    setSelectedDate(new Date(e.target.value))
  }

  const handleLocationChange = (e) => {
    window.location.href = `/location/${e.target.value}`;
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="grow relative rounded-lg overflow-hidden shadow-lg">
        {filterType === 'time' && (
          <DynamicMap
            center={center}
            markers={filteredPerformances}
            containerStyle={containerStyle}
            onMarkerClick={setSelectedPerformanceLocation}
          />
        )}
        {filterType === 'location' && (
          <DynamicMap
            center={center}
            markers={locations}
            containerStyle={containerStyle}
            onMarkerClick={setSelectedLocation}
          />
        )}


        {/* Filter Box */}
        <div className="absolute m-4 top-8 w-5/6 md:w-1/3 md:right-4 bg-white rounded-lg shadow-md overflow-hidden">
          <div className="tabs tabs-boxed bg-gray-100">
            <a
              className={`tab flex-1 ${filterType === 'time' ? 'bg-gray-600 text-white' : 'text-gray-600'}`}
              onClick={() => setFilterType('time')}
            >
              <Clock className="w-4 h-4 mr-2" />
              Time
            </a>
            <a
              className={`tab flex-1 ${filterType === 'location' ? 'bg-gray-600 text-white' : 'text-gray-600'}`}
              onClick={() => setFilterType('location')}
            >
              <MapPin className="w-4 h-4 mr-2" />
              Location
            </a>
          </div>
          <div className="p-4 pt-0">
            {filterType === 'time' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Date</span>
                  </label>
                  <input
                    type="date"
                    value={format(selectedDate, "yyyy-MM-dd")}
                    onChange={handleDateChange}
                    className="input input-bordered w-full text-sm  text-black bg-white"
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Time Range</span>
                  </label>
                  <select
                    value={selectedTime}
                    onChange={handleTimeChange}
                    className="select select-bordered w-full text-sm text-black bg-white"
                  >
                    {times.map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {filterType === 'location' && (
              <div className="form-control">
                <label className="label">
                  <span className="label-text">Location</span>
                </label>
                <select
                  value={selectedLocation}
                  onChange={handleLocationChange}
                  className="select select-bordered w-full text-sm text-black bg-white"
                >
                  <option value="All Locations">All Locations</option>
                  {locations.map((location) => (
                    <option key={location.location_id} value={location.location_id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Popup to show performance details */}
      {filterType === 'time' && selectedPerformanceLocation && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setSelectedPerformanceLocation(null)}>
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-2">
              <a href={`/location/${selectedPerformanceLocation.location_id}`} className="text-blue-600 hover:underline">
                {selectedPerformanceLocation.location_name}
              </a>
            </h2>

            <img
              src={`https://mlbwzkspmgxhudfnsfeb.supabase.co/storage/v1/object/public/location_images/${selectedPerformanceLocation?.location_id}.jpg`}
              alt={selectedPerformanceLocation.location_id}
              className="w-5/6 object-cover object-center rounded-lg mb-4"
            />
            /* get number of performances happening and who are performing at this time range */
            <p className="text-gray-700 mb-2 text-sm">
              {filteredPerformances.filter(performance => performance.location_id === selectedPerformanceLocation.location_id).length} performances
            </p>
            <div className="grid grid-cols-2 gap-4">
              {filteredPerformances
                .filter(performance => performance.location_id === selectedPerformanceLocation.location_id)
                .map(performance => (
                  <div key={performance.performance_id} className="p-2 bg-gray-100 rounded-lg">
                    <h3 className="text-lg font-bold text-black">
                      <a href={`/seek-buskers/${performance.busker_id}`} className="text-blue-600 hover:underline">
                        {buskers[performance.busker_id]?.name}
                      </a>
                    </h3>
                    <p className="text-sm text-gray-700">{String(performance.start_datetime).substring(11, 16)} - {String(performance.end_datetime).substring(11, 16)}</p>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
      {/* popup to show the location details */}
      {filterType === 'location' && selectedLocation && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setSelectedLocation(null)}>
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-2">
              <a href={`/location/${selectedLocation.location_id}`} className="text-blue-600 hover:underline">
                {selectedLocation.name}
              </a>
            </h2>
            <img src={`https://mlbwzkspmgxhudfnsfeb.supabase.co/storage/v1/object/public/location_images/${selectedLocation.location_id}.jpg`} alt={selectedLocation.name} className="w-full object-cover object-center rounded-lg mb-4" />
            <p className="text-gray-700 mb-2 text-sm">
              {selectedLocation.address}
            </p>
            <p className="text-gray-600 text-sm">{selectedLocation.description}</p>
          </div>
        </div>
      )}
    </div>
  )
}