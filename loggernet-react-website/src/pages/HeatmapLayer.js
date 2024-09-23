// // //
// // // import React from 'react';
// // // import { useMap } from 'react-leaflet';
// // // import L from 'leaflet';
// // // import 'leaflet.heat';
// // // import 'leaflet.markercluster';
// // //
// // // const HeatmapLayer = ({ points, options }) => {
// // //     const map = useMap();
// // //
// // //     React.useEffect(() => {
// // //         if (!map) return;
// // //
// // //         console.log('Points in HeatmapLayer:', points);
// // //
// // //         // Create and add the heatmap layer
// // //         const heatLayer = L.heatLayer(
// // //             points.map((point) => [point[0], point[1], point[2]]),
// // //             options // Use the options prop here
// // //         ).addTo(map);
// // //
// // //         // Create a marker cluster group with custom cluster icons
// // //         const markers = L.markerClusterGroup({
// // //             iconCreateFunction: function (cluster) {
// // //                 const childMarkers = cluster.getAllChildMarkers();
// // //                 const totalVisits = childMarkers.reduce((sum, marker) => {
// // //                     return sum + (marker.options.visits || 0);
// // //                 }, 0);
// // //                 return L.divIcon({
// // //                     html: `<div class="cluster-icon">${totalVisits}</div>`,
// // //                     className: 'custom-cluster-icon',
// // //                     iconSize: L.point(40, 40),
// // //                 });
// // //             },
// // //         });
// // //
// // //         points.forEach((point) => {
// // //             const latLng = L.latLng(point[0], point[1]);
// // //             const label = L.divIcon({
// // //                 className: 'custom-heatmap-label',
// // //                 html: `<div class="heatmap-label">${point[2]}</div>`,
// // //             });
// // //             const marker = L.marker(latLng, { icon: label, visits: point[2] });
// // //             marker.bindPopup(`<strong>Visits:</strong> ${point[2]}`); // Add popup to marker
// // //             markers.addLayer(marker);
// // //         });
// // //
// // //         // Add cluster click event to display total visits
// // //         markers.on('clusterclick', function (event) {
// // //             const cluster = event.layer;
// // //             const totalVisits = cluster.getAllChildMarkers().reduce((sum, marker) => {
// // //                 return sum + (marker.options.visits || 0);
// // //             }, 0);
// // //             cluster.bindPopup(`<strong>Total Visits:</strong> ${totalVisits}`).openPopup();
// // //         });
// // //
// // //         map.addLayer(markers);
// // //
// // //         return () => {
// // //             map.removeLayer(heatLayer);
// // //             map.removeLayer(markers);
// // //         };
// // //     }, [map, points, options]);
// // //
// // //     return null;
// // // };
// // //
// // // export default HeatmapLayer;
// // import React from 'react';
// // import { useMap } from 'react-leaflet';
// // import L from 'leaflet';
// // import 'leaflet.heat';
// // import 'leaflet.markercluster';
// //
// // const HeatmapLayer = ({ points, options }) => {
// //     const map = useMap();
// //
// //     React.useEffect(() => {
// //         if (!map) return;
// //
// //         // Calculate min and max visits
// //         const visitsArray = points.map((point) => point[2]);
// //         const minVisits = Math.min(...visitsArray);
// //         const maxVisits = Math.max(...visitsArray);
// //
// //         // Create and add the heatmap layer
// //         const heatLayer = L.heatLayer(
// //             points.map((point) => [point[0], point[1], point[2]]),
// //             options // Use the options prop here
// //         ).addTo(map);
// //
// //         // Create a marker cluster group with custom cluster icons
// //         const markers = L.markerClusterGroup({
// //             iconCreateFunction: function (cluster) {
// //                 const childMarkers = cluster.getAllChildMarkers();
// //                 const totalVisits = childMarkers.reduce((sum, marker) => {
// //                     return sum + (marker.options.visits || 0);
// //                 }, 0);
// //                 // Normalize totalVisits
// //                 const normalizedTotalVisits =
// //                     (totalVisits - minVisits) / (maxVisits - minVisits);
// //                 const hue = (1 - normalizedTotalVisits) * 240;
// //                 const color = `hsl(${hue}, 100%, 50%)`;
// //
// //                 return L.divIcon({
// //                     html: `<div class="cluster-icon" style="background-color:${color};">${totalVisits}</div>`,
// //                     className: 'custom-cluster-icon',
// //                     iconSize: L.point(40, 40),
// //                 });
// //             },
// //         });
// //
// //         points.forEach((point) => {
// //             const latLng = L.latLng(point[0], point[1]);
// //             const visits = point[2];
// //
// //             // Normalize visits
// //             const normalizedVisit = (visits - minVisits) / (maxVisits - minVisits);
// //
// //             // Compute hue from blue (240°) to red (0°)
// //             // const hue = (1 - normalizedVisit) * 240;
// //             const hue = (1 - normalizedVisit) * 180; // Changing to a smaller hue range (180 degrees)
// //             const color = `hsl(${hue}, 100%, 50%)`;
// //
// //             const label = L.divIcon({
// //                 className: 'custom-heatmap-label',
// //                 html: `<div class="heatmap-label" style="background-color:${color};">${visits}</div>`,
// //             });
// //             const marker = L.marker(latLng, { icon: label, visits });
// //             marker.bindPopup(`<strong>Visits:</strong> ${visits}`);
// //             markers.addLayer(marker);
// //         });
// //
// //         // Add cluster click event to display total visits
// //         markers.on('clusterclick', function (event) {
// //             const cluster = event.layer;
// //             const totalVisits = cluster.getAllChildMarkers().reduce((sum, marker) => {
// //                 return sum + (marker.options.visits || 0);
// //             }, 0);
// //             cluster.bindPopup(`<strong>Total Visits:</strong> ${totalVisits}`).openPopup();
// //         });
// //
// //         map.addLayer(markers);
// //
// //         return () => {
// //             map.removeLayer(heatLayer);
// //             map.removeLayer(markers);
// //         };
// //     }, [map, points, options]);
// //
// //     return null;
// // };
// //
// // export default HeatmapLayer;
// import React from 'react';
// import { useMap } from 'react-leaflet';
// import L from 'leaflet';
// import 'leaflet.heat';
// import 'leaflet.markercluster';
//
// const HeatmapLayer = ({ points, options }) => {
//     const map = useMap();
//
//     React.useEffect(() => {
//         if (!map) return;
//
//         // Calculate min and max visits
//         const visitsArray = points.map((point) => point[2]);
//         const minVisits = Math.min(...visitsArray);
//         const maxVisits = Math.max(...visitsArray);
//
//         const visitRange = maxVisits - minVisits || 1; // Avoid division by zero
//
//         // Create and add the heatmap layer
//         const heatLayer = L.heatLayer(
//             points.map((point) => [point[0], point[1], point[2]]),
//             options
//         ).addTo(map);
//
//         // Create a marker cluster group with custom cluster icons
//         const markers = L.markerClusterGroup({
//             iconCreateFunction: function (cluster) {
//                 const childMarkers = cluster.getAllChildMarkers();
//                 const totalVisits = childMarkers.reduce((sum, marker) => {
//                     return sum + (marker.options.visits || 0);
//                 }, 0);
//
//                 // Normalize totalVisits
//                 const normalizedTotalVisits = (totalVisits - minVisits) / visitRange;
//                 const hue = (1 - normalizedTotalVisits) * 180; // Adjust the color scale
//                 const color = `hsl(${hue}, 100%, 50%)`;
//
//                 return L.divIcon({
//                     html: `<div class="cluster-icon" style="background-color:${color};">${totalVisits}</div>`,
//                     className: 'custom-cluster-icon',
//                     iconSize: L.point(30, 30), // Smaller cluster icon size
//                 });
//             },
//         });
//
//         points.forEach((point) => {
//             const latLng = L.latLng(point[0], point[1]);
//             const visits = point[2];
//
//             // Normalize visits
//             const normalizedVisit = (visits - minVisits) / visitRange;
//             const hue = (1 - normalizedVisit) * 180;
//             const color = `hsl(${hue}, 100%, 50%)`;
//
//             const label = L.divIcon({
//                 className: 'custom-heatmap-label',
//                 html: `<div class="heatmap-label" style="background-color:${color};">${visits}</div>`,
//             });
//             const marker = L.marker(latLng, { icon: label, visits });
//             marker.bindPopup(`<strong>Visits:</strong> ${visits}`);
//             markers.addLayer(marker);
//         });
//
//         // Add cluster click event to display total visits
//         markers.on('clusterclick', function (event) {
//             const cluster = event.layer;
//             const totalVisits = cluster.getAllChildMarkers().reduce((sum, marker) => {
//                 return sum + (marker.options.visits || 0);
//             }, 0);
//             cluster.bindPopup(`<strong>Total Visits:</strong> ${totalVisits}`).openPopup();
//         });
//
//         map.addLayer(markers);
//
//         return () => {
//             map.removeLayer(heatLayer);
//             map.removeLayer(markers);
//         };
//     }, [map, points, options]);
//
//     return null;
// };
//
// export default HeatmapLayer;
import React from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import 'leaflet.markercluster';

const HeatmapLayer = ({ points, options }) => {
    const map = useMap();

    React.useEffect(() => {
        if (!map) return;

        // Create and add the heatmap layer with color ranges for intensity
        const heatLayer = L.heatLayer(
            points.map((point) => [point[0], point[1], point[2]]),
            options
        ).addTo(map);

        // Create a marker cluster group with grey cluster icons
        const markers = L.markerClusterGroup({
            iconCreateFunction: function (cluster) {
                const totalVisits = cluster.getAllChildMarkers().reduce((sum, marker) => {
                    return sum + (marker.options.visits || 0);
                }, 0);

                return L.divIcon({
                    html: `<div class="cluster-icon">${totalVisits}</div>`,
                    className: 'custom-cluster-icon',
                    iconSize: L.point(25, 25), // Adjust icon size here
                });
            },
        });

        points.forEach((point) => {
            const latLng = L.latLng(point[0], point[1]);
            const visits = point[2];

            const label = L.divIcon({
                className: 'custom-heatmap-label',
                html: `<div class="heatmap-label">${visits}</div>`,
            });
            const marker = L.marker(latLng, { icon: label, visits });
            marker.bindPopup(`<strong>Visits:</strong> ${visits}`);
            markers.addLayer(marker);
        });

        // Add cluster click event to display total visits
        markers.on('clusterclick', function (event) {
            const cluster = event.layer;
            const totalVisits = cluster.getAllChildMarkers().reduce((sum, marker) => {
                return sum + (marker.options.visits || 0);
            }, 0);
            cluster.bindPopup(`<strong>Total Visits:</strong> ${totalVisits}`).openPopup();
        });

        map.addLayer(markers);

        return () => {
            map.removeLayer(heatLayer);
            map.removeLayer(markers);
        };
    }, [map, points, options]);

    return null;
};

export default HeatmapLayer;
