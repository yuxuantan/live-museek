'use client'; // Ensures this component only renders on the client

import React, { useState, useEffect } from 'react';
import { GoogleMap, Marker, useLoadScript } from '@react-google-maps/api';
import { Event } from '../../types';

interface MapProps {
  center: { lat: number; lng: number };
  events: Event[];
  containerStyle: { width: string; height: string };
  onMarkerClick: (event: Event) => void;
}
const Map: React.FC<MapProps> = ({ center, events, containerStyle, onMarkerClick }) => {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '', // Replace with your API key
  });

  const [markers, setMarkers] = useState<any[]>([]);
  const [activeMarker, setActiveMarker] = useState<number | null>(null);

  useEffect(() => {
    if (isLoaded && window.google) {
      const geocoder = new window.google.maps.Geocoder();

      const geocodePromises = events.map(event =>
        new Promise((resolve, reject) => {
          geocoder.geocode({ address: event.realLifeLocation }, (results, status) => {
            if (status === 'OK' && results != null && results.length > 0) {
              console.log(`Geocoding successful for: ${event.realLifeLocation}`);
              resolve({
                ...event,
                lat: results[0].geometry.location.lat(),
                lng: results[0].geometry.location.lng(),
              });
            } else {
              console.error(`Geocode was not successful for the following reason: ${status}`);
              reject(`Geocode was not successful for the following reason: ${status}`);
            }
          });
        })
      );

      Promise.all(geocodePromises)
        .then((results) => {
          console.log('Geocoding results:', results);
          setMarkers(results);
        })
        .catch(error => console.error('Geocoding error: ', error));
    }
  }, [isLoaded, events]);

  if (loadError) return <div>Error loading maps</div>;
  if (!isLoaded) return <div>Loading Maps</div>;

  return (

    <div className="relative w-full h-96 rounded-lg overflow-hidden shadow-lg">
      <GoogleMap mapContainerStyle={containerStyle} center={center} zoom={12}>
        {markers.map(marker => (
          <Marker
            key={marker.eventId}
            position={{ lat: marker.lat, lng: marker.lng }}
            icon={{
              url: marker.eventId === activeMarker ? 'http://maps.google.com/mapfiles/ms/icons/green-dot.png' : 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
            }}
            onClick={() => {
              if (marker.eventId === activeMarker) {
                setActiveMarker(null); // Make it inactive
              } else {
                setActiveMarker(marker.eventId);
              }
              onMarkerClick(marker);
            }}
          />

        ))}
      </GoogleMap>
    </div>
  );
};

export default Map;
