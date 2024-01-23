import React, { useState } from 'react';
import './ScrollableTable.css';
import GenericData from './GenericData';
import BattVPlot from './BattVPlot';
import DatePicker from 'react-datepicker';
import {
    startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks,
    startOfYesterday, endOfYesterday, startOfToday, endOfToday,
    subMonths, subYears, startOfYear, endOfYear, addQuarters,endOfQuarter
} from 'date-fns';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import { faChevronDown, faChevronUp, faTable, faChartLine, faTimes, faSearch,faChartBar } from '@fortawesome/free-solid-svg-icons';
import { faCheck, faExclamation, faQuestion } from '@fortawesome/free-solid-svg-icons';
import 'react-datepicker/dist/react-datepicker.css';
// import HeatMap from 'react-heatmap-grid';
import MyHeatMap from './MyHeatMap'; // Adjust the path to where your MyHeatMap component is defined
import CustomModal from './CustomModal';
import ModalContent from './ModalContent'; // Adjust the path as necessary

// import * as echarts from 'echarts/core';


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


const ScrollableTable = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState(null);
    const [activeSite, setActiveSite] = useState(null);
    // New state for storing last update dates
    const [lastUpdateDates, setLastUpdateDates] = useState({});
    const [startDate, setStartDate] = useState(new Date());
    const [endDate, setEndDate] = useState(new Date());
// Function to map interval names to API format
    const mapIntervalToAPIFormat = (interval) => {
        switch (interval) {
            case "30 mins":
                return "thirty_min";
            case "5 mins":
                return "five_min";
            case "Table 1":
                return "table1";
            case "Table 2":
                return "table2";
            case "Table 3":
                return "table3";
            case "Table 4":
                return "table4";
            // Add other cases as needed
            default:
                return interval.toLowerCase().replace(/\s/g, '_');
        }
    };
    const [dataAvailability, setDataAvailability] = useState(null);

    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);

    const fetchLastUpdateForSite = async (siteName) => {
        const site = sites.find(s => s.name === siteName);

        for (const interval of site.intervals) {
            const siteKey = `${siteName}-${interval}`;

            let formattedSiteName = siteName.toLowerCase().split(' ').join('_');
            let formattedInterval = mapIntervalToAPIFormat(interval);
            let url;
            if (siteName === "CR1000 Constantiaberg") {
                formattedSiteName = "constantiaberg";
                url = `/api/last-update-date/${formattedSiteName}.${formattedInterval}`;
            } else {
                url = `/api/last-update-date/${formattedSiteName}.${formattedInterval}`;
            }

            try {
                const response = await fetch(url);
                const data = await response.json();
                const dateCategory = categorizeDate(data.lastupdatetime);

                // Update the state immediately for each interval
                setLastUpdateDates(prevDates => ({
                    ...prevDates,
                    [siteKey]: dateCategory
                }));
            } catch (error) {
                console.error('Error fetching last update date for', siteName, interval, error);
            }
        }
    };
    // const [isLoading, setIsLoading] = useState(false);
    // const [error, setError] = useState(null);

    const categorizeDate = (dateString) => {

        if (!dateString) {
            console.error('Invalid or missing date string');
            return { category: 'Unknown', icon: faQuestion, badgeColor: 'gray-badge' };
        }

        const lastUpdate = new Date(dateString);
        if (isNaN(lastUpdate)) {
            console.error('Invalid date:', dateString);
            return { category: 'Unknown', icon: faQuestion, badgeColor: 'gray-badge' };
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
            return { category: `Updated Today (${formattedDate})`, icon: faCheck, badgeColor: 'green-badge' };
        } else if (difference < oneWeek) {
            return { category: `Updated This Week (${formattedDate})`, icon: faCheck, badgeColor: 'blue-badge' };
        } else if (difference < twoWeeks) {
            return { category: `Updated Last Week (${formattedDate})`, icon: faCheck, badgeColor: 'blue-badge' };
        } else if (difference < threeWeeks) {
            return { category: `Updated 2 Weeks Ago (${formattedDate})`, icon: faCheck, badgeColor: 'yellow-badge' };
        } else if (difference < oneMonth) {
            return { category: `Updated 3 Weeks Ago (${formattedDate})`, icon: faExclamation, badgeColor: 'orange-badge' };
        } else if (difference < oneYear) {
            return { category: `Updated This Year (${formattedDate})`, icon: faExclamation, badgeColor: 'red-badge' };
        } else {
            return { category: `Updated Over a Year Ago (${formattedDate})`, icon: faTimes, badgeColor: 'dark-red-badge' };
        }
    };
    const [notification, setNotification] = useState({ message: '', type: '' });
    const showNotification = (message, type) => {
        setNotification({ message, type });

        // Hide the notification after 3 seconds
        setTimeout(() => {
            setNotification({ message: '', type: '' });
        }, 3000);
    };


    const sites = [
        {
            name: "CR1000 Besemfontein",
            intervals: ["Public","Daily", "Hourly", "30 mins", "5 mins"]
        },
        {
            name: "CR1000 Cath Peak High Alt AWS",
            intervals: ["Public","Daily", "Hourly", "5 mins"]
        },
        {
            name: "CR1000 Cath Peak Mikes Pass AWS",
            intervals: ["Public","Daily", "Hourly", "5 mins"]
        },
        {
            name: "CR300 Cath Peak Research Centre",
            intervals: ["Public","Daily", "Hourly", "5 mins"]
        },
        {
            name: "CR1000 Constantiaberg",
            intervals: ["Public","Table 1", "Table 2", "Table 3", "Table 4"]
        },
        {
            name: "CR1000 Dwarsberg Jonkershoek",
            intervals: ["Public","Table 1", "Table 2", "Table 3", "Table 4"]
        },
        {
            name: "CR300 Engelsmanskloof",
            intervals: ["Public","Table 1", "Table 2"]
        },
        {
            name: "CR3000 Jonkershoek EC",
            intervals: ["Flux","Flux Notes"]
        },
        {
            name: "CR1000 Tierberg",
            intervals: ["Public","Table 1", "Table 2"]
        },
        {
            name: "CR1000 Vasi Science Centre AWS",
            intervals: ["Public","Daily", "Hourly", "5 mins"]
        }
    ];

    const generateEndpoints = (baseURL, intervals) => {
        const obj = {};

        for (let interval of intervals) {
            let lowercaseInterval = interval.toLowerCase().replace(' ', '-');
            let capitalizedInterval;

            switch (interval) {
                case "five_min":
                    capitalizedInterval = "5 mins";
                    break;
                case "thirty_min":
                    capitalizedInterval = "30 mins";
                    break;
                case "table1":
                    capitalizedInterval = "Table 1";
                    break;
                case "table2":
                    capitalizedInterval = "Table 2";
                    break;
                case "table3":
                    capitalizedInterval = "Table 3";
                    break;
                case "table4":
                    capitalizedInterval = "Table 4";
                    break;
                case "flux_notes":
                    capitalizedInterval = "Flux Notes";
                    break;
                default:
                    capitalizedInterval = interval.charAt(0).toUpperCase() + interval.slice(1);
            }

            obj[capitalizedInterval] = {
                data: `${baseURL}/${lowercaseInterval}-data`,
                metadata: `${baseURL}/${lowercaseInterval}-metadata`,
                count: `${baseURL}/${lowercaseInterval}-count`,
                csv: `${baseURL}/download-${lowercaseInterval}-csv`
            }

            if (interval === "public") {
                obj[capitalizedInterval]['battv'] = `${baseURL}/latest-day-battv`;
            }
// new endpoint
            if (interval === "table2") {
                obj[capitalizedInterval]['battv'] = `${baseURL}/table2-battv`;
            }
            if (interval === "flux_notes") {
                obj[capitalizedInterval]['battv'] = `${baseURL}/flux_notes-battv`;
            }


        }

        return obj;
    }

    const intervals = ["public", "daily", "hourly", "five_min"];
    const intervals2 = ["public","daily", "hourly", "thirty_min", "five_min"];
    const constantiabergintervals = ["public","table1", "table2", "table3", "table4"];
    const tierbergintervals = ["public","table1", "table2"];
    const jonkershoekecintervals = ["flux","flux_notes"];
    const siteEndpoints = {

        "CR1000 Besemfontein": generateEndpoints('/api/besemfontein', intervals2),
        "CR1000 Cath Peak High Alt AWS": generateEndpoints('/api/cr1000-cath-peak-high-alt-aws', intervals),
        "CR1000 Vasi Science Centre AWS": generateEndpoints('/api/vasi-science-centre-aws', intervals),
        "CR1000 Cath Peak Mikes Pass AWS": generateEndpoints('/api/cr1000-cath-peak-mikes-pass-aws', intervals),
        "CR300 Cath Peak Research Centre": generateEndpoints('/api/cr300-cath-peak-research-centre', intervals),
        "CR1000 Constantiaberg": generateEndpoints('/api/constantiaberg', constantiabergintervals),
        "CR300 Engelsmanskloof":generateEndpoints('/api/cr300-engelsmanskloof', tierbergintervals),
        "CR3000 Jonkershoek EC":generateEndpoints('/api/cr3000-jonkershoek-ec', jonkershoekecintervals),
        "CR1000 Tierberg": generateEndpoints('/api/cr1000-tierberg', tierbergintervals),
        "CR1000 Dwarsberg Jonkershoek": generateEndpoints('/api/cr1000-dwarsberg-jonkershoek', constantiabergintervals),

    };

    const handleModalOpen = (siteName, interval, contentType) => {

        setIsModalOpen(true);

        const endpoints = siteEndpoints[siteName][interval];
        let contentComponent;

        if (contentType === 'battv' || contentType === 'batt_volt' || contentType === 'batt_volt_avg' || contentType === 'constantiaberg_table2_battv') {
            contentComponent = (
                <BattVPlot dataEndpoint={endpoints.battv} />
            );
        }



        else {
            contentComponent = (
                <GenericData
                    dataEndpoint={endpoints.data}
                    metadataEndpoint={endpoints.metadata}
                    countEndpoint={endpoints.count}
                    csvDownloadEndpoint={endpoints.csv}
                />
            );
        }
        setModalContent(contentComponent);
    };

    const handleModalClose = () => {
        setIsModalOpen(false);
        setModalContent(null);
    };

    // Function to toggle the active site and fetch data
    const toggleActiveSite = (siteName) => {
        const isActive = activeSite === siteName;
        setActiveSite(isActive ? null : siteName); // Toggle active site

        // Fetch last update date whenever a site is expanded
        if (!isActive) {
            fetchLastUpdateForSite(siteName);
        }
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
                return { startDate: new Date(financialYearStart, 3, 1), endDate: new Date(financialYearStart, 5, 30) };
            case 2: // July - September
                return { startDate: new Date(financialYearStart, 6, 1), endDate: new Date(financialYearStart, 8, 30) };
            case 3: // October - December
                return { startDate: new Date(financialYearStart, 9, 1), endDate: new Date(financialYearStart, 11, 31) };
            case 4: // January - March (next year)
                return { startDate: new Date(financialYearStart + 1, 0, 1), endDate: new Date(financialYearStart + 1, 2, 31) };
            default:
                return { startDate: new Date(), endDate: new Date() };
        }
    };



// Date range selection handlers
    const handleSelectYesterday = () => handleDateRangeSelection(startOfYesterday(), endOfYesterday());
    const handleSelectThisWeek = () => handleDateRangeSelection(startOfWeek(new Date()), endOfWeek(new Date()));
    const handleSelectLastWeek = () => handleDateRangeSelection(startOfWeek(subWeeks(new Date(), 1)), endOfWeek(subWeeks(new Date(), 1)));
    const handleSelectThisMonth = () => handleDateRangeSelection(startOfMonth(new Date()), endOfMonth(new Date()));
    const handleSelectLastMonth = () => handleDateRangeSelection(startOfMonth(subMonths(new Date(), 1)), endOfMonth(subMonths(new Date(), 1)));
    const handleSelectLastYear = () => handleDateRangeSelection(startOfYear(subYears(new Date(), 1)), endOfYear(subYears(new Date(), 1)));
    const handleSelectThisYear = () => handleDateRangeSelection(startOfYear(subYears(new Date(), 0)), endOfYear(subYears(new Date(), 0)));
    const handleSelectQuarter = (quarterNumber) => {
        const { startDate, endDate } = getQuarterDates(quarterNumber);
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



    const handleDataStats = async () => {
        setIsModalOpen(true);

        // Format dates to 'YYYY-MM-DD' format
        const formattedStartDate = startDate.toISOString().split('T')[0];
        // const formattedEndDate = endDate.toISOString().split('T')[0];

        // Adding one day to endDate
        const newEndDate = new Date(endDate);
        newEndDate.setDate(newEndDate.getDate() + 1);
        const formattedEndDate = newEndDate.toISOString().split('T')[0];


        const url = `/api/cr300_cath_peak_research_centre/hourly/check?startDate=${formattedStartDate}&endDate=${formattedEndDate}&excludedFields=time,battv`;
        try {
            const response = await fetch(url);
            const data = await response.json();
            // console.log(data);
            setDataAvailability(data.availabilityData);
            setModalContent(<MyHeatMap data={data.availabilityData} />);

            // setModalContent(renderHeatMap(data.availabilityData));
        } catch (error) {
            console.error('Error fetching data availability stats:', error);
        }
    };

    // const handleSpecialAction = async (siteName, interval) => {
    //     showNotification("Loading data...", "loading");
    //
    //
    //
    //     // Format dates to 'YYYY-MM-DD' format
    //     const formattedStartDate = startDate.toISOString().split('T')[0];
    //     // Adding one day to endDate
    //     const newEndDate = new Date(endDate);
    //     newEndDate.setDate(newEndDate.getDate() + 1);
    //     const formattedEndDate = newEndDate.toISOString().split('T')[0];
    //
    //     // Handle special case for "CR1000 Constantiaberg"
    //     let formattedSiteName = siteName === "CR1000 Constantiaberg" ? "constantiaberg" : siteName.toLowerCase().split(' ').join('_');
    //     // let formattedSiteName = siteName.toLowerCase().split(' ').join('_');
    //     let formattedInterval = mapIntervalToAPIFormat(interval); // Use the mapping function
    //
    //
    //     // // Adjust the URL to include the siteName and interval
    //     // let formattedSiteName = siteName.toLowerCase().split(' ').join('_');
    //     // let formattedInterval = interval.toLowerCase().replace(/\s/g, '_');
    //     const url = `/api/${formattedSiteName}/${formattedInterval}/check?startDate=${formattedStartDate}&endDate=${formattedEndDate}`;
    //
    //     try {
    //         const response = await fetch(url);
    //         if (!response.ok) {
    //             throw new Error('Failed to fetch data'); // Handle non-200 responses
    //         }
    //         const data = await response.json();
    //
    //
    //
    //         // Assuming data.summary contains your summary statistics
    //         setModalContent(
    //             <div style={{ display: 'flex', height: '100%', width: '100%' }}>
    //                 <MyHeatMap data={data.availabilityData} siteName={siteName} interval={interval} />
    //                 <div style={{ width: '300px', fontSize: '10px', overflowY: 'auto', maxHeight: '400px' }}>
    //                     <h3>Summary</h3>
    //                     {Object.entries(data.summary)
    //                         .sort((a, b) => a[0].localeCompare(b[0])) // Alphabetical sort
    //                         .map(([key, value]) => (
    //                             <p key={key}>{`${key}: ${value.percentageMissing.toFixed(2)}% missing`}</p>
    //                         ))
    //                     }
    //                 </div>
    //
    //
    //             </div>
    //         );
    //         // ... existing modal content setup
    //         setIsCustomModalOpen(true); // Open modal only after successful data fetch
    //         showNotification("", ""); // Clear notification on success
    //         // setIsCustomModalOpen(true);
    //     } catch (error) {
    //         console.error('Error in special action for', siteName, interval, ':', error);
    //         showNotification('Failed to load data. Please try again.', 'error');
    //     }
    // };

    const handleSpecialAction = async (siteName, interval) => {
        showNotification("Loading data...", "loading");

        const formattedStartDate = startDate.toISOString().split('T')[0];
        const newEndDate = new Date(endDate);
        newEndDate.setDate(newEndDate.getDate() + 1);
        const formattedEndDate = newEndDate.toISOString().split('T')[0];

        let formattedSiteName = siteName === "CR1000 Constantiaberg" ? "constantiaberg" : siteName.toLowerCase().split(' ').join('_');
        let formattedInterval = mapIntervalToAPIFormat(interval);

        const url = `/api/${formattedSiteName}/${formattedInterval}/check?startDate=${formattedStartDate}&endDate=${formattedEndDate}`;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('Failed to fetch data');
            }
            const data = await response.json();

            // Calculate average availability
            let totalPercentageMissing = 0;
            let variableCount = 0;
            Object.entries(data.summary).forEach(([_, value]) => {
                totalPercentageMissing += value.percentageMissing;
                variableCount++;
            });
            const averageAvailability = variableCount > 0 ? 100 - (totalPercentageMissing / variableCount) : 0;

            setModalContent(
                <ModalContent
                    data={data}
                    siteName={siteName}
                    interval={interval}
                    averageAvailability={averageAvailability}
                />
            );

            setIsCustomModalOpen(true);
            showNotification("", "");
        } catch (error) {
            console.error('Error in special action for', siteName, interval, ':', error);
            showNotification('Failed to load data. Please try again.', 'error');
        }
    };



    const closeCustomModal = () => {
        setIsCustomModalOpen(false);
    };

    return (
        <div className="scrollable-table-container">
            {/* Add the date range picker and buttons here */}
            <div className="date-controls-container">
                <div className="left-aligned-buttons">
                {/* Date Range Buttons */}
                <div className="button-container">

                    {/* Date Range Buttons */}
                    <button className="date-controls-button" onClick={() => handleDateRangeSelection(startOfToday(), endOfToday())}>Today</button>
                    <button className="date-controls-button" onClick={handleSelectYesterday}>Yesterday</button>
                    <button className="date-controls-button" onClick={handleSelectThisWeek}>This Week</button>
                    <button className="date-controls-button" onClick={handleSelectLastWeek}>Last Week</button>
                    <button className="date-controls-button" onClick={handleSelectThisMonth}>This Month</button>
                    <button className="date-controls-button" onClick={handleSelectLastMonth}>Last Month</button>
                    <button className="date-controls-button" onClick={handleSelectThisYear}>This Year</button>
                    <button className="date-controls-button" onClick={handleSelectLastYear}>Last Year</button>
                </div>
                <div className="button-container">


                    <button className="date-controls-button" onClick={() => handleSelectQuarter(1)}>1st Quarter</button>
                    <button className="date-controls-button" onClick={() => handleSelectQuarter(2)}>2nd Quarter</button>
                    <button className="date-controls-button" onClick={() => handleSelectQuarter(3)}>3rd Quarter</button>
                    <button className="date-controls-button" onClick={() => handleSelectQuarter(4)}>4th Quarter</button>
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
                </div>
                <div className="right-aligned-button">
                    <button className="data-stats-button" onClick={handleDataStats}>
                        Data Availability Stats
                    </button>

                {/*<button className="data-stats-button" onClick={handleDataStats}>Data Availability Stats</button>*/}
                </div>
                </div>
            {isModalOpen && (
                <div className="modal-background">
                    <div className="modal-content">
                        <button className="close-button" onClick={handleModalClose}>
                            <FontAwesomeIcon icon={faTimes} /> {/* Use Font Awesome icon */}
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
                {sites.map((site) => (
                    <React.Fragment key={site.name}>
                        <tr>
                            <td colSpan={6}>
                                <button className="site-name-button" onClick={() => toggleActiveSite(site.name)}>
                                    {site.name}
                                    <FontAwesomeIcon icon={activeSite === site.name ? faChevronUp : faChevronDown} />
                                </button>
                            </td>
                        </tr>
                        {activeSite === site.name && site.intervals.map(interval => (
                            <tr key={interval} className={lastUpdateDates[`${site.name}-${interval}`]?.badgeColor}>
                                <td colSpan={6}>
                                    <button className="view-data-button" onClick={() => handleModalOpen(site.name, interval, 'view')}>
                                        <FontAwesomeIcon icon={faTable} /> {interval} Data
                                    </button>
                                    {interval === "Public" && (
                                        <button className="view-data-button" onClick={() => handleModalOpen(site.name, interval, 'battv')}>
                                            <FontAwesomeIcon icon={faChartLine} /> Battv
                                        </button>
                                    )}
                                    {((site.name === "CR1000 Constantiaberg" && interval === "Table 2")) && (
                                        <button className="view-data-button" onClick={() => handleModalOpen(site.name, interval, 'constantiaberg_table2_battv')}>
                                            <FontAwesomeIcon icon={faChartLine} /> Battv
                                        </button>
                                    )}
                                    {((site.name === "CR3000 Jonkershoek EC" && interval === "Flux Notes")) && (
                                        <button className="view-data-button" onClick={() => handleModalOpen(site.name, interval, 'batt_volt_avg')}>
                                            <FontAwesomeIcon icon={faChartLine} /> Battv
                                        </button>
                                    )}

                                    {notification.message && (
                                        <div className={`notification-popup ${notification.type}`}>
                                            {notification.message}
                                        </div>
                                    )}
                                    {(( interval != "Public")) && (
                                    <button className="special-action-button" onClick={() => handleSpecialAction(site.name, interval)}>

                                        <FontAwesomeIcon icon={faChartBar} /> Data availability

                                    </button>
                                    )}

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

export default ScrollableTable;
