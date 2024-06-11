import React, {useEffect, useRef, useState} from 'react';
import './ScrollableTable.css';

import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import {
    endOfMonth,
    endOfToday,
    endOfWeek,
    endOfYear,
    endOfYesterday,
    startOfMonth,
    startOfToday,
    startOfWeek,
    startOfYear,
    startOfYesterday,
    subMonths,
    subWeeks,
    subYears
} from 'date-fns';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faFolder as farFolder, faFolderOpen as farFolderOpen} from "@fortawesome/free-regular-svg-icons";
import {faChartBar, faCheck, faExclamation, faQuestion, faTable, faTimes} from "@fortawesome/free-solid-svg-icons";
import GenericData from "./GenericData2";
import MyHeatMap from './MyHeatMap';
import CustomModal from './CustomModal';
import ModalContent from './ModalContent';

const formatDate = (date) => {
    // Parse the UTC date string
    const utcDate = new Date(date);

    // Convert UTC to South African Standard Time (SAST) which is UTC + 2 hours
    const sastDate = new Date(utcDate.getTime() - (2 * 60 * 60 * 1000));

    // Format the date in 'YYYY-MM-DDTHH:mm:ss' format
    const year = sastDate.getFullYear();
    const month = String(sastDate.getMonth() + 1).padStart(2, '0'); // getMonth() returns 0-11
    const day = String(sastDate.getDate()).padStart(2, '0');
    const hours = String(sastDate.getHours()).padStart(2, '0');
    const minutes = String(sastDate.getMinutes()).padStart(2, '0');
    const seconds = String(sastDate.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
};

const ScrollableTable2 = () => {
    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState(null);
    // Get today's date
    const today = new Date();
    // Calculate the date 30 days before today
    const thirtyDaysBefore = new Date();
    thirtyDaysBefore.setDate(today.getDate() - 30);
    // Set the initial state for startDate and endDate
    const [startDate, setStartDate] = useState(thirtyDaysBefore);
    const [endDate, setEndDate] = useState(today);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const closeCustomModal = () => {
        setIsCustomModalOpen(false);
    };
    const getQuarterDates = (quarterNumber) => {
        const today = new Date();
        let financialYearStart = today.getFullYear();

        // If current month is before April, the financial year started last year
        if (today.getMonth() < 3) {
            financialYearStart -= 1;
        }

        switch (quarterNumber) {
            case 1: // April - June
                return {startDate: new Date(financialYearStart, 3, 1), endDate: new Date(financialYearStart, 5, 30)};
            case 2: // July - September
                return {startDate: new Date(financialYearStart, 6, 1), endDate: new Date(financialYearStart, 8, 30)};
            case 3: // October - December
                return {startDate: new Date(financialYearStart, 9, 1), endDate: new Date(financialYearStart, 11, 31)};
            case 4: // January - March (next year)
                return {
                    startDate: new Date(financialYearStart + 1, 0, 1),
                    endDate: new Date(financialYearStart + 1, 2, 31)
                };
            default:
                return {startDate: new Date(), endDate: new Date()};
        }
    }
// Date range selection handlers
    const handleSelectYesterday = () => handleDateRangeSelection(startOfYesterday(), endOfYesterday());
    const handleSelectThisWeek = () => handleDateRangeSelection(startOfWeek(new Date()), endOfWeek(new Date()));
    const handleSelectLastWeek = () => handleDateRangeSelection(startOfWeek(subWeeks(new Date(), 1)), endOfWeek(subWeeks(new Date(), 1)));
    const handleSelectThisMonth = () => handleDateRangeSelection(startOfMonth(new Date()), endOfMonth(new Date()));
    const handleSelectLastMonth = () => handleDateRangeSelection(startOfMonth(subMonths(new Date(), 1)), endOfMonth(subMonths(new Date(), 1)));
    const handleSelectLastYear = () => handleDateRangeSelection(startOfYear(subYears(new Date(), 1)), endOfYear(subYears(new Date(), 1)));
    const handleSelectThisYear = () => handleDateRangeSelection(startOfYear(subYears(new Date(), 0)), endOfYear(subYears(new Date(), 0)));
    const handleSelectQuarter = (quarterNumber) => {
        const {startDate, endDate} = getQuarterDates(quarterNumber);
        handleDateRangeSelection(startDate, endDate);
    };
    const handleDateRangeSelection = (start, end) => {
        const today = new Date();
        today.setHours(23, 59, 59, 999); // Set to the end of today

        // Ensure end date is not after today
        const adjustedEndDate = new Date(Math.min(end, today));

        setStartDate(start);
        setEndDate(adjustedEndDate);
        // setEndDate(end);
    };

    const handleDropdownClick = () => {
        const isOpening = !dropdownOpen;
        setDropdownOpen(isOpening);

        // Disable body scroll when dropdown is open
        document.body.style.overflow = isOpening ? 'hidden' : 'auto';
    };
    const generateEndpoints = (baseURL, intervals) => {
        const obj = {};

        for (let interval of intervals) {
            let lowercaseInterval = interval.toLowerCase().replace(/\s/g, '_');
            // Capitalized interval is the same as formatted, but with the first letter capitalized
            let capitalizedInterval = lowercaseInterval;//.charAt(0).toUpperCase() + lowercaseInterval.slice(1);

            obj[capitalizedInterval] = {
                data: `${baseURL}/${lowercaseInterval}-data`,
                metadata: `${baseURL}/${lowercaseInterval}-metadata`,
                count: `${baseURL}/${lowercaseInterval}-count`,
                csv: `${baseURL}/download-${lowercaseInterval}-csv`
            }
        }
        // console.log(obj);
        return obj;
    }
    const sites = [
        {
            name: "Benfontein AWS",
            intervals: ["Daily", "Hourly"]
        },
        {
            name: "Besemfontein AWS",
            intervals: ["Daily", "Hourly"]
        },
        {
            name: "Constantiaberg AWS",
            intervals: ["Daily", "Hourly"]
        },
        {
            name: "Vasi Science Centre AWS",
            intervals: ["Daily", "Hourly"]
        }




    ];


    const siteIntervalMappings = {
        "Besemfontein AWS": {
            dbName: "cr1000_besemfontein",
            intervals: {
                "Daily": "daily",
                "Hourly": "hourly",
                // Add other interval mappings specific to CR1000 Besemfontein
            }
        },
        "Benfontein AWS": {
            dbName: "saeon_arid_aws3_benfontein",
            intervals: {
                "Daily": "table3",
                "Hourly": "table2",
                // Add other interval mappings specific to CR1000 Besemfontein
            }
        },
        "Constantiaberg AWS": {
            dbName: "constantiaberg",
            intervals: {
                "Daily": "table2",
                "Hourly": "table1",
                // Add other interval mappings specific to CR1000 Besemfontein
            }
        },
        "Vasi Science Centre AWS": {
            dbName: "cr1000_vasi_science_centre_aws",
            intervals: {
                "Daily": "daily",
                "Hourly": "hourly",
                // Add other interval mappings specific to CR1000 Besemfontein
            }
        },

        // Add mappings for other sites
    };
    // const baseUrl = "http://localhost:3001"; // Define base URL including port

    const siteConfigurations = {
        "Besemfontein AWS": {
            dbName: "cr1000_besemfontein",
            intervals: {
                "Daily": { dbInterval: "daily", fields: { "Time":"time","Rain (mm)": "rain_mm_tot","Min temp (degree C)": "airtctop_min", "Max temp (degree C)": "airtctop_max","Max relative humidity (%)":"rh_top_max","Min relative humidity (%)":"rh_top_min","Max wind speed (m/s)":"ws_ms_max","Wind speed (m/s)":"ws_ms_avg"}},
                "Hourly": { dbInterval: "hourly", fields: { "Time":"time","Rain (mm)": "rain_mm_tot","Temp (degree C)":"airtctop_avg","Relative humidity (%)":"rh_top","Wind speed (m/s)":"ws_ms_avg","Wind direction (degrees)":"winddir" } }
                // Add other interval and field mappings here
            }
        },
        "Benfontein AWS": {
            dbName: "saeon_arid_aws3_benfontein",
            intervals: {
                "Daily": { dbInterval: "table3", fields: { "Time":"time","Rain (mm)": "rain_mm_tot","Min temp (degree C)": "airtc_min", "Max temp (degree C)": "airtc_max","Max relative humidity (%)":"rh_max","Min relative humidity (%)":"rh_min","Max wind speed (m/s)":"ws_ms_max","Wind speed (m/s)":"ws_ms_s_wvt"}},
                "Hourly": { dbInterval: "table2", fields: { "Time":"time",
                        "Rain (mm)": "rain_mm_tot",
                        "Temp (degree C)":"airtc_avg",
                        "Relative humidity (%)":"rh",
                        "Wind speed (m/s)":"ws_ms_s_wvt",
                        "Wind direction (degrees)":"winddir_d1_wvt" } }

                // Add other interval and field mappings here
            }
        },
        "Constantiaberg AWS": {
            dbName: "constantiaberg",
            intervals: {
                "Daily": { dbInterval: "table2", fields: { "Time":"time",
                        "Rain (mm)": "rain_tot",
                        "Min temp (degree C)": "airtc_min",
                        "Max temp (degree C)": "airtc_max",
                        "Max relative humidity (%)":"rh_max",
                        "Min relative humidity (%)":"rh_min",
                        "Max wind speed (m/s)":"ws_ms_max",
                        "Wind speed (m/s)":"ws_ms_s_wvt"}},
                "Hourly": { dbInterval: "table1", fields: { "Time":"time",
                        "Rain (mm)": "rain_tot",
                        "Temp (degree C)":"airtc_avg",
                        "Relative humidity (%)":"rh",
                        "Wind speed (m/s)":"ws_ms_s_wvt",
                        "Wind direction (degrees)":"winddir_d1_wvt" } }
            }
        },
        "Vasi Science Centre AWS": {
            dbName: "cr1000_vasi_science_centre_aws",
            intervals: {
                "Daily": { dbInterval: "daily", fields: { "Time":"time",
                        "Rain (mm)": "rain_mm_tot",
                        "Min temp (degree C)": "airtc_min",
                        "Max temp (degree C)": "airtc_max",
                        "Max relative humidity (%)":"rh_max",
                        "Min relative humidity (%)":"rh_min",
                        "Max wind speed (m/s)":"ws_ms_max",
                        "Wind speed (m/s)":"ws_ms_s_wvt"}},
                "Hourly": { dbInterval: "hourly", fields: { "Time":"time",
                        "Rain (mm)": "rain_mm_tot",
                        "Temp (degree C)":"airtc_avg",
                        "Relative humidity (%)":"rh",
                        "Wind speed (m/s)":"ws_ms_s_wvt",
                        "Wind direction (degrees)":"winddir_d1_wvt" } }
            }
        }
        // Add other site mappings here
    };
    const handleSpecialAction = async (siteName, intervalDisplayName) => {
        // showNotification("Loading data...", "loading");
        const siteConfig = siteConfigurations[siteName];
        if (!siteConfig) {
            console.error("Site configuration not found for", siteName);
            return;
        }
        const intervalConfig = siteConfig.intervals[intervalDisplayName];
        if (!intervalConfig) {
            console.error("Interval configuration not found for", intervalDisplayName, "in", siteName);
            return;
        }
        // Assuming intervalConfig.fields is an object where values are the actual database field names
        let selectedFields = Object.values(intervalConfig.fields).join(',');
        let headers = Object.keys(intervalConfig.fields).join(','); // User-friendly names for CSV headers
        // Use this map to replace keys in the data object later
        const dbFieldToUserFriendlyNameMap = intervalConfig.fields;


        const formattedStartDate = startDate.toISOString().split('T')[0];
        const newEndDate = new Date(endDate);
        newEndDate.setDate(newEndDate.getDate() + 1);
        const formattedEndDate = newEndDate.toISOString().split('T')[0];


        const url = `/api/${siteConfig.dbName}/${intervalConfig.dbInterval}/check2?startDate=${formattedStartDate}&endDate=${formattedEndDate}&includedFields=${encodeURIComponent(selectedFields)}`;


        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Failed to fetch data');
            }
            const rawData = await response.json();

            // Transform summary to use user-friendly names
            const transformedSummary = {};
            Object.entries(rawData.summary).forEach(([dbFieldName, stats]) => {
                const userFriendlyName = Object.keys(dbFieldToUserFriendlyNameMap).find(key => dbFieldToUserFriendlyNameMap[key] === dbFieldName);
                if (userFriendlyName) {
                    transformedSummary[userFriendlyName] = stats;
                }
            });

            // Transform availabilityData to use user-friendly names
            const transformedAvailabilityData = rawData.availabilityData.map(dayData => {
                const transformedVariables = {};
                Object.entries(dayData.variables).forEach(([dbFieldName, value]) => {
                    const userFriendlyName = Object.keys(dbFieldToUserFriendlyNameMap).find(key => dbFieldToUserFriendlyNameMap[key] === dbFieldName);
                    if (userFriendlyName) {
                        transformedVariables[userFriendlyName] = value;
                    }
                });
                return { ...dayData, variables: transformedVariables };
            });

            // Prepare the data object to pass to ModalContent, including both the transformed summary and availabilityData
            const data = {
                availabilityData: transformedAvailabilityData,
                summary: transformedSummary
            };

            // Calculate average availability using the transformedSummary
            let totalPercentageMissing = 0;
            let variableCount = 0;
            Object.values(transformedSummary).forEach(value => {
                totalPercentageMissing += value.percentageMissing;
                variableCount++;
            });
            const averageAvailability = variableCount > 0 ? 100 - (totalPercentageMissing / variableCount) : 0;

            // Set the modal content with the transformed data
            setModalContent(
                <ModalContent
                    data={data} // Pass the fully transformed data
                    siteName={siteConfig.dbName}
                    interval={intervalConfig.dbInterval}
                    averageAvailability={averageAvailability}
                />
            );

            setIsCustomModalOpen(true);
        } catch (error) {
            console.error('Error in special action for', siteConfig.dbName, intervalConfig.dbInterval, ':', error);
        }
    };

    const handleModalOpen = (siteName, intervalDisplayName, viewType) => {
        const siteConfig = siteConfigurations[siteName];
        if (!siteConfig) {
            console.error("Site configuration not found for", siteName);
            return;
        }

        const intervalConfig = siteConfig.intervals[intervalDisplayName];
        if (!intervalConfig) {
            console.error("Interval configuration not found for", intervalDisplayName, "in", siteName);
            return;
        }
        // Assuming intervalConfig.fields is an object where values are the actual database field names
        let selectedFields = Object.values(intervalConfig.fields).join(',');
        let headers = Object.keys(intervalConfig.fields).join(','); // User-friendly names for CSV headers
        const endpoints = {
            data: `/api/${siteConfig.dbName}/${intervalConfig.dbInterval}-data2?fields=${encodeURIComponent(selectedFields)}`,
            metadata: `/api/${siteConfig.dbName}/${intervalConfig.dbInterval}-metadata2?filter=${encodeURIComponent(selectedFields)}`,
            count: `/api/${siteConfig.dbName}/${intervalConfig.dbInterval}-count2`,
            csv: `/api/${siteConfig.dbName}/download2-${intervalConfig.dbInterval}-csv?fields=${encodeURIComponent(selectedFields)}&headers=${encodeURIComponent(headers)}`
        };


        // console.log("Endpoints:", endpoints); // Log the endpoints for verification
        selectedFields = Object.keys(intervalConfig.fields || {});

        // Generate the modal content using these endpoints
        let contentComponent = (
            <GenericData
                dataEndpoint={endpoints.data}
                metadataEndpoint={endpoints.metadata}
                countEndpoint={endpoints.count}
                csvDownloadEndpoint={endpoints.csv}
                selectedFields={selectedFields} // Pass selected fields to GenericData
                fieldMappings={intervalConfig.fields} // Pass the entire fields object
                type={viewType}
            />
        );

        setModalData({ siteName, interval: intervalConfig.dbInterval, viewType, fieldMappings: intervalConfig.fields });
        setModalContent(contentComponent);
        setIsModalOpen(true);
    };
    const mapIntervalToAPIFormat = (interval) => {

        return interval.toLowerCase().replace(/\s/g, '_');
        // }/
    };

    const handleModalClose = () => {
        setIsModalOpen(false);
        setModalContent(null);
    };
    const [activeSite, setActiveSite] = useState(null); // Tracks which site is currently expanded

    const toggleActiveSite = (siteName) => {
        const isActive = activeSite === siteName;
        setActiveSite(activeSite === siteName ? null : siteName); // Toggles the active site
        // Fetch last update date whenever a site is expanded
        if (!isActive) {
            fetchLastUpdateForSite(siteName);
        }
    };
    const categorizeDate = (dateString) => {

        if (!dateString) {
            console.error('Invalid or missing date string');
            return {category: 'Unknown', icon: faQuestion, badgeColor: 'gray-badge'};
        }

        const lastUpdate = new Date(dateString);
        if (isNaN(lastUpdate)) {
            console.error('Invalid date:', dateString);
            return {category: 'Unknown', icon: faQuestion, badgeColor: 'gray-badge'};
        }


        const now = new Date();
        const difference = now.getTime() - lastUpdate.getTime(); // difference in milliseconds

        const oneDay = 24 * 60 * 60 * 1000; // milliseconds in a day
        const oneWeek = 7 * oneDay; // milliseconds in a week
        const twoWeeks = 2 * oneWeek; // milliseconds in two weeks
        const threeWeeks = 3 * oneWeek; // milliseconds in three weeks
        const oneMonth = 30 * oneDay; // milliseconds in a month
        const oneYear = 365 * oneDay; // milliseconds in a year

        const formattedDate = formatDate(lastUpdate);

        if (difference < oneDay) {
            return {category: `Within a day (${formattedDate})`, icon: faCheck, badgeColor: 'green-badge'};
        } else if (difference < oneWeek) {
            return {category: `Within a Week (${formattedDate})`, icon: faCheck, badgeColor: 'blue-badge'};
        } else if (difference < twoWeeks) {
            return {category: `Updated Last Week (${formattedDate})`, icon: faCheck, badgeColor: 'dark-blue-badge'};
        } else if (difference < threeWeeks) {
            return {category: `Updated 2 Weeks Ago (${formattedDate})`, icon: faCheck, badgeColor: 'yellow-badge'};
        } else if (difference < oneMonth) {
            return {
                category: `Updated 3 Weeks Ago (${formattedDate})`,
                icon: faExclamation,
                badgeColor: 'orange-badge'
            };
        } else if (difference < oneYear) {
            return {category: `Updated This Year (${formattedDate})`, icon: faExclamation, badgeColor: 'red-badge'};
        } else {
            return {
                category: `Updated Over a Year Ago (${formattedDate})`,
                icon: faTimes,
                badgeColor: 'dark-red-badge'
            };
        }
    };

    const mapToDBFormat = (siteName, interval) => {
        const siteMapping = siteIntervalMappings[siteName];
        if (!siteMapping) {
            console.error('Site mapping not found for:', siteName);
            return null; // or some default handling
        }

        const intervalDBName = siteMapping.intervals[interval];
        if (!intervalDBName) {
            console.error('Interval mapping not found for:', interval, 'in site:', siteName);
            return null; // or some default handling
        }

        return `${siteMapping.dbName}.${intervalDBName}`;
    };

    const fetchLastUpdateForSite = async (siteName) => {

        const site = sites.find(s => s.name === siteName);
        if (!site) {
            console.error('Site not found:', siteName);
            return;
        }

        // Ensure lastUpdateDates state is updated asynchronously for each interval
        let updates = {};

        for (const interval of site.intervals) {
            const dbTableName = mapToDBFormat(siteName, interval);
            // console.log(dbTableName);
            if (!dbTableName) {
                console.log(`Skipping fetch for ${siteName} - ${interval} due to mapping issues.`);
                continue; // Skip this interval if mapping fails
            }
            const url = `/api/last-update-date/${dbTableName}`;

            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                const dateCategory = categorizeDate(data.lastupdatetime);

                // Prepare updates for batch state update
                const siteKey = `${site.name}-${interval}`;
                updates[siteKey] = dateCategory;

            } catch (error) {
                console.error('Error fetching last update date for', siteName, interval, error);
            }
        }

        // Batch update lastUpdateDates state after all fetches are completed
        setLastUpdateDates(prevDates => ({
            ...prevDates,
            ...updates
        }));
    };


    // Assuming you have state for managing modal visibility and data
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalData, setModalData] = useState({ siteName: '', interval: '' });


    const [lastUpdateDates, setLastUpdateDates] = useState({});

    return (
        <div className="scrollable-table-container">
            <div className="date-controls-container">
                <div className="controls-header">
                    <h2>Select date parameters for reporting</h2>
                    <p className="date-instructions">
                        Choose a predefined (dropdown) or custom (date pickers) date range for site-specific or
                        station-wide data availability reports using the data availability buttons.
                    </p>
                </div>
                <div className="controls-content">
                    <div className="dropdown-container">
                        <button className="dropdown-button" onClick={handleDropdownClick}>
                            {dropdownOpen ? "Select Date Range ▲" : "Select Date Range ▼"}
                        </button>
                        {dropdownOpen && (
                            <div className="dropdown-menu">
                                {/*<div className="dropdown-menu">*/}
                                <button className="dropdown-item" onClick={() => {
                                    handleDateRangeSelection(startOfToday(), endOfToday());
                                    handleDropdownClick();
                                }}>Today
                                </button>
                                <button className="dropdown-item" onClick={() => {
                                    handleSelectYesterday();
                                    handleDropdownClick();
                                }}>Yesterday
                                </button>

                                <button className="dropdown-item" onClick={() => {
                                    handleSelectThisWeek();
                                    handleDropdownClick();
                                }}>This Week
                                </button>

                                <button className="dropdown-item" onClick={() => {
                                    handleSelectLastWeek();
                                    handleDropdownClick();
                                }}>Last Week
                                </button>

                                <button className="dropdown-item" onClick={() => {
                                    handleSelectThisMonth();
                                    handleDropdownClick();
                                }}>This Month
                                </button>

                                <button className="dropdown-item" onClick={() => {
                                    handleSelectLastMonth();
                                    handleDropdownClick();
                                }}>Last Month
                                </button>

                                <button className="dropdown-item" onClick={() => {
                                    handleSelectThisYear();
                                    handleDropdownClick();
                                }}>This Year
                                </button>

                                <button className="dropdown-item" onClick={() => {
                                    handleSelectLastYear();
                                    handleDropdownClick();
                                }}>Last Year
                                </button>

                                <button className="dropdown-item" onClick={() => {
                                    handleSelectQuarter(1);
                                    handleDropdownClick();
                                }}>1st Quarter
                                </button>

                                <button className="dropdown-item" onClick={() => {
                                    handleSelectQuarter(2);
                                    handleDropdownClick();
                                }}>2nd Quarter
                                </button>

                                <button className="dropdown-item" onClick={() => {
                                    handleSelectQuarter(3);
                                    handleDropdownClick();
                                }}>3rd Quarter
                                </button>

                                <button className="dropdown-item" onClick={() => {
                                    handleSelectQuarter(4);
                                    handleDropdownClick();
                                }}>4th Quarter
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="date-picker-container">
                        {/* Date Pickers */}
                        <DatePicker
                            selected={startDate}
                            onChange={date => setStartDate(date)}
                            selectsStart
                            startDate={startDate}
                            endDate={endDate}
                            dateFormat="dd-MM-yyyy"  // Updated format
                        />
                        <DatePicker
                            selected={endDate}
                            onChange={date => setEndDate(date)}
                            selectsEnd
                            startDate={startDate}
                            endDate={endDate}
                            minDate={startDate}
                            dateFormat="dd-MM-yyyy"  // Updated format
                        />
                    </div>
                    {/* Data Availability Button or Container */}
                    <div className="data-availability-container">
                        {/*<button className="data-stats-button" onClick={handleDataStats}>*/}
                        {/*    Data Availability Stats*/}
                        {/*</button>*/}
                    </div>


                </div>
            </div>
            {/* Table with Site Names and Intervals */}
            {isModalOpen && (
                <div className="modal-background">
                    <div className="modal-content">
                        <button className="close-button" onClick={handleModalClose}>
                            <FontAwesomeIcon icon={faTimes}/> {/* Use Font Awesome icon */}
                        </button>
                        {modalContent}
                    </div>
                </div>
            )}
            {isCustomModalOpen && (
                <CustomModal isOpen={isCustomModalOpen} onClose={closeCustomModal}>
                    {modalContent}
                </CustomModal>
            )}
            <table>
                <tbody>
                {sites
                    .sort((a, b) => a.name.localeCompare(b.name)) // Sort sites alphabetically by name
                    .map((site) => (
                        <React.Fragment key={site.name}>
                            <tr>
                                <td colSpan={6}>
                                    <button className="site-name-button" onClick={() => toggleActiveSite(site.name)}>
                                        <FontAwesomeIcon icon={activeSite === site.name ? farFolderOpen : farFolder} className="icon-left"/>
                                        {site.name}
                                        {activeSite === site.name ? ' ▲' : ' ▼'}
                                    </button>
                                </td>
                            </tr>
                            {activeSite === site.name && site.intervals
                                .sort((a, b) => a.localeCompare(b)) // Sort intervals alphabetically
                                .map(interval => (
                                    <tr key={interval} className={lastUpdateDates[`${site.name}-${interval}`]?.badgeColor || ''}>


                                    <td colSpan={6}>
                                            {/* Interval-specific buttons and information here */}
                                            <button className="view-data-button" onClick={() => handleModalOpen(site.name, interval, 'view')}>
                                                <FontAwesomeIcon icon={faTable}/> {interval} (summary data)
                                            </button>
                                        {((interval !== "public" && interval !== "config_setting_notes")) && (
                                            <button className="special-action-button"
                                                    onClick={() => handleSpecialAction(site.name, interval)}>
                                                <FontAwesomeIcon icon={faChartBar}/> Data availability
                                            </button>
                                        )}
                                            {/* Additional interval-specific content */}
                                        Last Update: {lastUpdateDates[`${site.name}-${interval}`]?.category}
                                        </td>
                                    </tr>
                                ))}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>

        </div>

    );

}

export default ScrollableTable2;
