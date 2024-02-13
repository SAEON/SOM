import React, { useState, useEffect } from 'react';
import { useMap } from 'react-leaflet';

const MousePosition = () => {
    const [position, setPosition] = useState({ lat: 'N/A', lng: 'N/A' });
    const map = useMap();

    useEffect(() => {
        const onMouseMove = (e) => {
            setPosition({
                lat: e.latlng.lat.toFixed(5),
                lng: e.latlng.lng.toFixed(5)
            });
        };

        map.on('mousemove', onMouseMove);

        return () => {
            map.off('mousemove', onMouseMove);
        };
    }, [map]);

    return (
        <div style={{
            position: 'absolute',
            bottom: '0px',
            left: 0,
            padding: '1px 5px', // Reduced padding
            backgroundColor: 'rgba(255,255,255,0.8)',
            zIndex: 1000,
            fontSize: '10px', // Smaller font size
            borderRadius: '5px' // Optional: adds rounded corners for better visual appearance
        }}>
            {`Lat: ${position.lat}, Lng: ${position.lng}`}
        </div>
    );
};
export default MousePosition;
