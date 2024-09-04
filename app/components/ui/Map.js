'use client'; // Ensures this component only renders on the client

import React, { useState, useEffect } from 'react';
import { GoogleMap, Marker, useLoadScript } from '@react-google-maps/api';

const Map = ({ center, performances, containerStyle, onMarkerClick }) => {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '', // Replace with your API key
  });

  const [markers, setMarkers] = useState([]);
  const [activeMarker, setActiveMarker] = useState(null);

  useEffect(() => {
    if (isLoaded && window.google) {
      const geocoder = new window.google.maps.Geocoder();

      const geocodePromises = performances.map(performance =>
        new Promise((resolve, reject) => {
          geocoder.geocode({ address: performance.location_address }, (results, status) => {
            if (status === 'OK' && results != null && results.length > 0) {
              console.log(`Geocoding successful for: ${performance.location_address}`);
              resolve({
                ...performance,
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
  }, [isLoaded, performances]);

  if (loadError) return <div>Error loading maps</div>;
  if (!isLoaded) return <div>Loading Maps</div>;

  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden shadow-lg">
      <GoogleMap mapContainerStyle={containerStyle} center={center} zoom={11}>
        {markers.map(marker => (
          <Marker
            key={marker.event_id}
            position={{ lat: marker.lat, lng: marker.lng }}
            icon={{
              url: marker.event_id === activeMarker ? 'http://maps.google.com/mapfiles/ms/icons/green-dot.png' : 'http://maps.google.com/mapfiles/ms/icons/red-dot.png',
              scaledSize: new window.google.maps.Size(40, 40), // Increase the size of the marker
            }}
            onClick={() => {
              if (marker.event_id === activeMarker) {
                setActiveMarker(null); // Make it inactive
              } else {
                setActiveMarker(marker.event_id);
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
