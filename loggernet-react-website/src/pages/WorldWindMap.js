/* global WorldWind */
// import React from "react";
import React, { useEffect, useRef } from 'react';

function WorldWindMap() {
    const canvasRef = useRef(null);

    useEffect(() => {
        // Get the canvas element
        const canvas = canvasRef.current;

        // Create the World Window
        const wwd = new WorldWind.WorldWindow(canvas.id);

        // Add imagery layer
        wwd.addLayer(new WorldWind.BMNGLayer());

        // Add WorldWind features like the compass, coordinates display, etc.
        wwd.addLayer(new WorldWind.CompassLayer());
        wwd.addLayer(new WorldWind.CoordinatesDisplayLayer(wwd));
        wwd.addLayer(new WorldWind.ViewControlsLayer(wwd));

        // Redraw
        wwd.redraw();
    }, []);

    return <canvas id="worldwind-canvas" ref={canvasRef} width="800" height="600"></canvas>;
}

export default WorldWindMap;
