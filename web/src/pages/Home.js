import React, { useEffect, useState } from "react";
import axios from "axios";
import { logInteraction } from "../utils/logInteraction";
import Map from "./Map";
import { useNavigate } from "react-router-dom";
import "../universal.css";
import { Bar } from "react-chartjs-2";
import "chart.js/auto";

const externalLinks = [
    { id: 1, title: "SAEON", url: "https://www.saeon.ac.za" },
    { id: 2, title: "Ulwazi Node", url: "https://ulwazi.saeon.ac.za" },
    { id: 3, title: "SAEON data catalogue", url: "https://catalogue.saeon.ac.za" },
    { id: 4, title: "Observations Database", url: "https://observations.saeon.ac.za" },
];

const blogPosts = [
    {
        id: 1,
        title: "Welcome to the SAEON observations monitor",
        summary: `Explore real-time environmental data from SAEON’s weather and eddy covariance stations across South Africa through the SAEON Observations Monitor. The platform collects and stores raw, unprocessed data directly from the stations. The map displays the locations of these sites. Clicking a site marker reveals detailed information below the map. To access the data, click “Go to data” on the marker or select a site card. Each card offers a summary and quick access to the data. In the Data tab, you’ll find tables showing data availability, key variables, and recent update statuses. You can also download raw datasets for direct analysis. Visual indicators and timestamps keep you informed about the latest updates and data availability.`,
    },
];

const renderSummary = (summary) => {
    return summary.split("\n\n").map((paragraph, index) => <p key={index}>{paragraph}</p>);
};

const formatMetric = (value) => {
    const number = Number(value || 0);
    return new Intl.NumberFormat("en-ZA").format(number);
};

const getCurrentSastYear = () =>
    new Date().toLocaleString("en-ZA", {
        timeZone: "Africa/Johannesburg",
        year: "numeric",
    });

const formatDate = (value) => {
    if (!value) return "Not available";
    return new Date(value).toLocaleDateString("en-ZA", {
        timeZone: "Africa/Johannesburg",
        year: "numeric",
        month: "short",
        day: "2-digit",
    });
};

const formatDateTime = (value) => {
    if (!value) return "Not available";
    return new Date(value).toLocaleString("en-ZA", {
        timeZone: "Africa/Johannesburg",
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
};

const RainfallPlot = ({ data }) => {
    if (!data || data.length === 0) {
        return <p>No rainfall data available for the last week.</p>;
    }

    // Don’t mutate props/state
    const sortedData = [...data].sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );

    const chartData = {
        labels: sortedData.map((entry) => new Date(entry.timestamp).toLocaleDateString()),
        datasets: [
            {
                label: "Rainfall (mm)",
                data: sortedData.map((entry) => entry.value),
                backgroundColor: "rgba(0, 123, 255, 0.5)",
                borderColor: "blue",
                borderWidth: 1,
            },
        ],
    };

    const options = {
        responsive: true,
        scales: {
            x: {
                title: { display: true, text: "Date" },
            },
            y: {
                title: { display: true, text: "Rainfall (mm)" },
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
                      rainfallData,
                  }) => {
    const [imageLoaded, setImageLoaded] = useState(false);

    // Reset spinner if the image src changes
    useEffect(() => setImageLoaded(false), [site.img]);

    return (
        <div
            key={site.id}
            id={site.name}
            className={`site-card ${highlightedSite === site.name ? "highlighted" : ""}`}
            onMouseEnter={() => handleSiteHover(site.name)}
        >
            <div className="image-container">
                {!imageLoaded && (
                    <div
                        className="spinner"
                        style={{
                            position: "absolute",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                            zIndex: 1,
                        }}
                    >
                        Loading...
                    </div>
                )}
                <img
                    key={site.img}
                    src={site.img}
                    alt={site.name}
                    className="site-image"
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                    onError={(e) => {
                        if (!e.currentTarget.dataset.fallbackApplied) {
                            e.currentTarget.dataset.fallbackApplied = "true";
                            e.currentTarget.src = "/images/default-placeholder.png";
                        }
                        setImageLoaded(true);
                    }}
                    onLoad={(e) => {
                        delete e.currentTarget.dataset.fallbackApplied;
                        setImageLoaded(true);
                    }}
                />
            </div>

            <h3 className="site-title">{site.name}</h3>
            <p>{site.description}</p>

            <div className="rainfall-plot-container">
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
    const [selectedCoordinates, setSelectedCoordinates] = useState(null); // kept in case Map uses it
    const [filteredSites, setFilteredSites] = useState([]);
    const [locations, setLocations] = useState([]);
    const [siteMappings, setSiteMappings] = useState([]);
    const [rainfallData, setRainfallData] = useState({});
    const [activityHighlights, setActivityHighlights] = useState(null);
    const [activityYears, setActivityYears] = useState([getCurrentSastYear()]);
    const [selectedActivityYear, setSelectedActivityYear] = useState(getCurrentSastYear());
    const [activityLoading, setActivityLoading] = useState(false);
    const [activityError, setActivityError] = useState("");
    const [monitoringHighlights, setMonitoringHighlights] = useState(null);
    const sitesPerPage = 3;
    const navigate = useNavigate();

    // Helper to normalize image URL (fix: public files are served from root, not /public)
    const normalizeImageUrl = (img) => {
        if (!img) return null;
        if (/^https?:\/\//i.test(img)) return img;
        // If you serve images from /public/images/<file>, the correct URL is /images/<file>
        return `/images/${encodeURIComponent(img)}`;
        // If you want API-served images instead, use:
        // return `/api/image/${encodeURIComponent(img)}`;
    };

    useEffect(() => {
        const fetchSiteMappings = async () => {
            try {
                const response = await axios.get("/api/site_mappings");
                const processedSites = response.data.map((site) => ({
                    id: site.site_id,
                    name: site.display_name,
                    description: site.description || "No description available.",
                    img:
                        normalizeImageUrl(site.image) ||
                        "https://via.placeholder.com/300x200.png?text=No+Image+Available",
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
                console.error("Error fetching site mappings:", error);
            }
        };

        fetchSiteMappings();
    }, []);

    // Optional: Preload images once site list is known (smoothens first render)
    useEffect(() => {
        if (siteMappings.length === 0) return;
        const toPreload = siteMappings.map((s) => s.img).filter(Boolean);
        toPreload.forEach((src) => {
            const i = new Image();
            i.src = src;
        });
    }, [siteMappings]);

    useEffect(() => {
        logInteraction(
            "page_view",
            { viewport: { width: window.innerWidth, height: window.innerHeight } },
            user
        );

        const fetchLocations = async () => {
            try {
                const response = await fetch("/api/summary_table/locations");
                const data = await response.json();
                setLocations(data);
            } catch (error) {
                console.error("Error fetching locations:", error);
            }
        };

        fetchLocations();
    }, [user]);

    useEffect(() => {
        if (locations.length > 0) {
            const matchingSites = siteMappings.filter((site) =>
                locations.some((location) => location.display_server_name === site.name)
            );
            setFilteredSites(matchingSites);
        }
    }, [locations, siteMappings]);

    useEffect(() => {
        const fetchRainfallData = async () => {
            try {
                const response = await fetch("/api/rainfall-data");
                const data = await response.json();

                // Group by server name
                const groupedData = data.reduce((acc, entry) => {
                    if (!acc[entry.display_server_name]) acc[entry.display_server_name] = [];
                    acc[entry.display_server_name].push(entry);
                    return acc;
                }, {});

                setRainfallData(groupedData);
            } catch (error) {
                console.error("Error fetching rainfall data:", error);
            }
        };

        fetchRainfallData();
    }, []);

    useEffect(() => {
        const fetchActivityYears = async () => {
            try {
                const response = await axios.get("/api/public/analytics/years");
                const years = (response.data?.years || [])
                    .map((year) => String(year))
                    .filter((year) => /^\d{4}$/.test(year));

                if (years.length > 0) {
                    setActivityYears(years);
                    setSelectedActivityYear((currentYear) =>
                        years.includes(currentYear) ? currentYear : years[0]
                    );
                }
            } catch (error) {
                console.error("Error fetching public analytics years:", error);
            }
        };

        fetchActivityYears();
    }, []);

    useEffect(() => {
        const fetchActivityHighlights = async () => {
            setActivityLoading(true);
            setActivityError("");
            try {
                const response = await axios.get(`/api/public/analytics/highlights?year=${selectedActivityYear}`);
                setActivityHighlights(response.data || null);
            } catch (error) {
                console.error("Error fetching public analytics highlights:", error);
                setActivityHighlights(null);
                setActivityError("Activity metadata is temporarily unavailable.");
            } finally {
                setActivityLoading(false);
            }
        };

        fetchActivityHighlights();
    }, [selectedActivityYear]);

    useEffect(() => {
        const fetchMonitoringHighlights = async () => {
            try {
                const response = await axios.get("/api/public/monitoring/highlights");
                setMonitoringHighlights(response.data || null);
            } catch (error) {
                console.error("Error fetching public monitoring highlights:", error);
                setMonitoringHighlights(null);
            }
        };

        fetchMonitoringHighlights();
    }, []);

    const indexOfLastSite = currentPage * sitesPerPage;
    const indexOfFirstSite = indexOfLastSite - sitesPerPage;
    const currentSites = filteredSites.slice(indexOfFirstSite, indexOfLastSite);
    const totalPages = Math.ceil(filteredSites.length / sitesPerPage);

    const handleNextPage = () => setCurrentPage((prev) => (prev < totalPages ? prev + 1 : prev));
    const handlePrevPage = () => setCurrentPage((prev) => (prev > 1 ? prev - 1 : prev));

    const handleSiteHover = (siteName) => setHighlightedSite(siteName);

    const handleGoToSummary = (siteName) => {
        navigate(`/Data?server=${encodeURIComponent(siteName)}`);
    };

    const handleMapSiteSelect = (siteName) => {
        const targetSiteIndex = filteredSites.findIndex((site) => site.name === siteName);
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

    const activityCards = [
        {
            label: "Total interactions",
            value: activityHighlights?.totalInteractions,
            detail: "Website, data, and public API interactions recorded in this reporting year.",
            meta: `${formatMetric(activityHighlights?.allTimeInteractions)} total interactions since tracking began.`,
        },
        {
            label: "Downloads",
            value: activityHighlights?.downloads,
            detail: `${formatMetric(activityHighlights?.webDownloads)} web downloads and ${formatMetric(activityHighlights?.apiDownloads)} API CSV exports this year.`,
            meta: `${formatMetric(activityHighlights?.allTimeDownloads)} total download starts recorded.`,
        },
        {
            label: "Public API requests",
            value: activityHighlights?.apiRequests,
            detail: "Programmatic access through public status, metadata, JSON data, and download endpoints.",
            meta: `${formatMetric(activityHighlights?.allTimeApiRequests)} API requests since tracking began.`,
        },
        {
            label: "Mapped public sites",
            value: locations.length,
            detail: `${formatMetric(locations.length)} public site locations are visible on the map.`,
            meta: `${formatMetric(activityHighlights?.activeSites)} sites have public data across ${formatMetric(activityHighlights?.datasets)} site-table datasets.`,
        },
    ];

    const apiExamples = [
        {
            label: "Open usage snapshot",
            href: `/api/public/analytics/highlights?year=${selectedActivityYear}`,
            code: `/api/public/analytics/highlights?year=${selectedActivityYear}`,
            detail: "No login required. Returns public usage totals for the selected year.",
        },
        {
            label: "Signed-in site list",
            href: "/api/v1/sites",
            code: "/api/v1/sites",
            detail: "Login required. Returns site names and a next link for table lookup.",
        },
        {
            label: "Signed-in table list",
            href: "/api/v1/tables?serverName=Benfontein%20AWS",
            code: "/api/v1/tables?serverName=Benfontein%20AWS",
            detail: "Login required. Shows available tables, date ranges, and row counts for an example site.",
        },
        {
            label: "Signed-in JSON data",
            href: "/api/v1/data?serverName=Benfontein%20AWS&tableName=daily&startDate=2026-08-01&endDate=2026-08-13&limit=1000",
            code: "/api/v1/data?...",
            detail: "Login required. Returns paginated JSON rows for a bounded date window.",
        },
    ];

    return (
        <div style={{ padding: "10px", fontFamily: "Arial, sans-serif" }}>
            <div className="main-content-grid">
                <div className="blog-container">
                    {blogPosts.map((post) => (
                        <div key={post.id} className="site-card2">
                            <h3 className="site-title">{post.title}</h3>
                            {renderSummary(post.summary)}
                        </div>
                    ))}
                </div>

                <div className="map-container">
                    <Map
                        user={user}
                        onSiteHover={handleSiteHover}
                        onMapSiteSelect={handleMapSiteSelect}
                        locations={locations}
                    />
                </div>
            </div>

            <div className="grid-container">
                {currentSites.length > 0 ? (
                    currentSites.map((site) => (
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

                {Array(Math.max(0, sitesPerPage - currentSites.length))
                    .fill(null)
                    .map((_, index) => (
                        <div key={`empty-${index}`} className="site-card empty-card"></div>
                    ))}
            </div>

            <div style={{ marginTop: "20px", textAlign: "center" }}>
                <button onClick={handlePrevPage} disabled={currentPage === 1} className="home-pagination-prev-button">
                    Previous
                </button>
                <button
                    onClick={handleNextPage}
                    disabled={currentPage === totalPages || totalPages === 0}
                    className="home-pagination-next-button"
                >
                    Next
                </button>
            </div>

            <section className="home-highlights-section" aria-label="Platform activity highlights">
                <div className="home-highlights-copy">
                    <div>
                        <span className="home-kicker">Platform metadata</span>
                        <h2>How people are using the monitor</h2>
                        <p>
                            Public usage metadata for the selected calendar year. Full analytics remain available from the
                            Analytics tab for signed-in users.
                        </p>
                    </div>
                    <label className="home-year-filter">
                        <span>Year</span>
                        <select
                            value={selectedActivityYear}
                            onChange={(event) => setSelectedActivityYear(event.target.value)}
                            aria-label="Select analytics year"
                        >
                            {activityYears.map((year) => (
                                <option key={year} value={year}>
                                    {year}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                <div className="home-activity-metadata" aria-label="Activity metadata">
                    <span>{activityLoading ? "Refreshing..." : `Reporting year ${activityHighlights?.year || selectedActivityYear}`}</span>
                    <span>{formatDate(activityHighlights?.startDate)} to {formatDate(activityHighlights?.endDate)}</span>
                    <span>Generated {formatDateTime(activityHighlights?.generatedAt)} SAST</span>
                    {activityError && <strong>{activityError}</strong>}
                </div>

                <div className="home-highlights-grid">
                    {activityCards.map((card) => (
                        <article className="home-highlight-card" key={card.label}>
                            <span>{card.label}</span>
                            <strong>{activityLoading ? "..." : formatMetric(card.value)}</strong>
                            <p>{card.detail}</p>
                            <small>{card.meta}</small>
                        </article>
                    ))}
                </div>
            </section>

            <section className="home-monitoring-section" aria-label="Live API and long term monitoring highlights">
                <div className="home-monitoring-panel home-monitoring-panel--intro">
                    <span className="home-kicker">Live APIs and long-term monitoring</span>
                    <h2>From field stations to usable public data</h2>
                    <p>
                        The monitor tracks incoming weather and eddy covariance observations, reconciles them into public
                        site datasets, and exposes the same live archive through the website and public API.
                    </p>
                    <div className="home-monitoring-actions">
                        <button className="home-view-details-button" onClick={() => navigate("/Data")}>
                            Explore Data
                        </button>
                        <button className="home-read-more-button" onClick={() => navigate("/api-reference")}>
                            API Reference
                        </button>
                    </div>
                </div>

                <div className="home-monitoring-panel home-monitoring-panel--metrics">
                    <div className="home-monitoring-metric">
                        <span>Available data entries</span>
                        <strong>{formatMetric(monitoringHighlights?.totalDataValues)}</strong>
                        <p>Publicly mapped entries available through the Data tab.</p>
                    </div>
                    <div className="home-monitoring-metric">
                        <span>Full raw archive</span>
                        <strong>{formatMetric(monitoringHighlights?.totalRawValues)}</strong>
                        <p>Raw rows retained for long-term monitoring and processing.</p>
                    </div>
                    <div className="home-monitoring-metric">
                        <span>Public variables</span>
                        <strong>{formatMetric(monitoringHighlights?.publicVariables)}</strong>
                        <p>Mapped variables across {formatMetric(monitoringHighlights?.publicDatasets)} public datasets.</p>
                    </div>
                    <div className="home-monitoring-metric">
                        <span>Archive range</span>
                        <strong>{formatDate(monitoringHighlights?.archiveStart)}</strong>
                        <p>Through {formatDate(monitoringHighlights?.archiveEnd)}.</p>
                    </div>
                </div>

                <div className="home-monitoring-panel home-monitoring-panel--status">
                    <div>
                        <span className="home-kicker">Freshness</span>
                        <h3>Latest sync status</h3>
                    </div>
                    <dl className="home-status-list">
                        <div>
                            <dt>Data sync</dt>
                            <dd>{formatDateTime(monitoringHighlights?.lastSynced)} SAST</dd>
                        </div>
                        <div>
                            <dt>Availability sync</dt>
                            <dd>{formatDateTime(monitoringHighlights?.lastDataAvailabilitySyncTime)} SAST</dd>
                        </div>
                    </dl>
                </div>

                <div className="home-monitoring-panel home-monitoring-panel--api">
                    <span className="home-kicker">API access</span>
                    <h3>Start open, sign in for data</h3>
                    <p>
                        Open public status and usage examples without an account. Sign in to list datasets, inspect
                        date ranges, and download CSV extracts so API use is recorded against a user account.
                    </p>
                    <div className="home-api-example-list">
                        {apiExamples.map((example) => (
                            <a
                                key={example.href}
                                href={example.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="home-api-example"
                            >
                                <span>{example.label}</span>
                                <code>{example.code}</code>
                                <small>{example.detail}</small>
                            </a>
                        ))}
                    </div>
                    <button className="home-read-more-button" onClick={() => navigate("/api-reference")}>
                        View API Reference
                    </button>
                </div>

                <div className="home-monitoring-panel home-monitoring-panel--recent">
                    <span className="home-kicker">Recently updated</span>
                    <h3>Latest dataset windows</h3>
                    <ol>
                        {(monitoringHighlights?.recentlyUpdated || []).map((item) => (
                            <li key={`${item.site}-${item.table}`}>
                                <span>{item.site}</span>
                                <small>{item.table}</small>
                                <strong>{formatDate(item.latestDate)}</strong>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>
        </div>
    );
};

export default Home;
