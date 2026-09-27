'use client'

import { useMemo, useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '../../supabaseClient'
import { Clock, MapPin } from 'lucide-react'
import { format } from "date-fns"
import { mergeBackToBackPerformances } from '../../utils';
import { hasCoordinates, directionsUrl } from '../../locationCoordinates';

const DynamicMap = dynamic(() => import('../../components/ui/Map'), {
  ssr: false,
})

const containerStyle = {
  width: '100%',
  height: '100%',
}

export default function PerformancesPage() {
  const [userLocation, setUserLocation] = useState(null)
  const [showMap, setShowMap] = useState(false)
  const [mapOpened, setMapOpened] = useState(false)
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
  const storagePublicBaseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public`;

  useEffect(() => {
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
      const { data, error } = await supabase
        .from('performances')
        .select('*')
        .gte('end_datetime', new Date().toISOString())
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
          setPerformances(mergeBackToBackPerformances(data))
          setLocations(locationsData)
        }
      }
    }


    fetchPerformances()
    fetchBuskers()
  }, [])

  useEffect(() => {
    if (showMap && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
        () => {}, { timeout: 10000, maximumAge: 300000 }
      )
    }
  }, [showMap])

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
    if (e.target.value) setSelectedDate(new Date(`${e.target.value}T00:00:00`))
  }

  const handleLocationChange = (e) => {
    if (e.target.value !== 'All Locations') window.location.href = `/seek-locations/${e.target.value}`;
  }

  return (
    <div className="flex flex-col gap-4 p-4 text-gray-900">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-100">Find performances</h1>
        <button type="button" className="btn border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700" aria-expanded={showMap} aria-controls="events-map"
          onClick={() => { setMapOpened(true); setShowMap((visible) => !visible) }}>{showMap ? 'Hide map' : 'Show map'}</button>
      </div>
      {mapOpened && (
        <div id="events-map" hidden={!showMap} className="relative isolate h-[50vh] min-h-80 rounded-lg overflow-hidden shadow-lg">
          <DynamicMap center={center} visible={showMap}
            markers={(filterType === 'time' ? filteredPerformances : locations).filter(hasCoordinates)}
            containerStyle={containerStyle}
            onMarkerClick={filterType === 'time' ? setSelectedPerformanceLocation : setSelectedLocation} />
        </div>
      )}
      {showMap && (filterType === 'time' ? filteredPerformances : locations).some((location) => !hasCoordinates(location)) && (
        <p className="text-sm text-slate-300">Some locations do not yet have a map pin. You can still view them below and get directions.</p>
      )}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="tabs tabs-boxed bg-gray-100">
            <button
              type="button"
              className={`tab flex-1 ${filterType === 'time' ? 'bg-gray-600 text-white' : 'text-gray-600'}`}
              onClick={() => setFilterType('time')}
            >
              <Clock className="w-4 h-4 mr-2" />
              Time
            </button>
            <button
              type="button"
              className={`tab flex-1 ${filterType === 'location' ? 'bg-gray-600 text-white' : 'text-gray-600'}`}
              onClick={() => setFilterType('location')}
            >
              <MapPin className="w-4 h-4 mr-2" />
              Location
            </button>
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
                  value={selectedLocation?.location_id ?? 'All Locations'}
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filterType === 'time' ? filteredPerformances.map((performance, index) => (
          <article key={performance.performance_id ?? `${performance.location_id}-${performance.busker_id}-${index}`}
            className="rounded-lg border bg-white p-4">
            <h2 className="font-semibold"><a className="text-blue-700 hover:underline" href={`/seek-buskers/${performance.busker_id}`}>{buskers[performance.busker_id]?.name || 'Musician'}</a></h2>
            <a className="text-blue-700 hover:underline" href={`/seek-locations/${performance.location_id}`}>{performance.location_name}</a>
            <p className="text-sm text-gray-600">{String(performance.start_datetime).substring(11, 16)} – {String(performance.end_datetime).substring(11, 16)}</p>
            <a className="inline-block mt-2 text-blue-700 underline" href={directionsUrl(performance)} target="_blank" rel="noopener noreferrer">Get directions</a>
          </article>
        )) : locations.map((location) => (
          <article key={location.location_id} className="rounded-lg border bg-white p-4">
            <h2 className="font-semibold"><a className="text-blue-700 hover:underline" href={`/seek-locations/${location.location_id}`}>{location.name}</a></h2>
            <p className="text-sm text-gray-600">{location.address}</p>
            <a className="inline-block mt-2 text-blue-700 underline" href={directionsUrl(location)} target="_blank" rel="noopener noreferrer">Get directions</a>
          </article>
        ))}
      </div>
      {filterType === 'time' && !filteredPerformances.length && <p className="text-slate-300">No performances found for this date and time.</p>}

      {/* Popup to show performance details */}
      {filterType === 'time' && selectedPerformanceLocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setSelectedPerformanceLocation(null)}>
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-2">
              <a href={`/seek-locations/${selectedPerformanceLocation.location_id}`} className="text-blue-600 hover:underline">
                {selectedPerformanceLocation.location_name}
              </a>
            </h2>

            <img
              src={`${storagePublicBaseUrl}/location_images/${selectedPerformanceLocation?.location_id}.jpg`}
              alt={selectedPerformanceLocation.location_id}
              className="w-5/6 object-cover object-center rounded-lg mb-4"
            />
            <a className="inline-block mb-3 text-blue-700 underline" href={directionsUrl(selectedPerformanceLocation)} target="_blank" rel="noopener noreferrer">Get directions</a>
            {/* get number of performances happening and who are performing at this time range */}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4" onClick={() => setSelectedLocation(null)}>
          <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-2">
              <a href={`/seek-locations/${selectedLocation.location_id}`} className="text-blue-600 hover:underline">
                {selectedLocation.name}
              </a>
            </h2>
            <img src={`${storagePublicBaseUrl}/location_images/${selectedLocation.location_id}.jpg`} alt={selectedLocation.name} className="w-full object-cover object-center rounded-lg mb-4" />
            <p className="text-gray-700 mb-2 text-sm">
              {selectedLocation.address}
            </p>
            <p className="text-gray-600 text-sm">{selectedLocation.description}</p>
            <a className="inline-block mt-3 text-blue-700 underline" href={directionsUrl(selectedLocation)} target="_blank" rel="noopener noreferrer">Get directions</a>
          </div>
        </div>
      )}
    </div>
  )
}
