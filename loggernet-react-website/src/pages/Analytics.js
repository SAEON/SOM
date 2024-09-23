import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer } from 'react-leaflet';
import HeatmapLayer from './HeatmapLayer';
import 'leaflet/dist/leaflet.css';
import { Bar, Pie } from 'react-chartjs-2';
import "./Analytics.css";


import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';


import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement
} from 'chart.js';

// Register the necessary components for Chart.js
ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement
);

const interactionTypeMapping = {
    toggle_server: 'Site toggles',
    page_view: 'Page views',
    view_data_availability: 'Data availability',
    view_aggregated_data_availability: 'Aggregated data availability',
    view_table: 'Table views',
    generate_sankey_data_tab: 'View site variable mapping',
    view_info_modal: 'View information',
    view_metadata: 'View metadata',
    download_data: 'Download data',
    consent_given: "Consent given",
    get_table_list: "API table list",
    get_site_list: "API site list",
    get_date_range: "API date range",
};


const Analytics = () => {
    const [range, setRange] = useState("monthly");
    const [year, setYear] = useState(new Date().getFullYear());
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [overviewMetrics, setOverviewMetrics] = useState({});
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    const [isMapdailyExpanded, setIsMapdailyExpanded] = useState(false);
    const [isGeneralExpanded, setIsGeneralExpanded] = useState(false);
    const [isTopPagesExpanded, setIsTopPagesExpanded] = useState(false);
    const [isTopInteractionsExpanded, setIsTopInteractionsExpanded] = useState(false);
    const [expandedInteractionType, setExpandedInteractionType] = useState(null);
    const [showChartForType, setShowChartForType] = useState(null);
    const [showWhoTop20ForType, setShowWhoTop20ForType] = useState(null);
    const [stackBy, setStackBy] = useState('sector');
    const [showChartModal, setShowChartModal] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [showDetailsModal, setShowDetailsModal] = useState(false); // New state for details modal
    const [detailsContent, setDetailsContent] = useState(''); // State to store the content of details
    const [isTopReferralsExpanded, setIsTopReferralsExpanded] = useState(false);

    const safeDateToISOString = (date) => {
        return date instanceof Date ? date.toISOString() : date;
    };

    const toSAST = (utcDate) => {
        if (!utcDate) return null; // Handle null or undefined values
        const date = new Date(utcDate);

        // Adjust the time for SAST by adding 2 hours (UTC+2)
        const offset = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
        const sastTime = new Date(date.getTime() + offset);

        return sastTime;
    };

    useEffect(() => {
        axios
            .get(`/api/analytics/overview?range=${range}&year=${year}&month=${month}`)
            .then((response) => {
                const data = response.data;
                // console.log(data);
                const overview = data.overview || {};

                // Convert interactionDate and interactionHour to SAST
                if (overview.detailedInteractions) {
                    overview.detailedInteractions = overview.detailedInteractions.map(interaction => {
                        const interactionDate = safeDateToISOString(toSAST(interaction.interactionDate));
                        const interactionHour = safeDateToISOString(toSAST(interaction.interactionHour));

                        // Log interaction date and hour for debugging
                        // console.log('Interaction Date:', interactionDate);
                        // console.log('Interaction Hour:', interactionHour);

                        return {
                            ...interaction,
                            interactionDate,
                            interactionHour,
                        };
                    });
                }

                setOverviewMetrics(overview);
            })
            .catch((error) => {
                console.error("Error fetching analytics data:", error);
            });
    }, [range, year, month]);

// Extract top 100 referrals from detailedInteractions
    const top100Referrals = overviewMetrics.detailedInteractions
        ? overviewMetrics.detailedInteractions.reduce((acc, interaction) => {
            const referrer = interaction.referrer || 'Direct'; // Handle empty referrer
            if (!acc[referrer]) {
                acc[referrer] = 0;
            }
            acc[referrer] += 1;
            return acc;
        }, {})
        : {};

    // Sort referrals by count and get the top 100
    const sortedReferrals = Object.entries(top100Referrals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100);

    // console.log("referals", top100Referrals)

    const heatMapPoints = overviewMetrics.locations
        ? overviewMetrics.locations.map((location) => [
            location.lat,
            location.lon,
            location.visits,
        ])
        : [];

    const heatMapPoints2 = overviewMetrics.locationsPerDay
        ? overviewMetrics.locationsPerDay.map((location) => [
            location.lat,
            location.lon,
            location.visits,
        ])
        : [];

    const toggleInteractionDetails = (type) => {
        setExpandedInteractionType(expandedInteractionType === type ? null : type);
    };

    const toggleChartForType = (type) => {
        setShowChartForType(showChartForType === type ? null : type);
        setShowChartModal(true);
    };

    const toggleWhoTop20ForType = (type) => {
        setShowWhoTop20ForType(showWhoTop20ForType === type ? null : type);
        setShowChartModal(true);
    };

    const closeChartModal = () => {
        setShowChartModal(false);
        setShowChartForType(null);
        setShowWhoTop20ForType(null);
    };

    const openReportModal = () => {
        setShowReportModal(true);
    };

    const closeReportModal = () => {
        setShowReportModal(false);
    };


    const openDetailsModal = (interactionType) => {
        // Generate the details content without aggregation
        const content = overviewMetrics.detailedInteractions
            .filter(i => i.interactionType === interactionType)
            .map((detail, i) => {
                const tableNamePart = detail.tableName ? ` - ${detail.tableName}` : '';

                return `
                <strong>Date:</strong> ${formatDate(detail.interactionDate)} <br />
                              
                <strong>Interaction type:</strong> ${formatDate(detail.interactionType)} <br />                
                <strong>Request Path:</strong> ${detail.requestPath || 'Unknown'} <br />
                <strong>Location:</strong> ${detail.location?.country || 'Unknown'}, ${detail.location?.city || 'Unknown'} <br />
                <strong>User:</strong> ${detail.firstName ? `${detail.firstName} ${detail.lastName}` : 'Anonymous'} <br />
                <strong>Sector:</strong> ${detail.sector || 'Unknown'} <br />
                <strong>Discipline:</strong> ${detail.discipline || 'Unknown'} <br />
                <strong>Country:</strong> ${detail.location?.country || 'Unknown'} <br />
                ${detail.tableName ? `<strong>Table Name:</strong> ${detail.tableName} <br />` : ''}
                <strong>Referrer:</strong> ${formatDate(detail.referrer)} <br />  
                <strong>Interactions:</strong> 1 <br /> <!-- Show interactions as 1 since there's no aggregation -->
                
                ${Object.entries(detail.additionalData)
                    .map(([key, value]) => `<span key={key}><strong>${key}:</strong> ${JSON.stringify(value)} <br /></span>`)
                    .join('')}
            `;
            })
            .join('<hr>');

        setDetailsContent(content); // Set the details content
        setShowDetailsModal(true); // Open the details modal
    };

    const closeDetailsModal = () => {
        setShowDetailsModal(false);
    };

    const copyDetailsToClipboard = () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(detailsContent.replace(/<[^>]*>?/gm, '')) // Remove HTML tags before copying
                .then(() => {
                    alert('Details copied to clipboard!');
                })
                .catch((error) => {
                    console.error('Failed to copy text:', error);
                    alert('Failed to copy text to clipboard.');
                });
        } else {
            const textArea = document.createElement('textarea');
            textArea.value = detailsContent.replace(/<[^>]*>?/gm, '');
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                alert('Details copied to clipboard!');
            } catch (err) {
                console.error('Failed to copy using fallback:', err);
                alert('Failed to copy text to clipboard. Please try manually.');
            }
            document.body.removeChild(textArea);
        }
    };

    const copyReportToClipboard = () => {
        // Generate the report text with HTML
        const reportTextWithHTML = generateReportText();

        // Strip HTML tags while maintaining line breaks
        const reportTextWithoutHTML = stripHTMLWithFormatting(reportTextWithHTML);

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(reportTextWithoutHTML)
                .then(() => {
                    alert('Report copied to clipboard!');
                })
                .catch((error) => {
                    console.error('Failed to copy text:', error);
                    alert('Failed to copy text to clipboard.');
                });
        } else {
            const textArea = document.createElement('textarea');
            textArea.value = reportTextWithoutHTML;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                alert('Report copied to clipboard!');
            } catch (err) {
                console.error('Failed to copy using fallback:', err);
                alert('Failed to copy text to clipboard. Please try manually.');
            }
            document.body.removeChild(textArea);
        }
    };

// Utility function to strip HTML tags and maintain line breaks
    const stripHTMLWithFormatting = (html) => {
        // Replace line breaks and paragraphs with new lines
        let text = html.replace(/<br\s*\/?>/gi, '\n');  // Convert <br> to newline
        text = text.replace(/<\/p>/gi, '\n\n');          // Convert </p> to double newline for paragraph spacing
        text = text.replace(/<[^>]+>/g, '');             // Remove any other HTML tags

        return text.trim(); // Trim leading and trailing whitespace
    };

    const generateReportText = () => {
        // Start generating the report in HTML format
        let report = `<strong>Analytics Report (hourly interactions) for ${range} ${range === 'yearly' ? year : `${month}/${year}`}</strong><br><br>`;
        report += `<strong>Total website interactions (hourly):</strong> ${overviewMetrics.totalVisits}<br>`;
        report += `<strong>New Users:</strong> ${overviewMetrics.newUsers}<br>`;
        report += `<strong>Anonymous Users (not logged in):</strong> ${overviewMetrics.anonymousUsers}<br><br>`;

        // Add API requests
        report += `<strong>API Requests:</strong> ${overviewMetrics.apiRequests}<br>`;
        report += `</ul><br>`;
        // Add Total Downloads with breakdown
        const totalDownloads = (overviewMetrics.apiDownloads ?? 0) + (overviewMetrics.webDownloads ?? 0);
        report += `<strong>Total Downloads:</strong> ${totalDownloads}<br>`;

        report += `<li>API Downloads: ${overviewMetrics.apiDownloads ?? 0}</li>`;
        report += `<li>Web Downloads: ${overviewMetrics.webDownloads ?? 0}</li>`;
        report += `</ul><br>`;


// Top Pages Section
        report += `<strong>Page Visits:</strong><br>`;
        overviewMetrics.topPages?.filter(page => !page.path.startsWith('/api/')).forEach(page => {
            report += `- ${page.path}: ${page.interactions} Interactions<br>`;
        });
        report += `</ul><br>`;
        // API Endpoints Section
        report += `<strong>API Interactions:</strong><br>`;
        overviewMetrics.topPages?.filter(page => page.path.startsWith('/api/')).forEach(page => {
            report += `- ${page.path}: ${page.interactions} Interactions<br>`;
        });




        //     });



        // report += `<br><strong>Interactions (Alphabetically Sorted):</strong><br>`;
        // overviewMetrics.topInteractionTypes
        //     ?.sort((a, b) => {
        //         const typeA = interactionTypeMapping[a.type] || a.type;
        //         const typeB = interactionTypeMapping[b.type] || b.type;
        //         return typeA.localeCompare(typeB); // Sort alphabetically
        //     })
        //     .forEach(type => {
        //         report += `- <strong>${interactionTypeMapping[type.type] || type.type}</strong>: ${type.count} occurrences<br>`;
        //     });
        //
        // report += `<br><strong>Interaction Type Details (Aggregated by Unique Table and Server):</strong><br>`;
        // Object.entries(
        //     overviewMetrics.detailedInteractions
        //         .reduce((acc, detail) => {
        //             const interactionName = interactionTypeMapping[detail.interactionType] || detail.interactionType;
        //             const key = `${detail.firstName || 'Anonymous'} ${detail.lastName || ''} - ${detail.sector || 'Unknown'} - ${detail.location?.country || 'Unknown'} - ${detail.location?.city || 'Unknown'}`;
        //
        //             const table = detail.additionalData?.table || 'Unknown table';
        //             const server = detail.additionalData?.server || 'Unknown server';
        //
        //             // Create a unique key that includes table and server to aggregate by
        //             const uniqueKey = `${key} - ${table} - ${server}`;
        //
        //             if (!acc[interactionName]) acc[interactionName] = {};
        //             if (!acc[interactionName][uniqueKey]) {
        //                 acc[interactionName][uniqueKey] = { count: 0, additionalData: { table, server } };
        //             }
        //
        //             acc[interactionName][uniqueKey].count++;
        //
        //             return acc;
        //         }, {})
        // )
        //     .sort(([interactionTypeA], [interactionTypeB]) => interactionTypeA.localeCompare(interactionTypeB)) // Sort alphabetically by interaction type
        //     .forEach(([interactionType, groupedDetails]) => {
        //         report += `<br><strong>${interactionType}</strong>:<br>`;
        //
        //         Object.entries(groupedDetails)
        //             .sort(([keyA], [keyB]) => keyA.localeCompare(keyB)) // Sort alphabetically by user details
        //             .forEach(([key, { count, additionalData }]) => {
        //                 // For "Aggregated data availability" and "API site list", omit "Unknown table" and "Unknown server"
        //                 if (interactionType === 'Aggregated data availability' || interactionType === 'API site list') {
        //                     report += `- ${key.replace(/ - Unknown table - Unknown server/g, '').replace(/ - /g, ', ')}: ${count} occurrence${count > 1 ? 's' : ''}<br>`;
        //                     return;
        //                 }
        //
        //                 // Format the output to include the aggregated data
        //                 report += `- ${key.replace(/ - /g, ', ')}: ${count} occurrence${count > 1 ? 's' : ''}<br>`;
        //
        //                 // Remove Additional Data for "API site list"
        //                 if (interactionType === 'API site list') {
        //                     return;
        //                 }
        //
        //                 // Remove the table from the Additional Data for "API table list"
        //                 if (interactionType === 'API table list' && Object.keys(additionalData).length > 0) {
        //                     report += `  Additional Data: ${JSON.stringify({ server: additionalData.server })}<br>`;
        //                 } else if (Object.keys(additionalData).length > 0) {
        //                     report += `  Additional Data: ${JSON.stringify({ table: additionalData.table, server: additionalData.server })}<br>`;
        //                 }
        //             });
        //     });

        // report += `<br><strong>Interactions (Alphabetically Sorted):</strong><br>`;
        // overviewMetrics.topInteractionTypes
        //     ?.sort((a, b) => {
        //         const typeA = interactionTypeMapping[a.type] || a.type;
        //         const typeB = interactionTypeMapping[b.type] || b.type;
        //         return typeA.localeCompare(typeB); // Sort alphabetically
        //     })
        //     .forEach(type => {
        //         report += `- <strong>${interactionTypeMapping[type.type] || type.type}</strong>: ${type.count} occurrences<br>`;
        //     });
        //
        // report += `<br><strong>Interaction Type Details (Aggregated by Unique Table and Server):</strong><br>`;
        // Object.entries(
        //     overviewMetrics.detailedInteractions
        //         .reduce((acc, detail) => {
        //             const interactionName = interactionTypeMapping[detail.interactionType] || detail.interactionType;
        //             const key = `${detail.firstName || 'Anonymous'} ${detail.lastName || ''} - ${detail.sector || 'Unknown'} - ${detail.location?.country || 'Unknown'} - ${detail.location?.city || 'Unknown'}`;
        //
        //             const table = detail.additionalData?.tableName || 'Unknown table';
        //             const server = detail.additionalData?.serverName || 'Unknown server';
        //
        //             // Create a unique key that includes table and server to aggregate by
        //             const uniqueKey = `${key} - ${table} - ${server}`;
        //
        //             if (!acc[interactionName]) acc[interactionName] = {};
        //             if (!acc[interactionName][uniqueKey]) {
        //                 acc[interactionName][uniqueKey] = { count: 0, additionalData: { table, server } };
        //             }
        //
        //             acc[interactionName][uniqueKey].count++;
        //
        //             return acc;
        //         }, {})
        // )
        //     .sort(([interactionTypeA], [interactionTypeB]) => interactionTypeA.localeCompare(interactionTypeB)) // Sort alphabetically by interaction type
        //     .forEach(([interactionType, groupedDetails]) => {
        //         report += `<br><strong>${interactionType}</strong>:<br>`;
        //
        //         Object.entries(groupedDetails)
        //             .sort(([keyA], [keyB]) => keyA.localeCompare(keyB)) // Sort alphabetically by user details
        //             .forEach(([key, { count, additionalData }]) => {
        //                 // For "Aggregated data availability" and "API site list", omit "Unknown table" and "Unknown server"
        //                 if (interactionType === 'Aggregated data availability' || interactionType === 'API site list') {
        //                     report += `- ${key.replace(/ - Unknown table - Unknown server/g, '').replace(/ - /g, ', ')}: ${count} occurrence${count > 1 ? 's' : ''}<br>`;
        //                     return;
        //                 }
        //
        //                 // Format the output to include the aggregated data
        //                 report += `- ${key.replace(/ - /g, ', ')}: ${count} occurrence${count > 1 ? 's' : ''}<br>`;
        //
        //                 // Remove Additional Data for "API site list"
        //                 if (interactionType === 'API site list') {
        //                     return;
        //                 }
        //
        //                 // Remove the table from the Additional Data for "API table list"
        //                 if (interactionType === 'API table list' && Object.keys(additionalData).length > 0) {
        //                     report += `  Additional Data: ${JSON.stringify({ server: additionalData.server })}<br>`;
        //                 } else if (Object.keys(additionalData).length > 0) {
        //                     report += `  Additional Data: ${JSON.stringify({ table: additionalData.table, server: additionalData.server })}<br>`;
        //                 }
        //             });
        //     });
        // report += `<br><strong>Interactions (Alphabetically Sorted):</strong><br>`;
        // overviewMetrics.topInteractionTypes
        //     ?.sort((a, b) => {
        //         const typeA = interactionTypeMapping[a.type] || a.type;
        //         const typeB = interactionTypeMapping[b.type] || b.type;
        //         return typeA.localeCompare(typeB); // Sort alphabetically
        //     })
        //     .forEach(type => {
        //         report += `- <strong>${interactionTypeMapping[type.type] || type.type}</strong>: ${type.count} occurrences<br>`;
        //     });
        //
        // report += `<br><strong>Interaction Type Details (Aggregated by Unique Table and Server):</strong><br>`;
        // Object.entries(
        //     overviewMetrics.detailedInteractions
        //         .reduce((acc, detail) => {
        //             const interactionName = interactionTypeMapping[detail.interactionType] || detail.interactionType;
        //             const key = `${detail.firstName || 'Anonymous'} ${detail.lastName || ''} - ${detail.sector || 'Unknown'} - ${detail.location?.country || 'Unknown'} - ${detail.location?.city || 'Unknown'}`;
        //
        //             const table = detail.additionalData?.tableName || 'Unknown table';
        //             const server = detail.additionalData?.serverName || 'Unknown server';
        //
        //             // Create a unique key that includes table and server to aggregate by
        //             const uniqueKey = `${key} - ${table} - ${server}`;
        //
        //             if (!acc[interactionName]) acc[interactionName] = {};
        //             if (!acc[interactionName][uniqueKey]) {
        //                 acc[interactionName][uniqueKey] = { count: 0, additionalData: { table, server } };
        //             }
        //
        //             acc[interactionName][uniqueKey].count++;
        //
        //             return acc;
        //         }, {})
        // )
        //     .sort(([interactionTypeA], [interactionTypeB]) => interactionTypeA.localeCompare(interactionTypeB)) // Sort alphabetically by interaction type
        //     .forEach(([interactionType, groupedDetails]) => {
        //         report += `<br><strong>${interactionType}</strong>:<br>`;
        //
        //         Object.entries(groupedDetails)
        //             .sort(([keyA], [keyB]) => keyA.localeCompare(keyB)) // Sort alphabetically by user details
        //             .forEach(([key, { count, additionalData }]) => {
        //                 // For certain interaction types, omit "Unknown table" and "Unknown server"
        //                 if (
        //                     interactionType === 'Aggregated data availability' ||
        //                     interactionType === 'API site list' ||
        //                     interactionType === 'Page views' ||
        //                     interactionType === 'View information' ||
        //                     interactionType === 'View metadata' ||
        //                     interactionType === 'View site variable mapping'
        //                 ) {
        //                     report += `- ${key.replace(/ - Unknown table - Unknown server/g, '').replace(/ - /g, ', ')}: ${count} occurrence${count > 1 ? 's' : ''}<br>`;
        //                     return;
        //                 }
        //
        //                 // Remove the table part from Additional Data for "Site toggles"
        //                 if (interactionType === 'Site toggles') {
        //                     report += `- ${key.replace(/ - /g, ', ')}: ${count} occurrence${count > 1 ? 's' : ''}<br>`;
        //                     report += `  Additional Data: ${JSON.stringify({ server: additionalData.server })}<br>`;
        //                     return;
        //                 }
        //
        //                 // Format the output to include the aggregated data for all other interaction types
        //                 report += `- ${key.replace(/ - /g, ', ')}: ${count} occurrence${count > 1 ? 's' : ''}<br>`;
        //
        //                 // Remove the Additional Data for "API site list" and "Page views" when both table and server are unknown
        //                 if (interactionType === 'API site list' || interactionType === 'Page views') {
        //                     return;
        //                 }
        //
        //                 // Remove the table from the Additional Data for "API table list"
        //                 if (interactionType === 'API table list' && Object.keys(additionalData).length > 0) {
        //                     report += `  Additional Data: ${JSON.stringify({ server: additionalData.server })}<br>`;
        //                 } else if (Object.keys(additionalData).length > 0) {
        //                     report += `  Additional Data: ${JSON.stringify({ table: additionalData.table, server: additionalData.server })}<br>`;
        //                 }
        //             });
        //     });

        // report += `<br><strong>Interactions (Alphabetically Sorted):</strong><br>`;
        // overviewMetrics.topInteractionTypes
        //     ?.sort((a, b) => {
        //         const typeA = interactionTypeMapping[a.type] || a.type;
        //         const typeB = interactionTypeMapping[b.type] || b.type;
        //         return typeA.localeCompare(typeB); // Sort alphabetically
        //     })
        //     .forEach(type => {
        //         report += `- <strong>${interactionTypeMapping[type.type] || type.type}</strong>: ${type.count} occurrences<br>`;
        //     });
        //
        // report += `<br><strong>Interaction Type Details (Aggregated by Unique Table and Server):</strong><br>`;
        // Object.entries(
        //     overviewMetrics.detailedInteractions
        //         .reduce((acc, detail) => {
        //             const interactionName = interactionTypeMapping[detail.interactionType] || detail.interactionType;
        //             const key = `${detail.firstName || 'Anonymous'} ${detail.lastName || ''} - ${detail.sector || 'Unknown'} - ${detail.location?.country || 'Unknown'} - ${detail.location?.city || 'Unknown'}`;
        //
        //             const table = detail.additionalData?.tableName || 'Unknown table';
        //             const server = detail.additionalData?.serverName || 'Unknown server';
        //
        //             // Create a unique key that includes table and server to aggregate by
        //             const uniqueKey = `${key} - ${table} - ${server}`;
        //
        //             if (!acc[interactionName]) acc[interactionName] = {};
        //             if (!acc[interactionName][uniqueKey]) {
        //                 acc[interactionName][uniqueKey] = { count: 0, additionalData: { table, server } };
        //             }
        //
        //             acc[interactionName][uniqueKey].count++;
        //
        //             return acc;
        //         }, {})
        // )
        //     .sort(([interactionTypeA], [interactionTypeB]) => interactionTypeA.localeCompare(interactionTypeB)) // Sort alphabetically by interaction type
        //     .forEach(([interactionType, groupedDetails]) => {
        //         report += `<br><strong>${interactionType}</strong>:<br>`;
        //
        //         Object.entries(groupedDetails)
        //             .sort(([keyA], [keyB]) => keyA.localeCompare(keyB)) // Sort alphabetically by user details
        //             .forEach(([key, { count, additionalData }]) => {
        //
        //                 // For "API date range", show unique table and server combinations
        //                 if (interactionType === 'API date range') {
        //                     report += `- ${key.replace(/ - Unknown table - Unknown server/g, '').replace(/ - /g, ', ')}: ${count} occurrence${count > 1 ? 's' : ''}<br>`;
        //                     report += `  Additional Data: ${JSON.stringify({ table: additionalData.table, server: additionalData.server })}<br>`;
        //                     return;
        //                 }
        //
        //                 // For "API table list", show only the server (remove "Unknown table")
        //                 if (interactionType === 'API table list') {
        //                     report += `- ${key.replace(/ - Unknown table/g, '').replace(/ - /g, ', ')}: ${count} occurrence${count > 1 ? 's' : ''}<br>`;
        //                     report += `  Additional Data: ${JSON.stringify({ server: additionalData.server })}<br>`;
        //                     return;
        //                 }
        //
        //                 // For "Site toggles", remove "Unknown table" and keep only the server
        //                 if (interactionType === 'Site toggles') {
        //                     report += `- ${key.replace(/ - Unknown table/g, '').replace(/ - /g, ', ')}: ${count} occurrence${count > 1 ? 's' : ''}<br>`;
        //                     report += `  Additional Data: ${JSON.stringify({ server: additionalData.server })}<br>`;
        //                     return;
        //                 }
        //
        //                 // For certain interaction types, omit "Unknown table" and "Unknown server"
        //                 if (
        //                     interactionType === 'Aggregated data availability' ||
        //                     interactionType === 'API site list' ||
        //                     interactionType === 'Page views' ||
        //                     interactionType === 'View information' ||
        //                     interactionType === 'View metadata' ||
        //                     interactionType === 'View site variable mapping'
        //                 ) {
        //                     report += `- ${key.replace(/ - Unknown table - Unknown server/g, '').replace(/ - /g, ', ')}: ${count} occurrence${count > 1 ? 's' : ''}<br>`;
        //                     return;
        //                 }
        //
        //                 // Format the output to include the aggregated data for all other interaction types
        //                 report += `- ${key.replace(/ - /g, ', ')}: ${count} occurrence${count > 1 ? 's' : ''}<br>`;
        //
        //                 // Remove the Additional Data for "API site list" and "Page views" when both table and server are unknown
        //                 if (interactionType === 'API site list' || interactionType === 'Page views') {
        //                     return;
        //                 }
        //
        //                 // Remove the table from the Additional Data for "API table list"
        //                 if (interactionType === 'API table list' && Object.keys(additionalData).length > 0) {
        //                     report += `  Additional Data: ${JSON.stringify({ server: additionalData.server })}<br>`;
        //                 } else if (Object.keys(additionalData).length > 0) {
        //                     report += `  Additional Data: ${JSON.stringify({ table: additionalData.table, server: additionalData.server })}<br>`;
        //                 }
        //             });
        //     });

        // Interactions (Alphabetically Sorted)
        report += `<br><strong>Interactions (Alphabetically Sorted):</strong><br>`;
        overviewMetrics.topInteractionTypes
            ?.sort((a, b) => {
                const typeA = interactionTypeMapping[a.type] || a.type;
                const typeB = interactionTypeMapping[b.type] || b.type;
                return typeA.localeCompare(typeB);
            })
            .forEach(type => {
                report += `- <strong>${interactionTypeMapping[type.type] || type.type}</strong>: ${type.count} occurrence${type.count > 1 ? 's' : ''}<br>`;
            });

// Interaction Type Details (Aggregated by Unique Table and Server)
        report += `<br><strong>Interaction Type Details (Aggregated by Unique Table and Server):</strong><br>`;
        Object.entries(
            overviewMetrics.detailedInteractions.reduce((acc, detail) => {
                const interactionName = interactionTypeMapping[detail.interactionType] || detail.interactionType;
                const key = `${detail.firstName || 'Anonymous'} ${detail.lastName || ''} - ${detail.sector || 'Unknown'} - ${detail.location?.country || 'Unknown'} - ${detail.location?.city || 'Unknown'}`;
                const table = detail.additionalData?.tableName || 'Unknown table';
                const server = detail.additionalData?.serverName || 'Unknown server';

                // Create unique key with table and server for aggregation
                const uniqueKey = `${key} - ${table} - ${server}`;

                if (!acc[interactionName]) acc[interactionName] = {};
                if (!acc[interactionName][uniqueKey]) {
                    acc[interactionName][uniqueKey] = { count: 0, additionalData: { table, server } };
                }

                acc[interactionName][uniqueKey].count++;
                return acc;
            }, {})
        )
            .sort(([interactionTypeA], [interactionTypeB]) => interactionTypeA.localeCompare(interactionTypeB)) // Alphabetically sort by interaction type
            .forEach(([interactionType, groupedDetails]) => {
                report += `<br><strong>${interactionType}</strong>:<br>`;
                Object.entries(groupedDetails)
                    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB)) // Alphabetically sort by user details
                    .forEach(([key, { count, additionalData }]) => {

                        // Handling "API date range" interactions
                        if (interactionType === 'API date range') {
                            const displayKey = key.replace(/ - Unknown table - Unknown server/g, '').replace(/ - /g, ', ');
                            report += `- ${displayKey}: ${count} occurrence${count > 1 ? 's' : ''}<br>`;
                            report += `  Additional Data: ${JSON.stringify({ table: additionalData.table, server: additionalData.server })}<br>`;
                            return;
                        }

                        // Handling "API table list" interactions
                        if (interactionType === 'API table list') {
                            const displayKey = key.replace(/ - Unknown table/g, '').replace(/ - /g, ', ');
                            report += `- ${displayKey}: ${count} occurrence${count > 1 ? 's' : ''}<br>`;
                            report += `  Additional Data: ${JSON.stringify({ server: additionalData.server })}<br>`;
                            return;
                        }

                        // Handling "Site toggles" interactions
                        if (interactionType === 'Site toggles') {
                            const displayKey = key.replace(/ - Unknown table/g, '').replace(/ - /g, ', ');
                            report += `- ${displayKey}: ${count} occurrence${count > 1 ? 's' : ''}<br>`;
                            report += `  Additional Data: ${JSON.stringify({ server: additionalData.server })}<br>`;
                            return;
                        }

                        // For certain interaction types, omit "Unknown table" and "Unknown server"
                        if (['Aggregated data availability', 'API site list', 'Page views', 'View information', 'View metadata', 'View site variable mapping'].includes(interactionType)) {
                            report += `- ${key.replace(/ - Unknown table - Unknown server/g, '').replace(/ - /g, ', ')}: ${count} occurrence${count > 1 ? 's' : ''}<br>`;
                            return;
                        }

                        // General handling for other interaction types
                        report += `- ${key.replace(/ - /g, ', ')}: ${count} occurrence${count > 1 ? 's' : ''}<br>`;

                        // For "API site list" and "Page views", avoid showing Additional Data when table and server are unknown
                        if (interactionType === 'API site list' || interactionType === 'Page views') return;

                        // Show appropriate Additional Data
                        if (interactionType === 'API table list' && additionalData.server) {
                            report += `  Additional Data: ${JSON.stringify({ server: additionalData.server })}<br>`;
                        } else if (additionalData.table || additionalData.server) {
                            report += `  Additional Data: ${JSON.stringify({ table: additionalData.table, server: additionalData.server })}<br>`;
                        }
                    });
            });

        return report; // Returns HTML formatted report
    };


    const formatDate = (date) => {
        return date.split('T')[0];
    };

    const getChartData = (interactionType) => {
        const filteredData = overviewMetrics.detailedInteractions.filter(
            (interaction) => interaction.interactionType === interactionType
        );

        const groupedData = {};

        filteredData.forEach((interaction) => {
            const date = formatDate(interaction.interactionDate);
            const category = interaction.additionalData.serverName || interaction.requestPath || 'Unknown';
            const key = `${date}-${category}`;

            if (!groupedData[key]) {
                groupedData[key] = { count: 0, category, date };
            }
            groupedData[key].count += 1;
        });

        const labels = [...new Set(Object.values(groupedData).map((item) => item.date))].sort();
        const categories = [...new Set(Object.values(groupedData).map((item) => item.category))];
        const datasetMap = {};

        categories.forEach((category) => {
            datasetMap[category] = labels.map(
                (label) => groupedData[`${label}-${category}`]?.count || 0
            );
        });

        const datasets = Object.keys(datasetMap).map((category, index) => ({
            label: category,
            data: datasetMap[category],
            backgroundColor: `rgba(${(index * 70) % 255}, ${(index * 100) % 255}, ${(index * 150) % 255}, 0.6)`,
            borderColor: `rgba(${(index * 70) % 255}, ${(index * 100) % 255}, ${(index * 150) % 255}, 1)`,
            borderWidth: 1,
        }));

        return {
            labels,
            datasets,
        };
    };

    const getTop20ChartData = (interactionType) => {
        const filteredData = overviewMetrics.detailedInteractions.filter(
            (interaction) => interaction.interactionType === interactionType
        );

        const groupedData = {};

        filteredData.forEach((interaction) => {
            const category =
                interactionType === 'toggle_server' ? interaction.additionalData.serverName :
                    interactionType === 'page_view' ? interaction.requestPath :
                        interactionType === 'view_data_availability' || interactionType === 'download_data'
                            ? `${interaction.additionalData.tableName} - ${interaction.additionalData.serverName}`
                            : interaction.requestPath || 'Unknown';

            // Determine the key based on the selected stackBy option
            const stackByValue = (() => {
                switch (stackBy) {
                    case 'sector':
                        return interaction.sector || 'Unknown';
                    case 'userId':
                        return `${interaction.firstName || 'Anonymous'} ${interaction.lastName || ''}`;
                    case 'discipline':
                        return interaction.discipline || 'Unknown';
                    case 'userCountry':
                    case 'country': // Ensure both cases handle country properly
                        return interaction.userCountry || 'Unknown';
                    default:
                        return 'Unknown';
                }
            })();

            const key = `${category}-${stackByValue}`;

            if (!groupedData[key]) {
                groupedData[key] = { count: 0, category, stackBy: stackByValue };
            }
            groupedData[key].count += 1;
        });

        const sortedData = Object.values(groupedData).sort((a, b) => b.count - a.count).slice(0, 20);

        const labels = [...new Set(sortedData.map((item) => item.category))];
        const stackByGroups = [...new Set(sortedData.map((item) => item.stackBy))];
        const datasetMap = {};

        stackByGroups.forEach((group) => {
            datasetMap[group] = labels.map(
                (label) => sortedData.find((item) => item.category === label && item.stackBy === group)?.count || 0
            );
        });

        const datasets = Object.keys(datasetMap).map((group, index) => ({
            label: group,
            data: datasetMap[group],
            backgroundColor: `rgba(${(index * 70) % 255}, ${(index * 100) % 255}, ${(index * 150) % 255}, 0.6)`,
            borderColor: `rgba(${(index * 70) % 255}, ${(index * 100) % 255}, ${(index * 150) % 255}, 1)`,
            borderWidth: 1,
        }));

        return {
            labels,
            datasets,
        };
    };

    return (
        <div className="analytics-dashboard">
            <h2>Analytics Overview (unique hourly interactions)</h2>

            {/* Dropdowns for date selection */}
            <div className="dropdowns-container">
                <select value={range} onChange={(e) => setRange(e.target.value)}>
                    <option value="monthly">By Month</option>
                    <option value="yearly">By Year</option>
                </select>
                <select value={month} onChange={(e) => setMonth(e.target.value)} disabled={range === 'yearly'}>
                    {[...Array(12)].map((_, i) => (
                        <option key={i + 1} value={i + 1}>
                            {new Date(0, i).toLocaleString('default', { month: 'long' })}
                        </option>
                    ))}
                </select>
                <select value={year} onChange={(e) => setYear(e.target.value)}>
                    {[...Array(5)].map((_, i) => (
                        <option key={i} value={new Date().getFullYear() - i}>
                            {new Date().getFullYear() - i}
                        </option>
                    ))}
                </select>
                {/* Dropdown to select stack-by option */}
                <select value={stackBy} onChange={(e) => setStackBy(e.target.value)}>
                    <option value="sector">Sector</option>
                    <option value="userId">User</option>
                    <option value="discipline">Discipline</option>
                    <option value="userCountry">Country</option>
                </select>
                <span className="adjust-text">*(adjust categories for the top 20 charts to use in the interactions types)</span>
            </div>

            {/* General Statistics */}
            <div className="expandable-row">
                <button onClick={() => setIsGeneralExpanded(!isGeneralExpanded)}>
                    <span>
                        <i className="folder-icon">
                            {isGeneralExpanded ? '📂' : '📁'} {/* Open or closed folder */}
                        </i>
                        {isGeneralExpanded ? "Hide General Statistics" : "Show General Statistics"}
                    </span>
                </button>

                {isGeneralExpanded && (
                    <div className="expandable-content">
                        <p>Total website interactions (hourly): {overviewMetrics?.totalVisits ?? 'Loading...'}</p>
                        <p>New users: {overviewMetrics?.newUsers ?? 'Loading...'}</p>
                        <p>Anonymous users (not logged in): {overviewMetrics?.anonymousUsers ?? 'Loading...'}</p>
                        <p>API requests: {overviewMetrics?.apiRequests ?? 'Loading...'}</p>

                        {/* Split downloads into API and Web downloads */}
                        <div className="downloads-section">
                            <p>Total Downloads: {overviewMetrics?.apiDownloads && overviewMetrics?.webDownloads
                                ? overviewMetrics.apiDownloads + overviewMetrics.webDownloads
                                : 'Loading...'}
                            </p>
                            <ul>
                                <li>API Downloads: {overviewMetrics?.apiDownloads ?? 'Loading...'}</li>
                                <li>Web Downloads: {overviewMetrics?.webDownloads ?? 'Loading...'}</li>
                            </ul>
                        </div>
                    </div>
                )}
            </div>


            {/* Top Pages by Interaction */}
            <div className="expandable-row">
                <button onClick={() => setIsTopPagesExpanded(!isTopPagesExpanded)}>
        <span>
            <i className="folder-icon">
                {isTopPagesExpanded ? '📂' : '📁'} {/* Open or closed folder */}
            </i>
            {isTopPagesExpanded ? "Hide top interactions" : "Show top interactions"}
        </span>
                </button>

                {isTopPagesExpanded && (
                    <div className="expandable-content">
                        {/* Separate Web Pages */}
                        <h3>Web Pages</h3>
                        <ul>
                            {overviewMetrics.topPages && overviewMetrics.topPages
                                .filter(page => !page.path.startsWith('/api/')) // Filter out API endpoints
                                .map((page, index) => (
                                    <li key={index}>{page.path} - {page.interactions} Interactions</li>
                                ))
                            }
                        </ul>

                        {/* Separate API Endpoints */}
                        <h3>API Endpoints</h3>
                        <ul>
                            {overviewMetrics.topPages && overviewMetrics.topPages
                                .filter(page => page.path.startsWith('/api/')) // Filter API endpoints
                                .map((page, index) => (
                                    <li key={index}>{page.path} - {page.interactions} Interactions</li>
                                ))
                            }
                        </ul>
                    </div>
                )}
            </div>

             {/*Top Interaction Types */}
            <div className="expandable-row">

                <div className="expandable-row">
                    <button onClick={() => setIsTopInteractionsExpanded(!isTopInteractionsExpanded)}>
                    <span>
                        <i className="folder-icon">
                            {isTopInteractionsExpanded ? '📂' : '📁'}
                        </i>
                        {isTopInteractionsExpanded ? "Hide Interaction Types" : "Show Interaction Types"}
                    </span>
                    </button>

                    {isTopInteractionsExpanded && (
                        <div className="expandable-content">
                            <ul>
                                {overviewMetrics.topInteractionTypes && overviewMetrics.topInteractionTypes.map((interaction, index) => (
                                    <li key={index} className="text-button-row-container">
                                        <div className="interaction-text">
                                            {interactionTypeMapping[interaction.type] || interaction.type} - {interaction.count} Occurrences
                                        </div>

                                        {/* Buttons next to text */}
                                        <div className="button-row-container">
                                            <button className="button-row-item" onClick={() => toggleChartForType(interaction.type)}>
                                                {showChartForType === interaction.type ? "Hide quick chart" : "Quick chart"}
                                            </button>
                                            <button className="button-row-item" onClick={() => toggleWhoTop20ForType(interaction.type)}>
                                                {showWhoTop20ForType === interaction.type ? "Hide top 20 chart" : "Top 20 chart"}
                                            </button>
                                            <button className="button-row-item" onClick={() => openDetailsModal(interaction.type)}>
                                                {expandedInteractionType === interaction.type ? "Hide details" : "Details"}
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                {/* Details Modal */}
                {showDetailsModal && (
                    <div className="modal-analytics">
                        <div className="modal-analytics-content">

                            <div className="macos-window-controls">
                                <div className="macos-button close"
                                     onClick={() => closeDetailsModal()}></div>

                            </div>
                            {/*<button onClick={closeInfoModal} className="close-modal-button">Close</button>*/}


                            {/*<button onClick={closeDetailsModal}>Close</button>*/}
                            <button className="copy-button" onClick={copyDetailsToClipboard}>Copy to Clipboard</button>
                            <div className="modal-analytics-details" dangerouslySetInnerHTML={{ __html: detailsContent }}></div>
                        </div>
                    </div>
                )}


            </div>


            {/* Top Referrals Section */}
            <div className="expandable-row">
                <button onClick={() => setIsTopReferralsExpanded(!isTopReferralsExpanded)}>
                    <span>
                        <i className="folder-icon">
                            {isTopReferralsExpanded ? '📂' : '📁'} {/* Open or closed folder */}
                        </i>
                        {isTopReferralsExpanded ? "Hide Top 100 Referrals" : "Show Top 100 Referrals"}
                    </span>
                </button>

                {isTopReferralsExpanded && (
                    <div className="expandable-content">
                        <ul>
                            {sortedReferrals.map(([referrer, count], index) => (
                                <li key={index}>{referrer} - {count} Referrals</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {/* Expandable map button */}
            <div className="expandable-row">
                <button onClick={() =>  setIsMapExpanded(!isMapExpanded)}>
                    <span>
                        <i className="folder-icon">
                            {isMapExpanded ? '📂' : '📁'} {/* Open or closed folder */}
                        </i>
                        {isMapExpanded ? "Hide map (hourly unique sessions)" : "Show map (hourly unique sessions)"}
                    </span>
                </button>


                {isMapExpanded && (
                    <div className="expandable-content">
                        <div className="leaflet-map-container" style={{ width: "100%", height: "500px" }}>
                            <MapContainer center={[0, 0]} zoom={2} style={{ height: "100%", width: "100%" }}>
                                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                <HeatmapLayer
                                    points={heatMapPoints}
                                    options={{
                                        radius: 25,
                                        blur: 20,
                                        maxZoom: 10,
                                        max: 1.0,
                                    }}
                                />
                            </MapContainer>
                        </div>
                    </div>
                )}
            </div>


            {/* Expandable map button */}
            <div className="expandable-row">
                <button onClick={() =>  setIsMapdailyExpanded(!isMapdailyExpanded)}>
                    <span>
                        <i className="folder-icon">
                            {isMapdailyExpanded ? '📂' : '📁'} {/* Open or closed folder */}
                        </i>
                        {isMapdailyExpanded ? "Hide map (daily unique sessions)" : "Show map (daily unique sessions)"}
                    </span>
                </button>


                {isMapdailyExpanded && (
                    <div className="expandable-content">
                        <div className="leaflet-map-container" style={{ width: "100%", height: "500px" }}>
                            <MapContainer center={[0, 0]} zoom={2} style={{ height: "100%", width: "100%" }}>
                                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                <HeatmapLayer
                                    points={heatMapPoints2}
                                    options={{
                                        radius: 25,
                                        blur: 20,
                                        maxZoom: 10,
                                        max: 1.0,
                                    }}
                                />
                            </MapContainer>
                        </div>
                    </div>
                )}
            </div>

            {/* Generate Report Button */}
            <button className="custom-report-button" onClick={openReportModal}>
                Generate summary report
            </button>


            {/* Chart Modal */}
            {showChartModal && (
                <div className="modal-analytics">
                    <div className="modal-analytics-content">
                        <div className="macos-window-controls">
                            <div className="macos-button close"
                                 onClick={() => closeChartModal()}></div>

                        </div>
                        {/*<button onClick={closeChartModal}>Close</button>*/}
                        {showWhoTop20ForType ? (
                            <Bar data={getTop20ChartData(showWhoTop20ForType)} />
                        ) : (
                            <Bar data={getChartData(showChartForType)} />
                        )}
                    </div>
                </div>
            )}

            {/* Report Modal */}
            {showReportModal && (
                <div className="modal-analytics">
                    <div className="modal-analytics-content">
                        <div className="macos-window-controls">
                            <div className="macos-button close"
                                 onClick={() => closeReportModal()}></div>

                        </div>
                        {/*<button onClick={closeReportModal}>Close</button>*/}
                        <button onClick={copyReportToClipboard}>Copy to Clipboard</button>
                        <div dangerouslySetInnerHTML={{ __html: generateReportText() }} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default Analytics;
