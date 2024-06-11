import React, { useEffect, useState, useRef } from 'react';

import {useNavigate} from "react-router-dom";
import {LayersControl, MapContainer, TileLayer, useMap, WMSTileLayer} from 'react-leaflet';
// import SimpleScaleControl from '../leaflet_extensions/SimpleScaleControl'
import MousePosition from '../leaflet_extensions/MousePosition'
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/leaflet.markercluster.js';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import './Map.css';
import * as d3 from 'd3';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';

const SankeyDiagram = ({ data, isOpen }) => {
    const svgRef = useRef();
    console.log(data.links); // Inspect the transformed links
    const [svgWidth, svgHeight] = [600, 400]; // Adjust based on modal size
    useEffect(() => {
        if (!isOpen || !data || data.nodes.length === 0) return;

        const svg = d3.select(svgRef.current);
        // Define the dimensions for the Sankey diagram
        const width = 600; // Example width, adjust as needed
        const height = 400; // Example height, adjust as needed


        svg.selectAll('*').remove(); // Clear any existing SVG content

        const sankeyLayout = sankey()
            .nodeWidth(36) // Adjust based on your preference
            .nodePadding(40) // Adjust based on your preference
            .size([svgWidth, svgHeight])
            .nodes(data.nodes)
            .links(data.links);


        // Compute the node and link positions
        sankeyLayout(data);

        // Draw the links (paths)
        const link = svg.append("g").selectAll(".link")
            .data(data.links)
            .enter().append("path")
            .attr("class", "link")
            .attr("d", sankeyLinkHorizontal())
            .style("stroke-width", d => Math.max(1, d.width))
            .style("stroke", d => {
                // Safely access the name property
                const sourceName = d.source?.name || 'default'; // 'default' or any fallback value
                return colorMap[sourceName.split(' ')[0].toLowerCase()] || 'grey';
            })
            .style("fill", "none")
            .style("stroke-opacity", 0.5);

        // Draw the nodes and any additional elements like labels as needed

    }, [isOpen, data]); // Dependencies array


    return (
        <svg ref={svgRef} width={svgWidth} height={svgHeight} style={{ border: '1px solid black' }} viewBox={`0 0 ${svgWidth} ${svgHeight}`}></svg>
    );


};

const prepareSankeyData = (locations) => {
    const nodes = [];
    const links = [];
    locations.forEach((location) => {
        location.statuses.forEach((status) => {
            // Ensure each status is mapped to a unique node
            if (!nodes.some(node => node.id === status)) {
                nodes.push({ id: status });
            }
            // Ensure each location is mapped to a unique node
            if (!nodes.some(node => node.id === location.name)) {
                nodes.push({ id: location.name });
            }
            // Create links
            links.push({
                source: nodes.findIndex(node => node.id === location.name),
                target: nodes.findIndex(node => node.id === status),
                value: 1,
            });
        });
    });
    return { nodes, links };
};


// SankeyDiagramButton Component
const SankeyDiagramButton = ({ openSankeyDiagramModal }) => {
    const map = useMap();

    useEffect(() => {
        const sankeyButton = L.control({ position: 'topright' });

        sankeyButton.onAdd = function () {
            const div = L.DomUtil.create('div', 'sankey-button');
            div.innerHTML = '<button id="sankeyButton" style="background-color: #007bff; color: white; border: none; padding: 5px 10px; cursor: pointer; font-size: 14px; border-radius: 4px;">Sankey Diagram</button>';
            return div;
        };

        sankeyButton.addTo(map);

        document.getElementById('sankeyButton').addEventListener('click', openSankeyDiagramModal);

        return () => {
            if (map) {
                map.removeControl(sankeyButton);
            }
        };
    }, [map, openSankeyDiagramModal]);

    return null;
};

const SankeyDiagramModal = ({ isOpen, onClose, data }) => {
    if (!isOpen || !data || data.nodes.length === 0) return null;

    const { width, height } = { width: 600, height: 400 }; // Adjust to fit in the modal

    return (
        <div className="modal-backdrop">
            <div className="modal-content">
                <h2>Sankey Diagram</h2>
                <svg width={width} height={height} style={{ border: "1px solid black" }}>
                    <SankeyDiagram data={data} isOpen={isOpen} /> {/* Pass isOpen to SankeyDiagram */}
                </svg>
                <button
                    onClick={onClose}
                    style={{
                        marginTop: "20px",
                        backgroundColor: "#dc3545",
                        color: "white",
                        border: "none",
                        padding: "8px 16px",
                        cursor: "pointer",
                        fontSize: "14px",
                        borderRadius: "4px",
                    }}
                >
                    Close
                </button>
            </div>
        </div>
    );
};


const colorMap = {
    green: 'rgba(27, 151, 79, 0.75)', // Add alpha channel for transparency
    blue: 'rgba(0, 123, 255, 0.75)',
    dark_blue:'rgba(0, 97, 164, 0.75)',
    yellow: 'rgba(255, 193, 7, 0.75)',
    orange: 'rgba(253, 126, 20, 0.75)',
    red: 'rgba(220, 53, 69, 0.75)',
    darkred: 'rgba(139, 0, 0, 0.75)',
    unknown: 'rgba(128, 128, 128, 0.75)', // Add gray color with transparency
    gray: 'rgba(128, 128, 128, 0.75)' // Add gray color with transparency
};


const createPieChartIcon = (statuses) => {
    // Check if statuses is undefined or empty
    if (!statuses || statuses.length === 0) {
        // Handle the case where statuses is undefined or empty by setting it to gray
        statuses = ['gray'];
    }

    let svgPaths = '';
    const iconSize = [28, 28]; // Increase the icon size to 32x32 for better clarity
    const centerX = iconSize[0] / 2;
    const centerY = iconSize[1] / 2;
    const radius = iconSize[0] / 2; // Radius of the pie chart

    // If there's only one status, create a solid-colored circle
    if (statuses.length === 1) {
        const status = statuses[0];
        svgPaths = `<circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="${colorMap[status]}" />`;
    } else {
        let startAngle = -Math.PI / 2; // Start from the top (12 o'clock position)

        statuses.forEach((status, index) => {
            const angle = (Math.PI * 2 * (1 / statuses.length)); // Equal angle for each segment
            const endAngle = startAngle + angle;

            // Calculate segment coordinates
            const x1 = centerX + radius * Math.cos(startAngle);
            const y1 = centerY + radius * Math.sin(startAngle);
            const x2 = centerX + radius * Math.cos(endAngle);
            const y2 = centerY + radius * Math.sin(endAngle);

            // Create path for each segment
            const d = `M${centerX},${centerY} L${x1},${y1} A${radius},${radius} 0 0,1 ${x2},${y2} Z`;
            svgPaths += `<path d="${d}" fill="${colorMap[status]}" />`;

            startAngle = endAngle; // Update the start angle for the next segment
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
        // Clear existing marker clusters if any
        if (window.markerClusterGroup) {
            window.markerClusterGroup.clearLayers();
        }

        // Create a new marker cluster group with dynamic cluster radius
        window.markerClusterGroup = L.markerClusterGroup({
            maxClusterRadius: clusterRadius, // Use state value
            disableClusteringAtZoom: 15, // Stop clustering at zoom level 15
            spiderfyOnMaxZoom: true,
        });// Adjusting options for clustering behavior
        // const markerClusterOptions = {
        //     maxClusterRadius: 40, // Reduce cluster radius to make clusters less aggressive
        //     disableClusteringAtZoom: 15, // Stop clustering at zoom level 15
        //     spiderfyOnMaxZoom: true, // Spread out markers at the maximum zoom level instead of expanding cluster
        // };
        // const markerClusterGroup = L.markerClusterGroup(markerClusterOptions);

        locations.forEach((location) => {
            const marker = L.marker(new L.LatLng(location.lat, location.lng), {
                icon: createPieChartIcon(location.statuses)
            });

            marker.bindTooltip(`
                <strong>Node:</strong> ${location.node}<br/>
                <strong>Site:</strong> ${location.site}<br/>
                <strong>Station Name:</strong> ${location.stationName}
            `);

            const popupContent = `
                <div style="font-family: Arial, sans-serif; padding: 10px; background: #f9f9f9; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                    <h4 style="margin-top: 0;">${location.stationName}</h4>
                    <strong>Node:</strong> ${location.node}<br/>
                    <strong>Site:</strong> ${location.site}<br/>
                    <button onclick="window.navigateToSite('${location.siteRowName}')" 
                            style="background-color: #007bff; color: white; padding: 8px 12px; border: none; border-radius: 4px; cursor: pointer; margin-top: 10px; text-transform: uppercase; font-size: 14px;">
                        Go to Raw Data
                    </button>
                </div>
            `;

            marker.bindPopup(popupContent);
            window.markerClusterGroup.addLayer(marker);
        });

        map.addLayer(window.markerClusterGroup);

        // Attach a global function to handle navigation. This is accessible from the popup's inline onclick handler.
        window.navigateToSite = (siteRowName) => navigate(`/ScrollableTable?site=${encodeURIComponent(siteRowName)}`);
        // map.addLayer(markerClusterGroup);
    




    return () => {
        window.markerClusterGroup.clearLayers();
        delete window.navigateToSite;
    };
},[locations, map, navigate, clusterRadius]); // Add clusterRadius as a dependency


    return null;
};


const Legend = () => {
    const categories = [
        {label: "Within a day", badgeColor: "green"},
        {label: "Within a week", badgeColor: "blue"},
        {label: "Last week", badgeColor: "dark_blue"},
        {label: "2 weeks ago", badgeColor: "yellow"},
        {label: "3 Weeks Ago", badgeColor: "orange"},
        {label: "This year", badgeColor: "red"},
        {label: "Over a year ago", badgeColor: "darkred"},
        {label: "Unknown", badgeColor: "gray"},
    ];

    return (
        <div className="legend">
            <div className="legend-title">Site Update Status</div>
            <p className="legend-description">Each site contains multiple data tables. The icon represents the
                collective update status of its tables:</p>
            {categories.map((category, index) => (
                <div key={index} className="legend-item">
                    <span className={`legend-color`} style={{backgroundColor: colorMap[category.badgeColor]}}></span>
                    <span className="legend-text">{category.label}</span>
                    <div className="legend-description">{category.description}</div>
                </div>
            ))}
        </div>
    );
};

// Custom Date Slider Component
const DateSliderControl = ({ selectedDate, setSelectedDate }) => {
    const map = useMap();

    useEffect(() => {
        const dateSlider = L.control({ position: 'topleft' });

        dateSlider.onAdd = function () {
            var div = L.DomUtil.create('div', 'info date-slider');
            div.style.border = '2px solid white'; // Add a white border
            div.style.padding = '10px'; // Optional: Add some padding inside the div for better appearance
            div.style.backgroundColor = 'rgba(255, 255, 255, 0.8)'; // Optional: Add a slightly transparent white background
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
    const [clusterRadius, setClusterRadius] = useState(80); // Initial cluster radius

    const [showSankeyModal, setShowSankeyModal] = useState(false);

// At the top of your Map component
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10)); // Default to today's date in 'YYYY-MM-DD' format

    const openSankeyDiagramModal = () => setShowSankeyModal(true);
    const closeSankeyDiagramModal = () => setShowSankeyModal(false);

    const [sankeyData, setSankeyData] = useState({ nodes: [], links: [] });


    const [locations, setLocations] = useState([]);
    const [showLegend] = useState(true); // State for legend visibility
    const [showMarkers] = useState(true); // State for marker visibility
    const [setCoordinates] = useState({lat: 'N/A', lng: 'N/A'}); // State to hold the current coordinates

    const navigate = useNavigate();

    const handleIconClick = (siteName) => {
        navigate(`/ScrollableTable?site=${encodeURIComponent(siteName)}`);
    };



    useEffect(() => {
        const fetchLocations = async () => {
            try {
                const response = await fetch('api/locations');
                const data = await response.json();
                // cosnosle.log(data);
                setLocations(data); // Use the actual statuses from the server
            } catch (error) {
                console.error('Error fetching locations:', error);
            }
        };

        fetchLocations();
    }, []);

    useEffect(() => {
        // Prepare the Sankey data based on locations
        const preparedData = prepareSankeyData(locations);
        // console.log(preparedData);
        setSankeyData(preparedData);
    }, [locations]);
    console.log(setSankeyData);
    const handleMouseMove = (e) => {
        setCoordinates({lat: e.latlng.lat.toFixed(5), lng: e.latlng.lng.toFixed(5)});
    };



    return (
        <div>
            <label htmlFor="clusterRadius">Cluster Radius: {clusterRadius}</label>
            <input
                type="range"
                id="clusterRadius"
                min="0" // Minimum radius
                max="120" // Maximum radius
                value={clusterRadius}
                onChange={(e) => setClusterRadius(Number(e.target.value))}
                style={{ width: '100%', marginBottom: '10px' }}
            />
            <MapContainer
                center={[-29.600607, 24.368744]}
                zoom={5}
                minZoom={0}
                maxZoom={20}
                style={{height: '500px', width: '100%'}}
                scrollWheelZoom={true}
                eventHandlers={{mousemove: handleMouseMove}} // Add mousemove event handler
            >
                {showLegend && <Legend/>}



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
                    {/*    <LayersControl.BaseLayer name="Grayscale OpenStreetMap" checked>*/}
                    {/*        /!* Using Stamen's Toner Lite for grayscale effect *!/*/}
                    {/*        <TileLayer*/}
                    {/*            url="https://stamen-tiles-{s}.a.ssl.fastly.net/toner-lite/{z}/{x}/{y}{r}.png"*/}
                    {/*            attribution='Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>'*/}
                    {/*        />*/}
                    {/*    </LayersControl.BaseLayer>*/}

                    {/* WMS Layers */}


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
                    {/*<LayersControl.Overlay name="NASA MODIS True Color">*/}
                    {/*    <TileLayer*/}
                    {/*        url="https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/{time}/{tileMatrixSet}/{z}/{y}/{x}.jpg"*/}
                    {/*        attribution="Imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Observing System Data and Information System (EOSDIS)"*/}
                    {/*        maxZoom={20}*/}
                    {/*        tileSize={256}*/}
                    {/*        // Specify the time for the imagery. You can use a fixed date (e.g., '2021-07-06') or "latest" for the most recent image.*/}
                    {/*        time={new Date().toISOString().slice(0, 10)}*/}
                    {/*        // Tile matrix set appropriate for the map's projection (e.g., 'GoogleMapsCompatible_Level9' for zoom level 9 tiles).*/}
                    {/*        tileMatrixSet="GoogleMapsCompatible_Level9"*/}
                    {/*    />*/}
                    {/*</LayersControl.Overlay>*/}

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
                    {/*<LayersControl.Overlay name="MODIS Active Fires">*/}
                    {/*    <TileLayer*/}
                    {/*        url={`https://gibs.earthdata.nasa.gov/wms/epsg3857/best/MODIS_Combined_Thermal_Anomalies_Night/default/${selectedDate}/WebMercatorAUX/{z}/{y}/{x}.jpg`}*/}
                    {/*        attribution="Imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Observing System Data and Information System (EOSDIS)"*/}
                    {/*        maxZoom={20}*/}
                    {/*        tileSize={256}*/}
                    {/*    />*/}
                    {/*</LayersControl.Overlay>*/}




                    {/* Conditional rendering for Marker Clusters */}
                    {showMarkers && (
                        <LayersControl.Overlay name="Marker Clusters" checked>
                            <MarkerClusterComponent locations={locations} navigate={navigate} clusterRadius={clusterRadius} />

                            {/*<MarkerClusterComponent locations={locations} navigate={navigate}/>*/}
                        </LayersControl.Overlay>
                    )}
                </LayersControl>
                {/*<SankeyDiagramButton openSankeyDiagramModal={openSankeyDiagramModal} />*/}
                {/*<SankeyDiagramModal isOpen={showSankeyModal} onClose={closeSankeyDiagramModal} data={sankeyData} />*/}
                <DateSliderControl selectedDate={selectedDate} setSelectedDate={setSelectedDate} />

                {/*{isModisLayerVisible && <DateSliderControl selectedDate={selectedDate} setSelectedDate={setSelectedDate} />}*/}

                {/*<SimpleScaleControl options={{ metric: true, imperial: false, position: 'bottomleft' }} />*/}
                {/*<SimpleScaleControl options={{ metric: true, imperial: false, position: 'bottomleft' }} />*/}
                {/* Display the coordinates below the scale bar */}
                <MousePosition/>
            </MapContainer>
        </div>
    );
};

export default Map;
