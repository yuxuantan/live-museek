'use client'; // Ensures this component only renders on the client
import React, { useState, useEffect } from 'react';
import { GoogleMap, Marker, useLoadScript } from '@react-google-maps/api';


const Map = ({ center, performances, containerStyle, onMarkerClick }) => {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '', // Replace with your API key
  });

  const [activeMarker, setActiveMarker] = useState(null);

  if (loadError) return <div>Error loading maps</div>;
  if (!isLoaded) return <div>Loading Maps</div>;

  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden shadow-lg">
      <GoogleMap mapContainerStyle={containerStyle} center={center} zoom={11}>
        {performances.map(marker => (
          <Marker
            key={marker.event_id}
            position={{ lat: marker.lat, lng: marker.lng }}
            icon={{
              url: marker.event_id === activeMarker ? 'https://maps.google.com/mapfiles/ms/icons/green-dot.png' : 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
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
