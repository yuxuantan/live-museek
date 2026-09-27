'use client';

import { useEffect, useMemo, useState } from 'react';
import { GoogleMap, Marker, useLoadScript } from '@react-google-maps/api';
import { hasCoordinates } from '../../locationCoordinates';

function LoadedMap({ apiKey, center, markers = [], containerStyle, onMarkerClick, visible }) {
  const { isLoaded, loadError } = useLoadScript({ googleMapsApiKey: apiKey });
  const [map, setMap] = useState(null);
  const [activeMarker, setActiveMarker] = useState(null);
  const uniqueMarkers = useMemo(() => {
    const seen = new Set();
    return markers.filter((marker) => {
      const id = marker.location_id ?? marker.event_id;
      if (!hasCoordinates(marker) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [markers]);

  useEffect(() => {
    if (visible && map) window.google.maps.event.trigger(map, 'resize');
  }, [visible, map]);

  if (loadError) return <p role="status" className="p-4 text-slate-100">The map could not load. You can still use the list and directions links.</p>;
  if (!isLoaded) return <p role="status" className="p-4 text-slate-100">Loading map…</p>;

  return (
    <GoogleMap mapContainerStyle={containerStyle} center={center} zoom={11} onLoad={setMap}>
      {uniqueMarkers.map((marker) => {
        const id = marker.location_id ?? marker.event_id;
        return <Marker key={id} position={{ lat: Number(marker.lat), lng: Number(marker.lng) }}
          title={marker.location_name || marker.name}
          icon={{ path: window.google.maps.SymbolPath.CIRCLE, scale: 9, fillOpacity: 1,
            fillColor: activeMarker === id ? '#16a34a' : '#2563eb', strokeColor: '#ffffff', strokeWeight: 2 }}
          onClick={() => { setActiveMarker(id); onMarkerClick?.(marker) }} />;
      })}
    </GoogleMap>
  );
}

export default function Map(props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return <p role="status" className="p-4 text-slate-100">The map is unavailable. You can still use the list and directions links.</p>;
  return <LoadedMap {...props} apiKey={apiKey} />;
}
