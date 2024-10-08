import React, { useEffect, useState } from "react";
import axios from 'axios';
import { logInteraction } from "../utils/logInteraction";
import Map from "./Map";
import { useNavigate } from "react-router-dom";
import "../universal.css";
import { Bar } from 'react-chartjs-2';
import 'chart.js/auto';

const externalLinks = [
    { id: 1, title: "SAEON", url: "https://www.saeon.ac.za" },
    { id: 2, title: "Ulwazi Node", url: "https://ulwazi.saeon.ac.za" },
    { id: 3, title: "SAEON data catalogue", url: "https://catalogue.saeon.ac.za" },
    { id: 4, title: "Observations Database", url: "https://observations.saeon.ac.za" },
];

const blogPosts = [{
    id: 1,
    title: "Welcome to the SAEON terrestrial observations monitor",
    summary: `Explore real-time environmental data from SAEON’s weather and eddy covariance stations across South Africa through the Terrestrial Observations Monitor. The platform collects and stores raw, unprocessed data directly from the stations. The map displays the locations of these sites. Clicking a site marker reveals detailed information below the map. To access the data, click “Go to data” on the marker or select a site card. Each card offers a summary and quick access to the data. In the Data tab, you’ll find tables showing data availability, key variables, and recent update statuses. You can also download raw datasets for direct analysis. Visual indicators and timestamps keep you informed about the latest updates and data availability.`
}];

const renderSummary = (summary) => {
    return summary.split('\n\n').map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
    ));
};

const RainfallPlot = ({ data }) => {
    // Check if there is any data available
    if (!data || data.length === 0) {
        return <p>No rainfall data available for the last week.</p>;
    }

    // Sort data by timestamp (earliest to latest)
    const sortedData = data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Prepare data for the bar chart
    const chartData = {
        labels: sortedData.map(entry => new Date(entry.timestamp).toLocaleDateString()), // X-axis: Dates
        datasets: [{
            label: 'Rainfall (mm)',
            data: sortedData.map(entry => entry.value), // Y-axis: Rainfall values
            backgroundColor: 'rgba(0, 123, 255, 0.5)',
            borderColor: 'blue',
            borderWidth: 1,
        }]
    };

    const options = {
        responsive: true,
        scales: {
            x: {
                title: {
                    display: true,
                    text: 'Date',
                },
            },
            y: {
                title: {
                    display: true,
                    text: 'Rainfall (mm)',
                },
                beginAtZero: true,
            },
        },
    };

    return <Bar data={chartData} options={options} />;
};

const SiteCard = ({
                      site,
                      highlightedSite,
                      handleSiteHover,
                      handleGoToSummary,
                      handleViewMetadataClick,
                      rainfallData
                  }) => {
    const [imageLoaded, setImageLoaded] = useState(false);

    return (
        <div key={site.id} id={site.name}
             className={`site-card ${highlightedSite === site.name ? "highlighted" : ""}`}
             onMouseEnter={() => handleSiteHover(site.name)}>
            <div className="image-container" style={{ position: 'relative', width: '356px', height: '200px' }}>
                {/* Loading Indicator */}
                {!imageLoaded && (
                    <div className="spinner" style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        zIndex: 1
                    }}>
                        {/* Replace with your spinner component or CSS animation */}
                        Loading...
                    </div>
                )}
                <img
                    src={site.img}
                    alt={site.name}
                    className="site-image"
                    style={{ width: '356px', height: '200px', objectFit: 'contain', borderRadius: '8px' }}
                    onError={(e) => {
                        e.target.src = "https://via.placeholder.com/356x200.png?text=Image+Not+Found";
                        setImageLoaded(true);
                    }}
                    onLoad={() => setImageLoaded(true)}
                />
            </div>

            <h3 className="site-title">{site.name}</h3>
            <p>{site.description}</p>
            <div className="rainfall-plot-container">
                {/* Render the bar chart or no data message */}
                {rainfallData[site.name] ? (
                    <RainfallPlot data={rainfallData[site.name]} />
                ) : (
                    <p>No rainfall data available for the last week.</p>
                )}
            </div>
            <button
                className="home-view-details-button"
                onClick={(e) => {
                    e.stopPropagation();
                    handleGoToSummary(site.name);
                }}
            >
                Go to Data
            </button>
            {site.doi && (
                <button
                    className="home-view-details-button"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleViewMetadataClick(site.doi);
                    }}
                >
                    View Metadata
                </button>
            )}
        </div>
    );
};

const Home = ({ user }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [highlightedSite, setHighlightedSite] = useState(null);
    const [selectedCoordinates, setSelectedCoordinates] = useState(null);
    const [filteredSites, setFilteredSites] = useState([]);
    const [locations, setLocations] = useState([]);
    const [siteMappings, setSiteMappings] = useState([]);
    const [rainfallData, setRainfallData] = useState({});
    const sitesPerPage = 3;
    const navigate = useNavigate();

    useEffect(() => {
        const fetchSiteMappings = async () => {
            try {
                const response = await axios.get('/api/site_mappings');
                const processedSites = response.data.map(site => ({
                    id: site.site_id,
                    name: site.display_name,
                    description: site.description || "No description available.",
                    img: site.image ? `/public/images/${encodeURIComponent(site.image)}` : "https://via.placeholder.com/300x200.png?text=No+Image+Available",
                    // img: site.image ? `/api/image/${site.image}` : "https://via.placeholder.com/300x200.png?text=No+Image+Available",
                    url: site.website_url,
                    doi: site.doi,
                }));

                processedSites.sort((a, b) => {
                    const nameA = a.name ? a.name.toLowerCase() : "";
                    const nameB = b.name ? b.name.toLowerCase() : "";
                    return nameA.localeCompare(nameB);
                });

                setSiteMappings(processedSites);
            } catch (error) {
                console.error('Error fetching site mappings:', error);
            }
        };

        fetchSiteMappings();
    }, []);

    useEffect(() => {
        logInteraction("page_view", { viewport: { width: window.innerWidth, height: window.innerHeight } }, user);

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
    }, [user]);

    useEffect(() => {
        if (locations.length > 0) {
            const matchingSites = siteMappings.filter(site =>
                locations.some(location => location.display_server_name === site.name)
            );
            setFilteredSites(matchingSites);
        }
    }, [locations, siteMappings]);

    useEffect(() => {
        // Fetch rainfall data for each site
        const fetchRainfallData = async () => {
            try {
                const response = await fetch('/api/rainfall-data');
                const data = await response.json();

                // Group data by server name
                const groupedData = data.reduce((acc, entry) => {
                    if (!acc[entry.display_server_name]) acc[entry.display_server_name] = [];
                    acc[entry.display_server_name].push(entry);
                    return acc;
                }, {});

                setRainfallData(groupedData);
            } catch (error) {
                console.error('Error fetching rainfall data:', error);
            }
        };

        fetchRainfallData();
    }, []);

    const indexOfLastSite = currentPage * sitesPerPage;
    const indexOfFirstSite = indexOfLastSite - sitesPerPage;
    const currentSites = filteredSites.slice(indexOfFirstSite, indexOfLastSite);
    const totalPages = Math.ceil(filteredSites.length / sitesPerPage);

    const handleNextPage = () => setCurrentPage(prev => prev < totalPages ? prev + 1 : prev);
    const handlePrevPage = () => setCurrentPage(prev => prev > 1 ? prev - 1 : prev);

    const handleSiteHover = siteName => setHighlightedSite(siteName);
    const handleGoToSummary = siteName => navigate(`/Data?server=${encodeURIComponent(siteName)}`);
    const handleMapSiteSelect = (siteName) => {
        const targetSiteIndex = filteredSites.findIndex(site => site.name === siteName);
        if (targetSiteIndex !== -1) {
            const targetPage = Math.ceil((targetSiteIndex + 1) / sitesPerPage);
            setCurrentPage(targetPage);
            setHighlightedSite(siteName);
        }
    };

    const handleViewMetadataClick = (doiUrl) => {
        logInteraction("view_metadata", { metadata_url: doiUrl }, user);
        window.open(doiUrl, "_blank", "noopener,noreferrer");
    };

    return (
        <div style={{ padding: "10px", fontFamily: "Arial, sans-serif" }}>
            <div className="main-content-grid">
                <div className="blog-container">
                    {blogPosts.map(post => (
                        <div key={post.id} className="site-card2">
                            <h3 className="site-title">{post.title}</h3>
                            {renderSummary(post.summary)}
                        </div>
                    ))}
                </div>
                <div className="map-container">
                    <Map user={user} onSiteHover={handleSiteHover} onMapSiteSelect={handleMapSiteSelect} />
                </div>

                {/*<div className="blog-container">*/}
                {/*    {blogPosts.map(post => (*/}
                {/*        <div key={post.id} className="site-card2">*/}
                {/*            <h3 className="site-title">{post.title}</h3>*/}
                {/*            {renderSummary(post.summary)}*/}
                {/*        </div>*/}
                {/*    ))}*/}
                {/*</div>*/}
            </div>

            <div className="grid-container">
                {currentSites.length > 0 ? (
                    currentSites.map(site => (
                        <SiteCard
                            key={site.id}
                            site={site}
                            highlightedSite={highlightedSite}
                            handleSiteHover={handleSiteHover}
                            handleGoToSummary={handleGoToSummary}
                            handleViewMetadataClick={handleViewMetadataClick}
                            rainfallData={rainfallData}
                        />
                    ))
                ) : (
                    <p>No site cards available.</p>
                )}
                {Array(sitesPerPage - currentSites.length).fill(null).map((_, index) => (
                    <div key={`empty-${index}`} className="site-card empty-card"></div>
                ))}
            </div>

            <div style={{ marginTop: "20px", textAlign: "center" }}>
                <button
                    onClick={handlePrevPage}
                    disabled={currentPage === 1}
                    className="home-pagination-prev-button"
                >
                    Previous
                </button>
                <button
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages}
                    className="home-pagination-next-button"
                >
                    Next
                </button>
            </div>
        </div>
    );
};

export default Home;
