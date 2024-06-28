import React, { useEffect, useState } from 'react';
import { useNavigate } from "react-router-dom";
import { LayersControl, MapContainer, TileLayer, useMap, WMSTileLayer } from 'react-leaflet';
import MousePosition from '../leaflet_extensions/MousePosition';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/leaflet.markercluster.js';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import './Map.css';

const colorMap = {
    green: 'rgba(27, 151, 79, 0.75)',
    blue: 'rgba(0, 123, 255, 0.75)',
    dark_blue: 'rgba(0, 97, 164, 0.75)',
    yellow: 'rgba(255, 193, 7, 0.75)',
    orange: 'rgba(253, 126, 20, 0.75)',
    red: 'rgba(220, 53, 69, 0.75)',
    darkred: 'rgba(139, 0, 0, 0.75)',
    unknown: 'rgba(128, 128, 128, 0.75)',
    gray: 'rgba(128, 128, 128, 0.75)'
};

const createIcon = (statuses) => {
    if (!statuses || statuses.length === 0) {
        statuses = ['gray'];
    }

    let svgPaths = '';
    const iconSize = [28, 28];
    const centerX = iconSize[0] / 2;
    const centerY = iconSize[1] / 2;
    const radius = iconSize[0] / 2;

    if (statuses.length === 1) {
        const status = statuses[0];
        svgPaths = `<circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="${colorMap[status]}" />`;
    } else {
        let startAngle = -Math.PI / 2;

        statuses.forEach((status, index) => {
            const angle = (Math.PI * 2 * (1 / statuses.length));
            const endAngle = startAngle + angle;

            const x1 = centerX + radius * Math.cos(startAngle);
            const y1 = centerY + radius * Math.sin(startAngle);
            const x2 = centerX + radius * Math.cos(endAngle);
            const y2 = centerY + radius * Math.sin(endAngle);

            const d = `M${centerX},${centerY} L${x1},${y1} A${radius},${radius} 0 0,1 ${x2},${y2} Z`;
            svgPaths += `<path d="${d}" fill="${colorMap[status]}" />`;

            startAngle = endAngle;
        });
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${svgPaths}</svg>`;
    return L.icon({
        iconUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
        iconSize,
        iconAnchor: [iconSize[0] / 2, iconSize[1] / 2],
        popupAnchor: [0, -iconSize[1] / 2],
    });
};

const MarkerClusterComponent = ({ locations, navigate, clusterRadius }) => {
    const map = useMap();

    useEffect(() => {
        if (window.markerClusterGroup) {
            window.markerClusterGroup.clearLayers();
        }

        window.markerClusterGroup = L.markerClusterGroup({
            maxClusterRadius: clusterRadius,
            disableClusteringAtZoom: 15,
            spiderfyOnMaxZoom: true,
        });

        const uniqueLocations = locations.reduce((acc, location) => {
            if (!acc.some(loc => loc.display_server_name === location.display_server_name)) {
                acc.push(location);
            }
            return acc;
        }, []);

        uniqueLocations.forEach((location) => {
            const marker = L.marker(new L.LatLng(location.latitude, location.longitude), {
                icon: createIcon(['blue'])
            });

            marker.bindTooltip(`
                <strong>Server:</strong> ${location.display_server_name}<br/>
                <strong>Latitude:</strong> ${location.latitude}<br/>
                <strong>Longitude:</strong> ${location.longitude}
            `);

            marker.bindPopup(`
                <div style="font-family: Arial, sans-serif; padding: 10px; background: #f9f9f9; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                    <h4 style="margin-top: 0;">${location.display_server_name}</h4>
                    <strong>Latitude:</strong> ${location.latitude}<br/>
                    <strong>Longitude:</strong> ${location.longitude}<br/>
                    <button onclick="window.navigateToSite('${location.display_server_name}')" 
                            style="background-color: #007bff; color: white; padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; margin-top: 10px; text-transform: uppercase; font-size: 14px;">
                        Go to Summary
                    </button>
                </div>
            `);

            window.markerClusterGroup.addLayer(marker);
        });

        map.addLayer(window.markerClusterGroup);

        window.navigateToSite = (serverName) => navigate(`/MappingSummaryTable?server=${encodeURIComponent(serverName)}`);

        return () => {
            window.markerClusterGroup.clearLayers();
            delete window.navigateToSite;
        };
    }, [locations, map, navigate, clusterRadius]);

    return null;
};

const DateSliderControl = ({ selectedDate, setSelectedDate }) => {
    const map = useMap();

    useEffect(() => {
        const dateSlider = L.control({ position: 'topleft' });

        dateSlider.onAdd = function () {
            var div = L.DomUtil.create('div', 'info date-slider');
            div.style.border = '2px solid white';
            div.style.padding = '10px';
            div.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
            div.innerHTML = `<h4>Change Modis date</h4><input type="date" id="date-input" value="${selectedDate}">`;
            return div;
        };

        dateSlider.addTo(map);

        const dateInput = document.getElementById('date-input');
        if (dateInput) {
            dateInput.addEventListener('change', function (e) {
                setSelectedDate(e.target.value);
            });
        }

        return () => {
            if (map && map.removeControl) {
                map.removeControl(dateSlider);
            }
        };
    }, [map, selectedDate, setSelectedDate]);

    return null;
};

const Map = () => {
    const [clusterRadius, setClusterRadius] = useState(80);
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
    const [locations, setLocations] = useState([]);
    const [showMarkers] = useState(true);
    const [setCoordinates] = useState({ lat: 'N/A', lng: 'N/A' });

    const navigate = useNavigate();

    const handleIconClick = (siteName) => {
        navigate(`/ScrollableTable?site=${encodeURIComponent(siteName)}`);
    };

    useEffect(() => {
        const fetchLocations = async () => {
            try {
                const response = await fetch('/api/summary_table/locations');
                const data = await response.json();
                setLocations(data);
            } catch (error) {
                console.error('Error fetching locations:', error);
            }
        };

        fetchLocations();
    }, []);

    const handleMouseMove = (e) => {
        setCoordinates({ lat: e.latlng.lat.toFixed(5), lng: e.latlng.lng.toFixed(5) });
    };

    return (
        <div>
            <label htmlFor="clusterRadius">Cluster Radius: {clusterRadius}</label>
            <input
                type="range"
                id="clusterRadius"
                min="0"
                max="120"
                value={clusterRadius}
                onChange={(e) => setClusterRadius(Number(e.target.value))}
                style={{ width: '100%', marginBottom: '10px' }}
            />
            <MapContainer
                center={[-29.600607, 24.368744]}
                zoom={5}
                minZoom={0}
                maxZoom={20}
                style={{ height: '500px', width: '100%' }}
                scrollWheelZoom={true}
                eventHandlers={{ mousemove: handleMouseMove }}
            >
                <LayersControl position="topright">
                    <LayersControl.BaseLayer name="OpenStreetMap Stadia" checked>
                        <TileLayer
                            url="https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png"
                            attribution='&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="OpenStreetMap">
                        <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        />
                    </LayersControl.BaseLayer>
                    <LayersControl.Overlay name="CDNGI 50cm GSD Imagery Mosaic (~2016)">
                        <WMSTileLayer
                            url="http://apollo.cdngiportal.co.za/erdas-iws/ogc/wms/CDNGI_Imagery_50cm_MOSAIC"
                            layers="CDNGI_Imagery_50cm_MOSAIC"
                            format="image/png"
                            transparent={true}
                            attribution="CDNGI 50cm GSD Imagery Mosaic (~2016)"
                        />
                    </LayersControl.Overlay>
                    <LayersControl.Overlay name="CDNGI 25cm GSD Imagery Mosaic (2017)">
                        <WMSTileLayer
                            url="http://apollo.cdngiportal.co.za/erdas-iws/ogc/wms/CDNGI_Imagery_25cm_MOSAIC_2017"
                            layers="CDNGI_Imagery_25cm_MOSAIC_2017"
                            format="image/png"
                            transparent={true}
                            attribution="CDNGI 25cm GSD Imagery Mosaic (2017)"
                        />
                    </LayersControl.Overlay>
                    <LayersControl.Overlay name="CDNGI 25cm GSD Imagery Mosaic (2018)">
                        <WMSTileLayer
                            url="http://apollo.cdngiportal.co.za/erdas-iws/ogc/wms/CDNGI_Imagery_25cm_MOSAIC_2018"
                            layers="CDNGI_Imagery_25cm_MOSAIC_2018"
                            format="image/png"
                            transparent={true}
                            attribution="CDNGI 25cm GSD Imagery Mosaic (2018)"
                        />
                    </LayersControl.Overlay>
                    <LayersControl.Overlay name="NASA MODIS True Color">
                        <TileLayer
                            url={`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${selectedDate}/{tileMatrixSet}/{z}/{y}/{x}.jpg`}
                            attribution="Imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Observing System Data and Information System (EOSDIS)"
                            maxZoom={20}
                            tileSize={256}
                            time={selectedDate}
                            tileMatrixSet="GoogleMapsCompatible_Level9"
                        />
                    </LayersControl.Overlay>
                    {showMarkers && (
                        <LayersControl.Overlay name="Marker Clusters" checked>
                            <MarkerClusterComponent locations={locations} navigate={navigate} clusterRadius={clusterRadius} />
                        </LayersControl.Overlay>
                    )}
                </LayersControl>
                <DateSliderControl selectedDate={selectedDate} setSelectedDate={setSelectedDate} />
                <MousePosition />
            </MapContainer>
        </div>
    );
};

export default Map;
