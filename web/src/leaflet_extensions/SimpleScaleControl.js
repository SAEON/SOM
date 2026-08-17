import React, { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import Map from "../pages/Map";
import L from 'leaflet';

const SimpleScaleControl = ({ options }) => {
    const map = useMap();

    useEffect(() => {
        // Create the scale control with provided options
        const scaleControl = L.control.scale(options);

        // Add the scale control to the map
        scaleControl.addTo(map);

        // Clean up on component unmount
        return () => {
            scaleControl.remove();
        };
    }, [map, options]); // Reapply effect if options change

    return null; // This component does not render anything itself
};
export default SimpleScaleControl;
