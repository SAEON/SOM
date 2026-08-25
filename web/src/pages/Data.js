import React, {useEffect, useMemo, useRef, useState} from "react";
import ReactECharts from 'echarts-for-react'; // Import ECharts
import axios from "axios";
import Modal from "react-modal";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import LoadingSpinner from "./LoadingSpinner";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import streamSaver from 'streamsaver';


import {
    faDownload,
    faFolder as farFolder,
    faFolderOpen as farFolderOpen,
    faInfoCircle,
    faTable
} from "@fortawesome/free-solid-svg-icons";
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
// import "./ScrollableTable.css";
import "../universal.css";
import DataAvailabilityModalContent from './DataAvailabilityModalContent';
import {useLocation} from "react-router-dom";
import {logInteraction} from "../utils/logInteraction"; // Import the logging function
import './Data.css';
// Ensure StreamSaver is available on the window object
if (typeof window.streamSaver === 'undefined') {
    window.streamSaver = streamSaver;
}
Modal.setAppElement("#root");

const Data = ({user}) => { // Receive user as a prop
    const [servers, setServers] = useState([]);
    const [activeServer, setActiveServer] = useState(null);
    const [tables, setTables] = useState({});
    const [tableLoading, setTableLoading] = useState({});
    const [tableErrors, setTableErrors] = useState({});
    const [dateRanges, setDateRanges] = useState({});
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState(null);
    const [startDate, setStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 7)));
    const [endDate, setEndDate] = useState(new Date(new Date().setDate(new Date().getDate() - 1)));
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [totalRows, setTotalRows] = useState(0);
    const [currentTableName, setCurrentTableName] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
    const [modalData, setModalData] = useState(null);
    const [modalStartDate, setModalStartDate] = useState(new Date(new Date().setFullYear(new Date().getFullYear() - 1))); // Default to one year ago for modal
    const [modalEndDate, setModalEndDate] = useState(new Date()); // Default to today for modal
    const [highlightedTable, setHighlightedTable] = useState(null);
    const [metadataLinks, setMetadataLinks] = useState({});
    const metadataServerCacheRef = useRef(new Set());
    const [siteSearch, setSiteSearch] = useState('');
    const [selectedSiteOption, setSelectedSiteOption] = useState('');
    const [selectedTableOption, setSelectedTableOption] = useState('');
    const [dataNotice, setDataNotice] = useState(null);
    const [isDownloadChoiceOpen, setIsDownloadChoiceOpen] = useState(false);
    const [downloadChoiceContext, setDownloadChoiceContext] = useState(null);

    const isUserLoggedIn = !!user;
    const isAdmin = user?.role === "Admin" || user?.role === "SU";


    const [metadata, setMetadata] = useState({fieldNames: [], fieldUnits: []});
    const [isFieldNamesExpanded, setIsFieldNamesExpanded] = useState(false);
    const [isFieldUnitsExpanded, setIsFieldUnitsExpanded] = useState(false);

    const getDateRangeKey = (serverName, tableName) => `${serverName}-${tableName}`;

    const formatDateForApi = (date) => {
        if (!(date instanceof Date) || isNaN(date.getTime())) return '';
        const year = date.getFullYear();
        const month = `${date.getMonth() + 1}`.padStart(2, '0');
        const day = `${date.getDate()}`.padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const getLatestMonthWindow = (range) => {
        const end = range?.end_date ? new Date(range.end_date) : new Date();
        const start = new Date(end);
        start.setMonth(start.getMonth() - 1);
        return {start, end};
    };

    const getDateRangeLabel = (range) => {
        if (!range) return 'Loading dates...';
        if (range.error) return 'Error fetching dates';
        if (!range.start_date || !range.end_date) return 'No dates available';
        return `${new Date(range.start_date).toLocaleDateString()} - ${new Date(range.end_date).toLocaleDateString()}`;
    };

    const siteSearchTerm = siteSearch.trim().toLowerCase();

    const visibleServers = useMemo(
        () => servers.filter((server) =>
            !siteSearchTerm ||
            server.display_server_name.toLowerCase().includes(siteSearchTerm)
        ),
        [servers, siteSearchTerm]
    );

    const getVisibleTables = (serverName) => {
        return tables[serverName] || [];
    };

    const selectedSiteTables = selectedSiteOption ? (tables[selectedSiteOption] || []) : [];

    const handleSiteSelect = (serverName) => {
        setSelectedSiteOption(serverName);
        setSelectedTableOption('');
        setSiteSearch('');
        if (!serverName) {
            setActiveServer(null);
            return;
        }
        setActiveServer(serverName);
        if (!tables[serverName]) {
            fetchTables(serverName);
        }
    };

    const handleTableSelect = (tableName) => {
        setSelectedTableOption(tableName);
        if (tableName && selectedSiteOption) {
            openTableModal(tableName, selectedSiteOption);
        }
    };

    const getTableDateRange = (serverName, tableName) =>
        dateRanges[getDateRangeKey(serverName, tableName)];

    const getDownloadScopeLabel = (scope) => {
        if (scope?.type === 'full') return 'full available archive';
        if (scope?.startDate && scope?.endDate) return `${scope.startDate} to ${scope.endDate}`;
        return 'selected date window';
    };

    // Disclaimer modal state
    const [isDisclaimerOpen, setIsDisclaimerOpen] = useState(false);
    const [disclaimer, setDisclaimer] = useState(null); // { message, requireAck, contactEmail, siteName }
    const [disclaimerAck, setDisclaimerAck] = useState(false);

// Cache to avoid re-fetching per session
    const disclaimerCacheRef = useRef(new Map());

    const fetchSiteDisclaimer = async (serverName, tableName) => {
        const cacheKey = `${serverName}::${tableName || ''}`;
        if (disclaimerCacheRef.current.has(cacheKey)) {
            return disclaimerCacheRef.current.get(cacheKey);
        }
        try {
            const res = await fetch(
                `/api/public/site_disclaimer?serverName=${encodeURIComponent(serverName)}&tableName=${encodeURIComponent(tableName || '')}`
            );
            if (res.status === 204) return null;   // no disclaimer for this site
            if (!res.ok) return null;
            const data = await res.json(); // { message, requireAck, contactEmail, siteName }
            disclaimerCacheRef.current.set(cacheKey, data);
            return data;
        } catch (e) {
            console.error('Error fetching site disclaimer:', e);
            return null;
        }
    };


    useEffect(() => {
        // Fetch metadata from the backend
        fetch('/api/field-metadata')
            .then(response => response.json())
            .then(data => setMetadata(data))
            .catch(error => console.error('Error fetching metadata:', error));
    }, []);


    useEffect(() => {// Log the interaction
        logInteraction('page_view', {viewport: {width: window.innerWidth, height: window.innerHeight}}, user);
    }, [user]);


    useEffect(() => {
        setLoading(true);
        setLoadingMessage('Loading servers...');
        fetch("/api/summary_table/servers")
            .then(response => response.json())
            .then(data => {
                const uniqueServers = data.reduce((acc, row) => {
                    if (!acc.some(server => server.display_server_name === row.display_server_name)) {
                        acc.push(row);
                    }
                    return acc;
                }, []);
                setServers(uniqueServers.sort((a, b) => a.display_server_name.localeCompare(b.display_server_name)));
                setSelectedServers(uniqueServers);
                setLoading(false);
            })
            .catch(error => {
                console.error("Error fetching servers:", error);
                setLoading(false);
            });
    }, []);

    const location = useLocation();
    // const tableRefs = useRef({}); // To store references for each table


    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const serverName = params.get('server');
        if (serverName) {
            toggleServer(serverName);
        }
    }, [location.search]);


    useEffect(() => {
        // Ensure that non-admins cannot select a date range greater than one year
        const dateDiffInYears = (endDate - startDate) / (1000 * 60 * 60 * 24 * 365);
        if (!isAdmin && dateDiffInYears > 1) {
            // Revert the end date to be within one year of the start date if the user is not an admin
            const adjustedEndDate = new Date(startDate);
            adjustedEndDate.setFullYear(adjustedEndDate.getFullYear() + 1);
            setEndDate(adjustedEndDate);
            alert("Non-admin users cannot select a date range greater than one year. The date has been adjusted.");
        }
    }, [startDate, endDate, isAdmin]);

    const handleStartDateChange = (date) => {
        setStartDate(date);
        if (!isAdmin && (date > endDate || (endDate - date) / (1000 * 60 * 60 * 24 * 365) > 1)) {
            // Adjust the end date if it exceeds one year for non-admins
            const adjustedEndDate = new Date(date);
            adjustedEndDate.setFullYear(adjustedEndDate.getFullYear() + 1);
            setEndDate(adjustedEndDate);
        }
    };

    const handleEndDateChange = (date) => {
        if (!isAdmin && (date - startDate) / (1000 * 60 * 60 * 24 * 365) > 1) {
            // Revert the end date if it exceeds one year for non-admins
            const adjustedEndDate = new Date(startDate);
            adjustedEndDate.setFullYear(adjustedEndDate.getFullYear() + 1);
            setEndDate(adjustedEndDate);
            alert("Non-admin users cannot select a date range greater than one year. The date has been adjusted.");
        } else {
            setEndDate(date);
        }
    };

    const toggleServer = (serverName) => {
        logInteraction('toggle_server', {serverName}, user); // Log server toggle interaction

        setActiveServer(prev => {
            const next = prev === serverName ? null : serverName;
            setSelectedSiteOption(next || '');
            setSelectedTableOption('');
            return next;
        });
        if (!tables[serverName]) {
            fetchTables(serverName);
        }
    };

    const fetchTables = async (serverName) => {
        try {
            setLoading(true);
            setLoadingMessage('Loading tables...');
            setTableLoading(prev => ({...prev, [serverName]: true}));
            setTableErrors(prev => {
                const next = {...prev};
                delete next[serverName];
                return next;
            });
            const response = await fetch(`/api/summary_table/tables?serverName=${encodeURIComponent(serverName)}`);
            const data = await response.json();
            if (response.ok) {
                const uniqueTables = (Array.isArray(data) ? data : []).reduce((acc, row) => {
                    if (!acc.some(table => table.display_table_name === row.display_table_name)) {
                        acc.push(row);
                    }
                    return acc;
                }, []);
                setTables(prevTables => ({
                    ...prevTables,
                    [serverName]: uniqueTables.sort((a, b) => a.display_table_name.localeCompare(b.display_table_name))
                }));
                setDateRanges(prevDateRanges => {
                    const next = {...prevDateRanges};
                    uniqueTables.forEach((table) => {
                        next[getDateRangeKey(serverName, table.display_table_name)] = {
                            server_name: serverName,
                            table_name: table.display_table_name,
                            start_date: table.start_date || null,
                            end_date: table.end_date || null
                        };
                    });
                    return next;
                });
                setLoading(false);
                const params = new URLSearchParams(location.search);
                const tableName = params.get('table');
                if (tableName) {
                    setHighlightedTable(tableName);
                }
            } else {
                throw new Error(data?.error || "Failed to fetch tables");
            }
        } catch (error) {
            console.error("Error fetching tables:", error);
            setTables(prevTables => ({
                ...prevTables,
                [serverName]: []
            }));
            setTableErrors(prev => ({
                ...prev,
                [serverName]: error.message || 'Could not load tables for this site.'
            }));
            setLoading(false);
        } finally {
            setTableLoading(prev => ({...prev, [serverName]: false}));
        }
    };

    const fetchDateRange = async (serverName, tableName) => {
        try {
            const response = await fetch(`/api/summary_table/date_range?serverName=${encodeURIComponent(serverName)}&tableName=${encodeURIComponent(tableName)}`);
            const data = await response.json();
            if (response.ok) {
                setDateRanges(prevDateRanges => ({
                    ...prevDateRanges,
                    [getDateRangeKey(serverName, tableName)]: data
                }));
            } else {
                console.error("Failed to fetch date range");
                setDateRanges(prevDateRanges => ({
                    ...prevDateRanges,
                    [getDateRangeKey(serverName, tableName)]: {error: true}
                }));
            }
        } catch (error) {
            console.error("Error fetching date range:", error);
            setDateRanges(prevDateRanges => ({
                ...prevDateRanges,
                [getDateRangeKey(serverName, tableName)]: {error: true}
            }));
        }
    };

// Shared function to initialize dates
    const initializeDates = (serverName, tableName) => {
        const dateRangeKey = getDateRangeKey(serverName, tableName);

        // Retrieve dates from the dateRanges object
        const startDate = dateRanges[dateRangeKey]?.start_date ? new Date(dateRanges[dateRangeKey].start_date) : new Date(new Date().setFullYear(new Date().getFullYear() - 1));
        const endDate = dateRanges[dateRangeKey]?.end_date ? new Date(dateRanges[dateRangeKey].end_date) : new Date();

        // Check if startDate and endDate are valid Date objects
        const defaultStartDate = isNaN(startDate.getTime()) ? new Date(new Date().setFullYear(new Date().getFullYear() - 1)) : startDate;
        const defaultEndDate = isNaN(endDate.getTime()) ? new Date() : endDate;

        // Set modal start and end dates
        setModalStartDate(defaultStartDate);
        setModalEndDate(defaultEndDate);

        // Format dates for the SAST timezone
        const formatToSAST = (date) => {
            if (!(date instanceof Date) || isNaN(date.getTime())) {
                console.error("Invalid date encountered:", date);
                return new Date();
            }
            return new Date(date.toLocaleString('en-US', {timeZone: 'Africa/Johannesburg'}));
        };

        const formattedStartDate = formatDateForApi(formatToSAST(defaultStartDate));
        const formattedEndDate = formatDateForApi(formatToSAST(defaultEndDate));

        return {formattedStartDate, formattedEndDate};
    };


    const fetchTableData = async (tableName, serverName, page = 1) => {
        if (!tableName || !serverName) return;

        const dateRangeKey = getDateRangeKey(serverName, tableName);

        setLoading(true);
        setLoadingMessage('Loading table data...');

        try {
            let dateRangeData = dateRanges[dateRangeKey];
            if (!dateRangeData || dateRangeData.error) {
                const dateRangeResponse = await fetch(`/api/summary_table/date_range?serverName=${encodeURIComponent(serverName)}&tableName=${encodeURIComponent(tableName)}`);
                dateRangeData = await dateRangeResponse.json();
                if (!dateRangeResponse.ok) {
                    throw new Error("Failed to fetch date range");
                }
            }

            if (dateRangeData && !dateRangeData.error) {
                setDateRanges(prevDateRanges => ({
                    ...prevDateRanges,
                    [dateRangeKey]: dateRangeData
                }));

                const {start: defaultStartDate, end: defaultEndDate} = getLatestMonthWindow(dateRangeData);

                // Set the modal dates
                setModalStartDate(defaultStartDate);
                setModalEndDate(defaultEndDate);

                // Format dates to ISO strings
                const formattedStartDate = formatDateForApi(defaultStartDate);
                const formattedEndDate = formatDateForApi(defaultEndDate);

                // Step 2: Fetch the table data using the fetched date range
                const url = `/api/summary_table/values?tableName=${encodeURIComponent(tableName)}&serverName=${encodeURIComponent(serverName)}&startDate=${formattedStartDate}&endDate=${formattedEndDate}&page=${page}&pageSize=${pageSize}`;
                const response = await fetch(url);
                const data = await response.json();
                if (response.ok && Array.isArray(data.rows)) {
                    // Adjust timestamps to SAST
                    const adjustedRows = data.rows.map(row => {
                        const adjustedTimestamp = new Date(row.timestamp).toLocaleString('en-ZA', {timeZone: 'Africa/Johannesburg'});
                        return {...row, timestamp: adjustedTimestamp};
                    });

                    // Log the interaction
                    logInteraction('view_table', {serverName, tableName}, user);

                    // Update the modal content and UI state
                    setModalContent(adjustedRows);
                    setTotalRows(data.total);
                    setLoading(false);
                    setIsModalOpen(true);
                } else {
                    console.error("Expected data.rows to be an array, received:", data);
                    if (data.error) {
                        console.error("API Error:", data.error);
                    }
                    setLoading(false);
                }
            } else {
                console.error("Failed to fetch date range");
                setLoading(false);
            }
        } catch (error) {
            console.error("Error fetching table details:", error);
            setDateRanges(prevDateRanges => ({
                ...prevDateRanges,
                [dateRangeKey]: {error: true}
            }));
            setLoading(false);
        }
    };


    const fetchDataAvailability = async (serverName, tableName) => {
        logInteraction('view_data_availability', {serverName, tableName}, user);

        setLoading(true);
        setLoadingMessage('Fetching data availability...');

        try {
            const formattedStartDate = formatDateForApi(startDate);
            const formattedEndDate = formatDateForApi(endDate);
            const url = `/api/data-availability?startDate=${formattedStartDate}&endDate=${formattedEndDate}&serverName=${encodeURIComponent(serverName)}&tableName=${encodeURIComponent(tableName)}`;
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                // console.log(data);
                // Check if data is empty
                if (!data || data.length === 0) {
                    setDataNotice({type: 'info', message: 'No data availability rows were found for the selected date range.'});
                    setIsCustomModalOpen(false); // Close the modal if open
                    setLoading(false);
                    return; // Stop further processing
                }

                // Process and generate the full date range
                const allDates = [];
                let currentDate = new Date(startDate);
                const end = new Date(endDate);

                while (currentDate <= end) {
                    allDates.push(formatDateForApi(currentDate));
                    currentDate.setDate(currentDate.getDate() + 1);
                }

                const variables = [...new Set(data.map(item => item.display_field_name))];
                const entriesByDateAndVariable = new Map(
                    data.map(item => [`${item.aggregated_timestamp.split('T')[0]}|${item.display_field_name}`, item])
                );

                const filledData = [];
                allDates.forEach(date => {
                    variables.forEach(variable => {
                        const key = `${date}|${variable}`;
                        filledData.push(entriesByDateAndVariable.get(key) || {
                            aggregated_timestamp: date,
                            display_field_name: variable,
                            availability_percentage: 0,
                            available_records: null,
                            total_records: null
                        });
                    });
                });

                setModalData(filledData);
                setIsCustomModalOpen(true);
                setLoading(false);
            } else {
                console.error("Failed to fetch data availability");
                setLoading(false);
            }
        } catch (error) {
            console.error("Error fetching data availability:", error);
            setLoading(false);
        }
    };


    const [isServerSelectionOpen, setIsServerSelectionOpen] = useState(false);
    const [selectedServers, setSelectedServers] = useState([]);

// Handle the toggle for server selection modal
    const toggleServerSelectionModal = () => {
        setIsServerSelectionOpen(!isServerSelectionOpen);
    };

// Handle the checkbox change for servers
    const handleServerCheckboxChange = (server) => {
        if (selectedServers.includes(server)) {
            setSelectedServers(selectedServers.filter(s => s !== server));
        } else {
            setSelectedServers([...selectedServers, server]);
        }
    };

// Function to open the modal and fetch data after servers are selected
    const handleDailyDataAvailabilityClick = () => {
        toggleServerSelectionModal(); // Open the modal to select servers
    };

// Function to fetch data after server selection is done
    const fetchFilteredDataAvailability = () => {
        toggleServerSelectionModal(); // Close the modal
        fetchAggregatedDataAvailability('Daily');
    };

    const [isAllSelected, setIsAllSelected] = useState(true); // State to track whether all servers are selected

// Function to toggle between selecting and deselecting all servers
    const toggleSelectAllServers = () => {
        if (isAllSelected) {
            setSelectedServers([]); // Deselect all servers
        } else {
            const allServerNames = servers.map(server => server.display_server_name);
            setSelectedServers(allServerNames); // Select all servers
        }
        setIsAllSelected(!isAllSelected); // Toggle the selection state
    };

    // extra info-in-disclaimer state
    const [needExtraInfo, setNeedExtraInfo] = useState(false);
    const [extraSchema, setExtraSchema] = useState(null);      // { fields: [...] }
    const [extraValues, setExtraValues] = useState({});        // form values
    const [extraLoading, setExtraLoading] = useState(false);
    const [extraError, setExtraError] = useState('');

    // supports: required, and requiredIf: { field: 'study_status', equals: 'Studying' }
    const findMissing = (schema, data) => {
        const fields = schema?.fields || [];
        const getVal = (name) => data?.[name];

        return fields
            .filter((f) => {
                const type = (f.type || 'text').toLowerCase();

                // standard required
                let required = !!f.required;

                // conditional required
                if (f.requiredIf && f.requiredIf.field) {
                    const depVal = getVal(f.requiredIf.field);
                    if (Array.isArray(f.requiredIf.equals)) {
                        required = required || f.requiredIf.equals.includes(depVal);
                    } else {
                        required = required || depVal === f.requiredIf.equals;
                    }
                }

                if (!required) return false;

                const v = getVal(f.name);

                // check blanky values
                if (type === 'checkbox') return !Boolean(v);
                if (type === 'number') return v === undefined || v === null || v === '';
                return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
            })
            .map((f) => f.label || f.name);
    };

    const renderServerSelectionModal = () => (
        <Modal
            isOpen={isServerSelectionOpen}
            onRequestClose={toggleServerSelectionModal}
            contentLabel="Select Servers"
            className="server-selection-modal"
            overlayClassName="server-selection-modal-overlay"
        >
            <div className="server-selection-modal-header">
                <h3 className="server-selection-modal-title">Select Servers</h3>
                <div className="macos-window-controls">
                    <div
                        className="macos-button close"
                        onClick={toggleServerSelectionModal}
                        aria-label="Close"
                    ></div>
                </div>
            </div>
            <div className="server-selection-modal-content">
                <div className="server-list">
                    {servers.map((server) => (
                        <div className="server-item" key={server.display_server_name}>
                            <input
                                type="checkbox"
                                id={`server-${server.display_server_name}`}
                                checked={selectedServers.includes(server.display_server_name)}
                                onChange={() =>
                                    handleServerCheckboxChange(server.display_server_name)
                                }
                            />
                            <label htmlFor={`server-${server.display_server_name}`}>
                                {server.display_server_name}
                            </label>
                        </div>
                    ))}
                </div>
            </div>
            <div className="server-selection-modal-footer">
                <button className="modal-button" onClick={toggleSelectAllServers}>
                    {isAllSelected ? 'Deselect All Servers' : 'Select All Servers'}
                </button>
                <button className="modal-button primary" onClick={fetchFilteredDataAvailability}>
                    Apply and Fetch Data
                </button>
            </div>
        </Modal>
    );
    // const [selectedServers, setSelectedServers] = useState([]); // For selected servers
//     const [selectedTables, setSelectedTables] = useState([]); // For selected tables
//     const [checkboxServers, setCheckboxServers] = useState([]); // For checkbox servers
//     const [checkboxTables, setCheckboxTables] = useState({}); // For checkbox tables mapped by server
//
// // Handle the checkbox change for tables
//     const handleTableCheckboxChange = (serverName, tableName) => {
//         const tableKey = `${serverName}-${tableName}`;
//         if (selectedTables.includes(tableKey)) {
//             setSelectedTables(selectedTables.filter(t => t !== tableKey));
//         } else {
//             setSelectedTables([...selectedTables, tableKey]);
//         }
//     };
//
// // Fetch data and set checkboxServers and checkboxTables
//     useEffect(() => {
//         const fetchCheckboxServersWithTables = async () => {
//             try {
//                 const response = await fetch("/api/servers-with-tables"); // Correct API endpoint
//                 const data = await response.json();
//
//                 console.log("Fetched server and table data:", data); // Log the fetched data
//
//                 setCheckboxServers(Object.keys(data)); // Set checkboxServers (server names)
//                 setCheckboxTables(data); // Set checkboxTables (tables mapped to servers)
//             } catch (error) {
//                 console.error("Error fetching servers and tables:", error);
//             }
//         };
//
//         fetchCheckboxServersWithTables();
//     }, []);
//
//
//


// Automatically select all servers when the modal opens
    useEffect(() => {
        if (isServerSelectionOpen && servers.length > 0) {
            setSelectedServers(servers.map(server => server.display_server_name));
        }
    }, [isServerSelectionOpen, servers]);


    const fetchAggregatedDataAvailability = async (interval = 'Daily') => {
        logInteraction('view_aggregated_data_availability', {interval}, user);

        setLoading(true);
        setLoadingMessage(`Fetching ${interval.toLowerCase()} data availability...`);

        const formattedStartDate = formatDateForApi(startDate);
        const formattedEndDate = formatDateForApi(endDate);
        // const formattedStartDate = modalStartDate.toISOString();
        // const formattedEndDate = modalEndDate.toISOString();

        const serverParam = selectedServers.map(encodeURIComponent).join(','); // Include only selected servers
        // console.log(selectedServers);

        const url = `/api/filtered-aggregated-data-availability?startDate=${formattedStartDate}&endDate=${formattedEndDate}&servers=${serverParam}`;

        try {
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                // console.log("Received data from all sites:", data);

                // Check if data is empty
                if (!data || data.length === 0) {
                    setDataNotice({type: 'info', message: 'No aggregate availability rows were found for the selected date range.'});
                    setIsCustomModalOpen(false); // Close the modal if open
                    setLoading(false);
                    return; // Stop further processing
                }

                // Process and generate the full date range
                const allDates = [];
                let currentDate = new Date(startDate);
                const end = new Date(endDate);

                while (currentDate <= end) {
                    allDates.push(formatDateForApi(currentDate));
                    currentDate.setDate(currentDate.getDate() + 1);
                }

                const variables = [...new Set(data.map(item => `${item.display_server_name}|${item.display_table_name}`))];
                const entriesByDateServerAndTable = new Map(
                    data.map(item => [
                        `${item.aggregated_timestamp.split('T')[0]}|${item.display_server_name}|${item.display_table_name}`,
                        item
                    ])
                );

                const filledData = [];
                allDates.forEach(date => {
                    variables.forEach(variable => {
                        const [serverName, tableName] = variable.split('|');
                        const key = `${date}|${serverName}|${tableName}`;
                        const existingEntry = entriesByDateServerAndTable.get(key);

                        if (existingEntry) {
                            filledData.push({
                                aggregated_timestamp: existingEntry.aggregated_timestamp,
                                display_server_name: "all sites",
                                display_table_name: "all tables",
                                availability_percentage: existingEntry.average_availability_percentage,
                                available_records: null,
                                total_records: null,
                                display_field_name: `${serverName} - ${tableName}`
                            });
                        } else {
                            filledData.push({
                                aggregated_timestamp: date,
                                display_server_name: "All Sites",
                                display_table_name: "All",
                                availability_percentage: 0,
                                available_records: null,
                                total_records: null,
                                display_field_name: `${serverName} - ${tableName}`
                            });
                        }
                    });
                });

                setModalData(filledData);
                setIsCustomModalOpen(true);
                setLoading(false);
            } else {
                console.error("Failed to fetch data availability");
                setLoading(false);
            }
        } catch (error) {
            console.error("Error fetching data availability:", error);
            setLoading(false);
        }
    };


    const clearAndReloadData = async () => {
        setModalContent(null);
        setLoading(true);
        setLoadingMessage('Reloading data...');

        const formattedStartDate = formatDateForApi(modalStartDate);
        const formattedEndDate = formatDateForApi(modalEndDate);
        const url = `/api/summary_table/values?tableName=${encodeURIComponent(currentTableName)}&serverName=${encodeURIComponent(activeServer)}&startDate=${formattedStartDate}&endDate=${formattedEndDate}&page=1&pageSize=${totalRows}`;

        try {
            const response = await fetch(url);
            const data = await response.json();
            if (response.ok && Array.isArray(data.rows)) {
                setModalContent(data.rows);
                setTotalRows(data.total);
                setLoading(false);
            } else {
                console.error("Expected data.rows to be an array, received:", data);
                if (data.error) {
                    console.error("API Error:", data.error);
                }
                setLoading(false);
            }
        } catch (error) {
            console.error("Error fetching table details:", error);
            setLoading(false);
        }
    };

    const openTableModal = (tableName, serverName) => {
        setCurrentTableName(tableName);
        setCurrentPage(1);
        fetchTableData(tableName, serverName, 1);
    };

    // const openTableModal = (tableName, serverName) => {
    //     // Only allow admin users to open the table
    //     // if (!isAdmin) {
    //     //     alert("Only admin users have permission to view this table. Please download the data instead");
    //     //     return;
    //     // }
    //     setCurrentTableName(tableName);
    //     fetchTableData(tableName, serverName);
    // };

    const closeModal = () => {
        setIsModalOpen(false);
        setModalContent(null);
    };

    const closeCustomModal = () => {
        setIsCustomModalOpen(false);
        setModalData(null);
    };


    // const downloadData = async (tableName, serverName, attempt = 1, maxAttempts = 5) => {
    //     if (!tableName || !serverName) {
    //         alert('Table name and server name are required.');
    //         return;
    //     }
    //
    //     try {
    //         // Log interactions
    //         await logInteraction("consent_given", { tableName, serverName }, user);
    //         await logInteraction("download_data", { tableName, serverName }, user);
    //
    //         // Initialize and format the dates
    //         const { formattedStartDate, formattedEndDate } = initializeDates(serverName, tableName);
    //
    //         // Construct the download URL
    //         const url = `/api/summary_table/download?tableName=${encodeURIComponent(tableName)}&serverName=${encodeURIComponent(serverName)}&startDate=${encodeURIComponent(formattedStartDate)}&endDate=${encodeURIComponent(formattedEndDate)}`;
    //
    //         // Create a hidden anchor tag for the download
    //         const link = document.createElement('a');
    //         link.href = url;
    //         link.setAttribute('download', `${tableName}_${serverName}.csv`);  // Set filename for download
    //
    //         // Append link to body to trigger download
    //         document.body.appendChild(link);
    //         link.click();
    //
    //         // Clean up the DOM by removing the link element
    //         document.body.removeChild(link);
    //
    //     } catch (error) {
    //         console.error(`Download attempt ${attempt} failed:`, error);
    //
    //         if (attempt < maxAttempts) {
    //             console.log(`Retrying download... Attempt ${attempt + 1}`);
    //             downloadData(tableName, serverName, attempt + 1, maxAttempts);
    //         } else {
    //             alert('Failed to download after multiple attempts. Please try again later.');
    //         }
    //     }
    // };
    // let downloadController;
    //
    // const downloadData = async (tableName, serverName, attempt = 1, maxAttempts = 5) => {
    //     if (!tableName || !serverName) {
    //         alert('Table name and server name are required.');
    //         return;
    //     }
    //
    //     // Abort the previous attempt if any
    //     if (downloadController) {
    //         downloadController.abort();
    //     }
    //
    //     downloadController = new AbortController();
    //     const { signal } = downloadController;
    //
    //     try {
    //         // Log interactions
    //         await logInteraction("consent_given", { tableName, serverName }, user);
    //         await logInteraction("download_data", { tableName, serverName }, user);
    //
    //         // Construct the download URL
    //         const url = `/api/summary_table/download?tableName=${encodeURIComponent(tableName)}&serverName=${encodeURIComponent(serverName)}`;
    //
    //         // Create a hidden anchor tag for the download
    //         const link = document.createElement('a');
    //         link.href = url;
    //         link.setAttribute('download', `${tableName}_${serverName}.csv`);
    //
    //         // Append link to body to trigger download
    //         document.body.appendChild(link);
    //         link.click();
    //
    //         // Clean up the DOM by removing the link element
    //         document.body.removeChild(link);
    //
    //     } catch (error) {
    //         console.error(`Download attempt ${attempt} failed:`, error);
    //
    //         if (attempt < maxAttempts) {
    //             console.log(`Retrying download... Attempt ${attempt + 1}`);
    //             downloadData(tableName, serverName, attempt + 1, maxAttempts);
    //         } else {
    //             alert('Failed to download after multiple attempts. Please try again later.');
    //         }
    //     }
    // };

    const [downloadTitle, setDownloadTitle] = useState('Preparing download');
    const [progressText, setProgressText] = useState('Starting download...');
    const [progressValue, setProgressValue] = useState(0);
    const [progressMax, setProgressMax] = useState(0);
    const [isDownloading, setIsDownloading] = useState(false);

    const formatBytes = (bytes) => {
        if (!bytes || bytes <= 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        const value = bytes / (1024 ** exponent);
        return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
    };

    const showDownloadProgressWidget = () => {
        setIsDownloading(true); // Show the progress widget
    };

    const hideDownloadProgressWidget = () => {
        setIsDownloading(false); // Hide the progress widget
    };

    const updateDownloadProgressWidget = (receivedBytes, totalBytes) => {
        const percentComplete = totalBytes > 0 ? ((receivedBytes / totalBytes) * 100) : 0;

        setProgressValue(receivedBytes);
        setProgressMax(totalBytes);

        setProgressText(
            totalBytes > 0
                ? `${formatBytes(receivedBytes)} of ${formatBytes(totalBytes)} (${Math.min(percentComplete, 100).toFixed(0)}%)`
                : `${formatBytes(receivedBytes)} downloaded`
        );

        setDownloadTitle(totalBytes > 0 ? `Downloading CSV (${Math.min(percentComplete, 100).toFixed(0)}%)` : 'Downloading CSV');
    };

    // const downloadData = async (tableName, serverName, attempt = 1, maxAttempts = 5) => {
    //     if (!tableName || !serverName) {
    //         alert('Table name and server name are required.');
    //         return;
    //     }
    //
    //     try {
    //         // Show the progress bar popup
    //         showDownloadProgressWidget();
    //
    //         // Log interactions (assuming `logInteraction` is available)
    //         await logInteraction('consent_given', {tableName, serverName});
    //         await logInteraction('download_data', {tableName, serverName});
    //
    //         // Construct the download URL
    //         const url = `/api/summary_table/download?tableName=${encodeURIComponent(tableName)}&serverName=${encodeURIComponent(serverName)}`;
    //
    //         // Use the Fetch API to request the file
    //         const response = await fetch(url);
    //
    //         if (!response.ok) {
    //             throw new Error(`HTTP error! Status: ${response.status}`);
    //         }
    //
    //         // Get the total file size from the 'Content-Length' header
    //         const totalBytes = +response.headers.get('Content-Length') || 0;
    //
    //         // Create a writable stream to store the file data
    //         const fileStream = streamSaver.createWriteStream(`${tableName}_${serverName}.csv`);
    //
    //         const reader = response.body.getReader();
    //         const writer = fileStream.getWriter();
    //         let receivedBytes = 0;
    //
    //         // Read the stream in chunks and update the progress bar
    //         while (true) {
    //             const {done, value} = await reader.read();
    //             if (done) break;
    //             receivedBytes += value.length;
    //
    //             // Update the popup progress bar
    //             updateDownloadProgressWidget(receivedBytes, totalBytes);
    //
    //             // Write the chunk to the file
    //             await writer.write(value);
    //         }
    //
    //         // Close the stream
    //         await writer.close();
    //
    //         // Update the popup to show completion
    //         updateDownloadProgressWidget(totalBytes, totalBytes);
    //         setProgressText('Download complete!');
    //         setDownloadTitle('Download Complete!');
    //
    //         // Hide the popup after a short delay
    //         setTimeout(hideDownloadProgressWidget, 3000);
    //     } catch (error) {
    //         console.error(`Download attempt ${attempt} failed:`, error);
    //
    //         if (attempt < maxAttempts) {
    //             console.log(`Retrying download... Attempt ${attempt + 1}`);
    //             downloadData(tableName, serverName, attempt + 1, maxAttempts);
    //         } else {
    //             alert('Failed to download after multiple attempts. Please try again later.');
    //             hideDownloadProgressWidget(); // Hide the popup in case of failure
    //         }
    //     }
    // };
    const downloadData = async (tableName, serverName, scope = null) => {
        if (!tableName || !serverName) {
            alert('Table name and server name are required.');
            return;
        }

        try {
            const isFullArchive = scope?.type === 'full';
            const formattedStartDate = scope?.startDate || formatDateForApi(modalStartDate);
            const formattedEndDate = scope?.endDate || formatDateForApi(modalEndDate);
            const fileName = isFullArchive
                ? `${tableName}_${serverName}_full_archive.csv`
                : `${tableName}_${serverName}_${formattedStartDate}_${formattedEndDate}.csv`;
            const requestLabel = isFullArchive ? 'full available archive' : `${formattedStartDate} to ${formattedEndDate}`;

            showDownloadProgressWidget();
            setDownloadTitle('Preparing CSV download');
            setProgressText(`Requesting ${serverName} ${tableName} data for ${requestLabel}...`);
            setProgressValue(0);
            setProgressMax(0);

            // Log interactions
            await logInteraction('consent_given', {tableName, serverName});
            await logInteraction('download_data', {
                tableName,
                serverName,
                scope: isFullArchive ? 'full_archive' : 'date_range',
                startDate: isFullArchive ? null : formattedStartDate,
                endDate: isFullArchive ? null : formattedEndDate,
            });

            const url = isFullArchive
                ? `/api/summary_table/download?tableName=${encodeURIComponent(tableName)}&serverName=${encodeURIComponent(serverName)}`
                : `/api/summary_table/download?tableName=${encodeURIComponent(tableName)}&serverName=${encodeURIComponent(serverName)}&startDate=${encodeURIComponent(formattedStartDate)}&endDate=${encodeURIComponent(formattedEndDate)}`;
            setProgressText('Waiting for the server to start the CSV stream...');
            const response = await fetch(url, {credentials: 'include'});
            const contentType = response.headers.get('content-type') || '';

            if (!response.ok || !contentType.includes('text/csv')) {
                const message = await response.text();
                throw new Error(message.slice(0, 300) || `Download failed with status ${response.status}`);
            }

            const totalBytes = Number(response.headers.get('content-length')) || 0;
            const cacheStatus = response.headers.get('x-csv-cache');
            setDownloadTitle(cacheStatus === 'hit' ? 'Downloading cached CSV' : 'Streaming CSV export');
            setProgressMax(totalBytes);
            setProgressText(totalBytes ? `0 of ${formatBytes(totalBytes)} received` : 'Downloading CSV. Size is unknown until the stream finishes...');

            if (!response.body || !window.streamSaver) {
                setProgressText('Browser stream download is unavailable. Saving with the fallback download method...');
                const blob = await response.blob();
                const fallbackSize = totalBytes || blob.size || 1;
                setProgressMax(fallbackSize);
                setProgressValue(fallbackSize);
                const objectUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = objectUrl;
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(objectUrl);
                setDownloadTitle('Download ready');
                setProgressText(`Saved ${fileName} (${formatBytes(blob.size)})`);
                setTimeout(hideDownloadProgressWidget, 3000);
                return;
            }

            const fileStream = window.streamSaver.createWriteStream(fileName);
            const writer = fileStream.getWriter();
            const reader = response.body.getReader();
            let receivedBytes = 0;

            try {
                while (true) {
                    const {done, value} = await reader.read();
                    if (done) break;
                    receivedBytes += value.length;
                    await writer.write(value);
                    updateDownloadProgressWidget(receivedBytes, totalBytes);
                }
            } finally {
                await writer.close();
            }
            setProgressValue(totalBytes || receivedBytes || 1);
            setProgressMax(totalBytes || receivedBytes || 1);
            setDownloadTitle('Download complete');
            setProgressText(`Saved ${fileName}${receivedBytes ? ` (${formatBytes(receivedBytes)})` : ''}`);
            setTimeout(hideDownloadProgressWidget, 3000);
        } catch (error) {
            console.error('Download failed:', error);
            setDownloadTitle('Download failed');
            setProgressText(error.message || 'Failed to download CSV data. Please try again later.');
            setProgressValue(0);
            setProgressMax(1);
        }
    };
    // const downloadData = async (tableName, serverName, startDate, endDate) => {
    //     if (!tableName || !serverName) {
    //         alert('Table name and server name are required.');
    //         return;
    //     }
    //
    //     try {
    //         // Log interactions
    //         await logInteraction('consent_given', { tableName, serverName });
    //         await logInteraction('download_data', { tableName, serverName });
    //
    //         // Construct the download URL
    //         const url = `/api/summary_table/download?tableName=${encodeURIComponent(tableName)}&serverName=${encodeURIComponent(serverName)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
    //
    //         // Start the download using a hidden link
    //         const link = document.createElement('a');
    //         link.href = url;
    //         link.download = `${tableName}_${serverName}_data.csv`;
    //         document.body.appendChild(link);
    //         link.click();
    //         document.body.removeChild(link);
    //     } catch (error) {
    //         console.error('Download failed:', error);
    //         alert('Failed to download. Please try again later.');
    //     }
    // };

    useEffect(() => {
        if (isModalOpen && currentTableName && activeServer) {
            fetchTableData(currentTableName, activeServer, currentPage);
        }
    }, [pageSize, currentPage]);


    const nextPage = () => {
        if (currentPage < Math.ceil(totalRows / pageSize)) {
            const newPage = currentPage + 1;
            setCurrentPage(newPage);
        }
    };

    const prevPage = () => {
        if (currentPage > 1) {
            const newPage = currentPage - 1;
            setCurrentPage(newPage);
        }
    };

    const transformData = (data) => {
        const transformedData = {};

        data.forEach(item => {
            const timestamp = new Date(item.timestamp).toLocaleString();

            if (!transformedData[timestamp]) {
                transformedData[timestamp] = {
                    timestamp,
                    latitude: item.latitude,
                    longitude: item.longitude,
                };
            }

            transformedData[timestamp][item.display_field_name.trim()] = item.field_value;
        });

        return Object.values(transformedData);
    };

    const handleModalStartDateChange = (date) => {
        setModalStartDate(date);
        if (!isAdmin && (date > modalEndDate || (modalEndDate - date) / (1000 * 60 * 60 * 24 * 365) > 1)) {
            // Adjust the modal end date if it exceeds one year for non-admins
            const adjustedEndDate = new Date(date);
            adjustedEndDate.setFullYear(adjustedEndDate.getFullYear() + 1);
            setModalEndDate(adjustedEndDate);
            alert("Non-admin users cannot select a date range greater than one year. The date has been adjusted.");
        }
    };

    const handleModalEndDateChange = (date) => {
        if (!isAdmin && (date - modalStartDate) / (1000 * 60 * 60 * 24 * 365) > 1) {
            // Revert the modal end date if it exceeds one year for non-admins
            const adjustedEndDate = new Date(modalStartDate);
            adjustedEndDate.setFullYear(adjustedEndDate.getFullYear() + 1);
            setModalEndDate(adjustedEndDate);
            alert("Non-admin users cannot select a date range greater than one year. The date has been adjusted.");
        } else {
            setModalEndDate(date);
        }
    };

    const openDownloadChoiceModal = (tableName, serverName) => {
        setPendingDownloadTable(tableName);
        setPendingDownloadServer(serverName);
        setDownloadChoiceContext({tableName, serverName});
        setIsDownloadChoiceOpen(true);
    };

    const startDownloadWithScope = (scope) => {
        const tableName = downloadChoiceContext?.tableName || pendingDownloadTable;
        const serverName = downloadChoiceContext?.serverName || pendingDownloadServer;
        setIsDownloadChoiceOpen(false);
        if (!tableName || !serverName) return;
        openDisclaimerThenConsent(tableName, serverName, scope);
    };

    const buildRecentMonthsScope = (serverName, tableName, months) => {
        const range = getTableDateRange(serverName, tableName);
        const {start, end} = getLatestMonthWindow(range);
        start.setMonth(start.getMonth() - Math.max(months - 1, 0));
        if (range?.start_date) {
            const availableStart = new Date(range.start_date);
            if (!isNaN(availableStart.getTime()) && start < availableStart) {
                start.setTime(availableStart.getTime());
            }
        }
        return {
            type: months === 1 ? 'latest_month' : `recent_${months}_months`,
            startDate: formatDateForApi(start),
            endDate: formatDateForApi(end),
        };
    };

    const buildSelectedRangeScope = () => ({
        type: 'selected_range',
        startDate: formatDateForApi(modalStartDate),
        endDate: formatDateForApi(modalEndDate),
    });


    const renderTableData = (data) => {
        if (!data || data.length === 0) return <p>No data available</p>;

        // Collect all unique field names across all rows
        const fieldNames = Array.from(
            new Set(
                data.flatMap((row) => row.field_values.map((fv) => fv.display_field_name.trim()))
            )
        ).sort();

        // Map field names to units
        const fieldUnits = data.reduce((acc, row) => {
            row.field_values.forEach((fv) => {
                acc[fv.display_field_name.trim()] = fv.units;
            });
            return acc;
        }, {});

        // 👇 only make sticky if more than 10 rows
        const makeSticky = data.length > 3;

        return (
            <div className="summarydata-modal-content">
                <div className="summarydata-date-picker-container">
                    <div className="summarydata-date-picker">
                        <DatePicker
                            selected={modalStartDate}
                            onChange={(date) => handleModalStartDateChange(date)}
                            dateFormat="dd/MM/yyyy"
                        />
                        <DatePicker
                            selected={modalEndDate}
                            onChange={(date) => handleModalEndDateChange(date)}
                            dateFormat="dd/MM/yyyy"
                        />
                    </div>
                    <div className="summarydata-download-button">
                        <button
                            className="summarydata-button"
                            onClick={() => openDisclaimerThenConsent(currentTableName, activeServer, buildSelectedRangeScope())}
                        >
                            Download selected range
                        </button>
                    </div>
                </div>

                <div className="summarydata-pagination-controls">
                    <button className="summarydata-button" onClick={prevPage} disabled={currentPage === 1}>←</button>
                    <span>
          Page:{' '}
                        <input
                            type="number"
                            value={currentPage}
                            onChange={(e) => setCurrentPage(Number(e.target.value))}
                        />
        </span>
                    <button className="summarydata-button" onClick={nextPage}>→</button>
                    <span>
          Page Size:{' '}
                        <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            {[10,20,30,40,50,60,70,80,90,100].map((size) => (
                <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </span>
                    <span>Total Records: {totalRows}</span>
                    <span>Total Pages: {Math.ceil(totalRows / pageSize) || 1}</span>
                </div>

                {/* 👇 toggle sticky behavior here */}
                <div className={`summarydata-table-container ${makeSticky ? 'summarydata-sticky' : ''}`}>
                    <table className="summarydata-data-table">
                        <thead>
                        <tr className="header-row-1">
                            <th className="summarydata-timestamp-column">Timestamp</th>
                            {fieldNames.map((fieldName) => (
                                <th key={fieldName}>{fieldName}</th>
                            ))}
                            <th>Longitude</th>
                            <th>Latitude</th>
                        </tr>
                        <tr className="header-row-2">
                            <th></th>
                            {fieldNames.map((fieldName) => (
                                <th key={`${fieldName}-unit`}>{fieldUnits[fieldName]}</th>
                            ))}
                            <th></th>
                            <th></th>
                        </tr>
                        </thead>
                        <tbody>
                        {data.map((row, index) => (
                            <tr key={index}>
                                <td className="summarydata-timestamp-column">{row.timestamp}</td>
                                {fieldNames.map((fieldName) => {
                                    const fv = row.field_values.find(
                                        (x) => x.display_field_name.trim() === fieldName
                                    );
                                    return <td key={fieldName}>{fv ? fv.field_value : ''}</td>;
                                })}
                                <td>{row.longitude}</td>
                                <td>{row.latitude}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>

                {/* (consent modal unchanged) */}
                <Modal
                    isOpen={isConsentModalOpen}
                    onRequestClose={() => setIsConsentModalOpen(false)}
                    contentLabel="Citation Consent"
                    className="summarydata-consent-modal"
                    overlayClassName="summarydata-consent-modal-overlay"
                >
                    <div className="summarydata-consent-modal-content">
                        <h3>Citation Requirement</h3>
                        <p>
                            By downloading this data, you agree to cite the dataset using the DOI provided in the downloaded file…
                        </p>
                        <div className="summarydata-consent-checkbox">
                            <input type="checkbox" checked={consentGiven} onChange={toggleConsent} />
                            <label>I agree to cite this dataset according to the provided DOI.</label>
                        </div>
                        <div className="summarydata-consent-modal-actions">
                            <button
                                className="summarydata-button summarydata-button--primary"
                                onClick={handleConsent}
                                disabled={!consentGiven}
                            >
                                Proceed to Download
                            </button>
                            <button className="summarydata-button" onClick={() => setIsConsentModalOpen(false)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </Modal>
            </div>
        );
    };


    const handleDropdownClick = () => {
        const isOpening = !dropdownOpen;
        setDropdownOpen(isOpening);
        document.body.style.overflow = isOpening ? 'hidden' : 'auto';
    };


    const handleDateRangeSelection = (start, end) => {
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        const adjustedEndDate = new Date(Math.min(end, today));

        setStartDate(start);
        setEndDate(adjustedEndDate);
    };

    const handleSelectYesterday = () => handleDateRangeSelection(startOfYesterday(), endOfYesterday());
    const handleSelectThisWeek = () => handleDateRangeSelection(startOfWeek(new Date()), endOfWeek(new Date()));
    const handleSelectLastWeek = () => handleDateRangeSelection(startOfWeek(subWeeks(new Date(), 1)), endOfWeek(subWeeks(new Date(), 1)));
    const handleSelectThisMonth = () => handleDateRangeSelection(startOfMonth(new Date()), endOfMonth(new Date()));
    const handleSelectLastMonth = () => handleDateRangeSelection(startOfMonth(subMonths(new Date(), 1)), endOfMonth(subMonths(new Date(), 1)));
    const handleSelectLastYear = () => handleDateRangeSelection(startOfYear(subYears(new Date(), 1)), endOfYear(subYears(new Date(), 1)));
    const handleSelectThisYear = () => handleDateRangeSelection(startOfYear(subYears(new Date(), 0)), endOfYear(subYears(new Date(), 0)));


    const getStatusIndicator = (lastUpdated) => {
        const now = new Date();
        const updatedDate = new Date(lastUpdated);
        const diffInDays = Math.floor((now - updatedDate) / (1000 * 60 * 60 * 24));

        if (diffInDays <= 1) {
            return <span className="status-indicator green">Updated recently (within a day) </span>;
        } else if (diffInDays <= 7) {
            return <span className="status-indicator blue">Updated this week</span>;
        } else if (diffInDays <= 30) {
            return <span className="status-indicator yellow">Updated this month</span>;
        } else {
            return <span className="status-indicator red">Needs update (> month)</span>;
        }
    };

    const [filterModalIsOpen, setFilterModalIsOpen] = useState(false);
    const [sankeyModalIsOpen, setSankeyModalIsOpen] = useState(false);
    const [availableServers, setAvailableServers] = useState([]);
    const [selectedServer, setSelectedServer] = useState(null);
    const [sankeyData, setSankeyData] = useState(null);
    const chartRef = useRef(null);

    useEffect(() => {
        // Fetch the list of available servers for filtering
        const fetchServers = async () => {
            try {
                const result = await axios.get('/api/unified_mapping_table/display_servers');
                setAvailableServers(result.data);
            } catch (error) {
                console.error('Error fetching server names:', error);
            }
        };
        fetchServers();
    }, []);

    const generateSankey = async () => {
        if (!selectedServer) {
            alert("Please select a server to generate the Sankey diagram.");
            return;
        }

        try {
            const result = await axios.get('/api/unified_mapping_table/sankey_with_status', {
                params: {selectedServer},
            });

            const data = result.data;

            // Ensure that the response contains the nodes and links
            if (!Array.isArray(data.nodes) || !Array.isArray(data.links)) {
                throw new Error("Invalid Sankey data format");
            }

            const nodes = [];
            const links = [];

            const nodeMap = {};

            data.nodes.forEach((node) => {
                if (!nodeMap[node.name]) {
                    nodes.push({
                        name: node.name,
                        // Don't manually set color here, allow ECharts to handle it unless gray mode is applied
                    });
                    nodeMap[node.name] = true;
                }
            });

            data.links.forEach((link) => {
                links.push(link);
            });

            setSankeyData({nodes, links});
            setFilterModalIsOpen(false);
            setSankeyModalIsOpen(true);
        } catch (error) {
            console.error('Error generating Sankey diagram:', error);
        }
    };


// Function to determine node color based on the end_date
    const getStatusColor = (endDate) => {
        const now = new Date();
        const lastUpdateDate = new Date(endDate);
        const diffInDays = Math.floor((now - lastUpdateDate) / (1000 * 60 * 60 * 24));

        if (diffInDays <= 2) {
            return 'green';
        } else if (diffInDays <= 7) {
            return 'blue';
        } else if (diffInDays <= 30) {
            return 'yellow';
        } else {
            return 'red';
        }
    };


    const saveChart = () => {
        if (chartRef.current) {
            const chartInstance = chartRef.current.getEchartsInstance();
            const base64Image = chartInstance.getDataURL({
                type: 'png',
                pixelRatio: 5,
                backgroundColor: '#ffffff',
            });

            const downloadLink = document.createElement('a');
            downloadLink.href = base64Image;
            downloadLink.download = 'sankey-diagram.png';
            downloadLink.click();
        }
    };


    const [lineStyle, setLineStyle] = useState('gray'); // Default to gray

    const sankeyOptions = sankeyData && {
        // title: {
        //     text: 'Table-variable Associations',
        //     left: 'center',
        // },
        tooltip: {
            trigger: 'item',
            triggerOn: 'mousemove',
        },
        series: [
            {
                type: 'sankey',
                layout: 'none',
                data: sankeyData.nodes, // No need for custom itemStyle mapping
                links: sankeyData.links,
                lineStyle: {
                    color: lineStyle === 'gray' ? '#808080' : lineStyle, // Apply line style based on selection
                    curveness: 0.5,
                },
                emphasis: {
                    focus: 'adjacency',
                },
                nodeWidth: 20,
                nodeGap: 12,
                label: {
                    fontSize: 10,
                    color: '#000', // Set label text to black
                    overflow: 'break',
                },
                color: lineStyle !== 'gray' ? undefined : ['#6b6b6b'], // Only set color palette when not in gray mode
            },
        ],
    };


    const [chartSize, setChartSize] = useState({width: 1200, height: 800}); // Default size


    useEffect(() => {
        const serverNamesWithTables = servers
            .map((server) => server.display_server_name)
            .filter((serverName) => (tables[serverName] || []).length > 0);

        const missingServerNames = serverNamesWithTables.filter(
            (serverName) => !metadataServerCacheRef.current.has(serverName)
        );

        if (missingServerNames.length === 0) return;

        missingServerNames.forEach((serverName) => metadataServerCacheRef.current.add(serverName));

        const fetchBulkMetadata = async () => {
            try {
                const response = await axios.post('/api/site_metadata/bulk', {
                    displayNames: missingServerNames
                });
                const doiByServer = new Map(
                    (response.data || []).map((row) => [row.display_name, row.doi || ''])
                );

                setMetadataLinks(prev => {
                    const next = {...prev};
                    missingServerNames.forEach((serverName) => {
                        (tables[serverName] || []).forEach((table) => {
                            next[`${serverName}::${table.display_table_name}`] = doiByServer.get(serverName) || '';
                        });
                    });
                    return next;
                });
            } catch (error) {
                console.error('Error fetching bulk site metadata:', error);
                missingServerNames.forEach((serverName) => metadataServerCacheRef.current.delete(serverName));
            }
        };

        fetchBulkMetadata();
    }, [servers, tables]);

// State variables for managing the consent modal
    const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);
    const [consentGiven, setConsentGiven] = useState(false);
    const [pendingDownloadTable, setPendingDownloadTable] = useState(null);
    const [pendingDownloadServer, setPendingDownloadServer] = useState(null);
    const [pendingDownloadScope, setPendingDownloadScope] = useState(null);

// Function to open the consent modal
    const openConsentModal = (tableName, serverName, scope = null) => {
        // logInteraction("consent_modal_open", { tableName, serverName }, user); // Log when the consent modal opens
        setPendingDownloadTable(tableName);
        setPendingDownloadServer(serverName);
        setPendingDownloadScope(scope);
        setIsConsentModalOpen(true);
    };

    // put this near your other helpers
    const requiredMissingLabels = needExtraInfo && extraSchema
        ? findMissing(extraSchema, extraValues)  // returns array of labels
        : [];
    const hasRequiredMissing = requiredMissingLabels.length > 0;

    const saveExtraInfo = async () => {
        setExtraError('');
        const missing = findMissing(extraSchema, extraValues);
        if (missing.length) {
            setExtraError(`Please complete required fields: ${missing.join(', ')}`);
            return false;
        }
        try {
            setExtraLoading(true);
            const res = await fetch('/api/public/user_site_info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    serverName: pendingDownloadServer,
                    data: extraValues,
                    popia_consent: !!extraValues.popia_consent,// if you include a POPIA checkbox in the schema
                }),
            });
            if (!res.ok) {
                const msg = await res.json().catch(() => ({}));
                throw new Error(msg?.error || 'Failed to save details');
            }
            return true;
        } catch (e) {
            setExtraError(e.message || 'Failed to save details');
            return false;
        } finally {
            setExtraLoading(false);
        }
    };

    // optional visibility control: showIf: { field: 'id_kind', equals: 'passport' }
    const shouldShow = (field, values) => {
        const cond = field.showIf;
        if (!cond || !cond.field) return true;
        const v = values?.[cond.field];
        return Array.isArray(cond.equals) ? cond.equals.includes(v) : v === cond.equals;
    };
    // Updated download entry — disclaimer first, then consent
    const openDisclaimerThenConsent = async (tableName, serverName, scope = null) => {
        // Log intent to download
        logInteraction("download_clicked", { tableName, serverName, scope: scope?.type || 'date_range' }, user);

        // Remember what we’re downloading
        setPendingDownloadTable(tableName);
        setPendingDownloadServer(serverName);
        setPendingDownloadScope(scope);

        // after setIsDisclaimerOpen(true):
        (async () => {
            try {
                setExtraLoading(true);
                setExtraError('');
                setNeedExtraInfo(false);
                setExtraSchema(null);
                setExtraValues({});

                // 1) what does this site require?
                const reqRes = await fetch(`/api/public/site_requirements?serverName=${encodeURIComponent(serverName)}`, { credentials: 'include' });
                if (reqRes.ok) {
                    const req = await reqRes.json(); // { requireExtra, fields }
                    if (req.requireExtra) {
                        // 2) prefill if we have user data
                        const infoRes = await fetch(`/api/public/user_site_info?serverName=${encodeURIComponent(serverName)}`, { credentials: 'include' });
                        let existing = null;
                        if (infoRes.status === 204) existing = null;
                        else if (infoRes.ok) existing = await infoRes.json(); // { data, popia_consent, ... }

                        const data = existing?.data || {};
                        const missing = findMissing(req, data);

                        setExtraSchema(req);
                        setExtraValues(data || {});
                        setNeedExtraInfo(true); // show the form regardless of what's missing// only show form if something’s missing
                    }
                }
            } catch (e) {
                // be silent/fail-open; user can still continue
                console.error('prefetch site requirements failed', e);
            } finally {
                setExtraLoading(false);
            }
        })();

        // Try fetch a site/table-specific disclaimer
        const d = await fetchSiteDisclaimer(serverName, tableName);

        if (d && d.message) {
            setDisclaimer(d);
            setDisclaimerAck(false);
            setIsDisclaimerOpen(true);        // show disclaimer FIRST
        } else {
            openConsentModal(tableName, serverName, scope); // fallback straight to citation modal
        }
    };


    const handleConsent = () => {
        if (consentGiven) {
            // Pass the values directly
            if (pendingDownloadTable && pendingDownloadServer) {

                setIsConsentModalOpen(false);
                downloadData(pendingDownloadTable, pendingDownloadServer, pendingDownloadScope); // Proceed with the download
            } else {
                console.error("Table name or server name is missing.");
            }
        } else {
            alert("You must agree to the citation requirements before downloading.");
        }
    };


// Function to toggle consent checkbox
    const toggleConsent = () => {
        setConsentGiven(!consentGiven);
    };

    const handleViewMetadataClick = (doiUrl) => {
        // Log the interaction
        logInteraction("view_metadata", {metadata_url: doiUrl}, user);

        // Open the metadata link in a new tab
        window.open(doiUrl, "_blank", "noopener,noreferrer");
    };

    const handlesitevariableButtonClick = () => {
        // Log the interaction before opening the modal
        logInteraction("site_variable_mappings_button", {button_name: "Site variable mappings"}, user);

        // Open the filter modal
        setFilterModalIsOpen(true);
    };

    const handleGenerateSankeyClick = () => {
        // Log the interaction with the selected site name
        logInteraction("generate_sankey_data_tab", {selected_site: selectedServer}, user);

        // Proceed with generating the Sankey diagram
        generateSankey();
    };
    const [isFieldNamesModalOpen, setIsFieldNamesModalOpen] = useState(false);
    const [isFieldUnitsModalOpen, setIsFieldUnitsModalOpen] = useState(false);

    // updates a single extra field value
    const setExtra = (name, value) =>
        setExtraValues(prev => ({ ...prev, [name]: value }));

// renders a field from the site requirements schema
    const renderExtraField = (f) => {
        const type = (f.type || 'text').toLowerCase();
        const name = f.name;
        const val = extraValues?.[name];
        const placeholder = f.placeholder || '';
        const disabled = f.disabled || false;

        const setExtra = (n, v) => setExtraValues(prev => ({ ...prev, [n]: v }));

        switch (type) {
            case 'heading': // handled above; return null to be safe
            case 'static':
                return null;

            case 'radio':
                return (
                    <div className="radio-group">
                        {(f.options || []).map(opt => (
                            <label key={String(opt.value ?? opt)} className="radio-option">
                                <input
                                    type="radio"
                                    name={name}
                                    value={opt.value ?? opt}
                                    checked={(val ?? '') === (opt.value ?? opt)}
                                    onChange={(e) => setExtra(name, e.target.value)}
                                    disabled={disabled}
                                />
                                <span>{opt.label ?? String(opt)}</span>
                            </label>
                        ))}
                    </div>
                );

            case 'textarea':
                return (
                    <textarea
                        id={name}
                        value={val ?? ''}
                        onChange={(e) => setExtra(name, e.target.value)}
                        rows={4}
                        placeholder={placeholder}
                        disabled={disabled}
                    />
                );

            case 'select':
                return (
                    <select
                        id={name}
                        value={val ?? ''}
                        onChange={(e) => setExtra(name, e.target.value)}
                        disabled={disabled}
                    >
                        <option value="">-- select --</option>
                        {(f.options || []).map(opt => (
                            <option key={String(opt.value ?? opt)} value={opt.value ?? opt}>
                                {opt.label ?? String(opt)}
                            </option>
                        ))}
                    </select>
                );

            case 'date':
                return (
                    <input
                        id={name}
                        type="date"
                        value={val ?? ''}
                        onChange={(e) => setExtra(name, e.target.value)}
                        placeholder={placeholder}
                        disabled={disabled}
                    />
                );

            case 'month':
                return (
                    <input
                        id={name}
                        type="month"
                        value={val ?? ''}
                        onChange={(e) => setExtra(name, e.target.value)}
                        disabled={disabled}
                    />
                );

            case 'number':
                return (
                    <input
                        id={name}
                        type="number"
                        value={val ?? ''}
                        onChange={(e) => setExtra(name, e.target.value)}
                        placeholder={placeholder}
                        disabled={disabled}
                    />
                );

            case 'email':
                return (
                    <input
                        id={name}
                        type="email"
                        value={val ?? ''}
                        onChange={(e) => setExtra(name, e.target.value)}
                        placeholder={placeholder || 'name@example.org'}
                        disabled={disabled}
                    />
                );

            case 'tel':
                return (
                    <input
                        id={name}
                        type="tel"
                        value={val ?? ''}
                        onChange={(e) => setExtra(name, e.target.value)}
                        placeholder={placeholder || '+27 ...'}
                        disabled={disabled}
                    />
                );

            case 'checkbox':
                return (
                    <input
                        id={name}
                        type="checkbox"
                        checked={Boolean(val)}
                        onChange={(e) => setExtra(name, e.target.checked)}
                        disabled={disabled}
                    />
                );

            default:
                return (
                    <input
                        id={name}
                        type="text"
                        value={val ?? ''}
                        onChange={(e) => setExtra(name, e.target.value)}
                        placeholder={placeholder}
                        disabled={disabled}
                    />
                );
        }
    };

    return (
        <div className="scrollable-table-container">
            <div className="date-controls-container">
                <div className="controls-header">
                    <h2>Select date parameters for reporting</h2>
                    <p className="date-instructions">
                        Select a predefined date range from the dropdown or use the custom date pickers to set your
                        range.
                        You can generate data availability reports for all sites using the "View daily data availability
                        for all sites" button,
                        or for individual sites by clicking on each site to expand its details.
                        When expanded, you'll see when the site was last updated, preview the latest month's data,
                        download the available data,
                        or view the citation reference for that site. Once you've selected your date range, view the
                        data report using the appropriate button.
                    </p>
                </div>
                <div className="controls-content">
                    <div className="dropdown-container">
                        <button className="dropdown-button" onClick={handleDropdownClick}>
                            {dropdownOpen ? "Select Date Range ▲" : "Select Date Range ▼"}
                        </button>
                        {dropdownOpen && (
                            <div className="dropdown-menu">
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
                            </div>
                        )}
                    </div>
                    <div className="date-picker-container">
                        <DatePicker selected={startDate} onChange={date => setStartDate(date)} selectsStart
                                    startDate={startDate} endDate={endDate} dateFormat="dd-MM-yyyy"/>
                        <DatePicker selected={endDate} onChange={date => setEndDate(date)} selectsEnd
                                    startDate={startDate} endDate={endDate} minDate={startDate}
                                    dateFormat="dd-MM-yyyy"/>
                    </div>
                </div>
                <div className="data-filter-bar">
                    <label className="data-filter-field">
                        <span>Select site</span>
                        <select value={selectedSiteOption} onChange={(event) => handleSiteSelect(event.target.value)}>
                            <option value="">All sites</option>
                            {servers.map((server) => (
                                <option key={server.display_server_name} value={server.display_server_name}>
                                    {server.display_server_name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="data-filter-field">
                        <span>Select table</span>
                        <select
                            value={selectedTableOption}
                            onChange={(event) => handleTableSelect(event.target.value)}
                            disabled={!selectedSiteOption || !selectedSiteTables.length}
                        >
                            <option value="">{selectedSiteOption ? 'Choose a table' : 'Select a site first'}</option>
                            {selectedSiteTables.map((table) => (
                                <option key={table.display_table_name} value={table.display_table_name}>
                                    {table.display_table_name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="data-filter-summary">
                        {visibleServers.length} of {servers.length} sites
                    </div>
                </div>
                {dataNotice && (
                    <div className={`data-inline-notice data-inline-notice--${dataNotice.type}`}>
                        <span>{dataNotice.message}</span>
                        <button type="button" onClick={() => setDataNotice(null)} aria-label="Dismiss notice">×</button>
                    </div>
                )}


                <div className="expandable-container2">

                    <div className="expandable-row2">
                        <div className="tooltip2">
                            <button
                                className={`data-availability-button ${!isUserLoggedIn ? 'disabled-button' : ''}`}
                                onClick={isUserLoggedIn ? handleDailyDataAvailabilityClick : null}
                                disabled={!isUserLoggedIn}
                            >
                                View daily data availability for all sites
                            </button>
                            {!isUserLoggedIn && (
                                <span className="tooltiptext2">Please log in to access daily data availability</span>
                            )}
                        </div>
                    </div>

                    <div className="expandable-row2">
                        <div className="tooltip2">
                            <button
                                className="data-availability-button"
                                onClick={() => {
                                    handlesitevariableButtonClick();
                                    setFilterModalIsOpen(true);
                                }}
                            >
                                View site variable mappings
                            </button>
                            <span className="tooltiptext2">View and filter variable mappings for different sites</span>
                        </div>
                    </div>

                    <div className="expandable-row2">
                        <div className="tooltip2">
                            <button
                                className="data-availability-button"
                                onClick={() => setIsFieldNamesModalOpen(true)}
                            >
                                View variable descriptions
                            </button>
                            <span className="tooltiptext2">See the descriptions of variables across all sites</span>
                        </div>

                        {/* Modal for Variable Descriptions */}
                        <Modal
                            isOpen={isFieldNamesModalOpen}
                            onRequestClose={() => setIsFieldNamesModalOpen(false)}
                            contentLabel="Variable descriptions"
                            className="field-names-modal"
                            overlayClassName="field-names-modal-overlay"
                        >
                            <div className="field-names-modal-header">
                                <h3 className="field-names-modal-title">Variable descriptions</h3>
                                <div className="macos-window-controls">
                                    <div className="macos-button close"
                                         onClick={() => setIsFieldNamesModalOpen(false)}></div>
                                </div>
                            </div>
                            <div className="field-names-modal-body">
                                <table className="metadata-table">
                                    <thead>
                                    <tr>
                                        <th>Variable</th>
                                        <th>Description</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {metadata.fieldNames.map((field, index) => (
                                        <tr key={index}>
                                            <td>{field.display_field_name}</td>
                                            <td className={field.description ? '' : 'empty-description'}>
                                                {field.description || 'No description available'}
                                            </td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        </Modal>
                    </div>

                    <div className="expandable-row2">
                        <div className="tooltip2">
                            <button
                                className="data-availability-button"
                                onClick={() => setIsFieldUnitsModalOpen(true)}
                            >
                                View unit descriptions
                            </button>
                            <span className="tooltiptext2">See the descriptions of measurement units used across all sites</span>
                        </div>

                        {/* Modal for Unit Descriptions */}
                        <Modal
                            isOpen={isFieldUnitsModalOpen}
                            onRequestClose={() => setIsFieldUnitsModalOpen(false)}
                            contentLabel="Unit Descriptions"
                            className="field-names-modal"
                            overlayClassName="field-names-modal-overlay"
                        >
                            <div className="field-names-modal-header">
                                <h3 className="field-names-modal-title">Unit descriptions</h3>
                                <div className="macos-window-controls">
                                    <div className="macos-button close"
                                         onClick={() => setIsFieldUnitsModalOpen(false)}></div>
                                </div>
                            </div>
                            <div className="field-names-modal-body">
                                <table className="metadata-table">
                                    <thead>
                                    <tr>
                                        <th>Unit</th>
                                        <th>Description</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {metadata.fieldUnits.map((unit, index) => (
                                        <tr key={index}>
                                            <td>{unit.units}</td>
                                            <td className={unit.units_description ? '' : 'empty-description'}>
                                                {unit.units_description || 'No description available'}
                                            </td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        </Modal>
                    </div>
                </div>

                {/* Important Notice */}
                <div className="important-notice">
                    <p>
                        <strong>Important Notice:</strong> If you download and use the data, please note that a DOI
                        linking to the SAEON data portal will be provided as a header in the CSV file. This DOI is
                        applicable to all tables and variables associated with a specific monitoring site and must be
                        cited when referencing the dataset. Proper citation ensures the data is traceable and credits
                        are given appropriately for the resources used.
                    </p>
                    <p>
                        <strong>Note for flux data users:</strong>{' '}
                        Flux (eddy-covariance) datasets require specialised processing and
                        gap-filling before analysis. For details, see the{' '}
                        <a
                            href="/about#efteon"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            EFTEON section
                        </a>{' '}
                        on the About page.
                    </p>
                </div>
            </div>


            {/*<div>*/}
            {/*    <progress id="progress-bar" value="0" max="0"></progress>*/}
            {/*    <span id="progress-text">Downloading...</span>*/}
            {/*</div>*/}

            {renderServerSelectionModal()}
            {loading && (

                <div className="loading-overlay">
                    <LoadingSpinner/>
                    <div className="loading-message">{loadingMessage}</div>
                </div>
            )}
            <table>
                <tbody>
                <tr>
                    <td colSpan={1}>
                        <div className="button-row">

                            {/*// Filter Modal (updated to ensure selection and modal behavior)*/}
                            <Modal
                                isOpen={filterModalIsOpen}
                                onRequestClose={() => setFilterModalIsOpen(false)}
                                contentLabel="Select Site for Variable Mappings"
                                className="custom-sankey-modal"
                                overlayClassName="custom-sankey-modal-overlay"
                            >
                                <div className="custom-sankey-modal-content">
                                    {/* Close Button */}
                                    <div className="macos-window-controls">
                                        <div className="macos-button close"
                                             onClick={() => setFilterModalIsOpen(false)}></div>

                                    </div>


                                    {/* Title */}
                                    <h2 className="custom-sankey-modal-title">Select a site for variable mapping</h2>

                                    {/* Scrollable Container for Radio Buttons */}
                                    <div className="custom-server-selection">
                                        {availableServers.map((server) => (
                                            <div key={server} className="custom-server-option">
                                                <input
                                                    type="radio"
                                                    id={server}
                                                    name="server"
                                                    checked={selectedServer === server}
                                                    onChange={() => setSelectedServer(server)}
                                                />
                                                <label htmlFor={server}>{server}</label>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Fixed Button at the Bottom */}
                                    {/* Fixed Button at the Bottom */}
                                    <div className="custom-modal-actions">
                                        <button onClick={handleGenerateSankeyClick}>Show variable mappings</button>
                                    </div>
                                </div>
                            </Modal>

                            {/*// Sankey Diagram Modal (same as before)*/}
                            <Modal
                                isOpen={sankeyModalIsOpen}
                                onRequestClose={() => setSankeyModalIsOpen(false)}
                                contentLabel="Sankey Diagram"
                                overlayClassName="sankey-modal-overlay"
                                className="sankey-modal"
                            >
                                <div className="sankey-modal-header">
                                    <div className="macos-window-controls">
                                        <div className="macos-button close"
                                             onClick={() => setSankeyModalIsOpen(false)}></div>
                                    </div>

                                    <h2>Site-variable mappings</h2>
                                    <div className="sankey-size-buttons">
                                        <button onClick={() => setChartSize(prevSize => ({
                                            width: prevSize.width - 200,
                                            height: prevSize.height - 150
                                        }))}>
                                            Reduce Size
                                        </button>
                                        <button onClick={() => setChartSize(prevSize => ({
                                            width: prevSize.width + 200,
                                            height: prevSize.height + 150
                                        }))}>
                                            Increase Size
                                        </button>
                                    </div>
                                    <div className="sankey-line-style-buttons">
                                        <button onClick={() => setLineStyle('source')}>Line Color: Source</button>
                                        <button onClick={() => setLineStyle('target')}>Line Color: Target</button>
                                        <button onClick={() => setLineStyle('gray')}>Line Color: Gray</button>
                                    </div>
                                    <button className="sankey-save-button" onClick={saveChart}>Save Chart</button>
                                </div>
                                <div className="sankey-container"
                                     style={{overflow: 'auto', width: '100%', height: '100%'}}>
                                    {sankeyData ? (
                                        <ReactECharts
                                            ref={chartRef}
                                            option={sankeyOptions}
                                            style={{width: `${chartSize.width}px`, height: `${chartSize.height}px`}}
                                        />
                                    ) : (
                                        <p>Loading Sankey diagram...</p>
                                    )}
                                </div>
                            </Modal>


                        </div>
                    </td>
                </tr>


                {visibleServers.map((server) => (
                    <React.Fragment key={server.display_server_name}>
                        <tr>
                            <td colSpan={6}>
                                <button className="site-name-button"
                                        onClick={() => toggleServer(server.display_server_name)}>
                                <span className="button-content">
                                    {server.display_server_name}
                                    <FontAwesomeIcon
                                        icon={activeServer === server.display_server_name ? farFolderOpen : farFolder}
                                        className="icon-right"/>
                                </span>
                                </button>
                            </td>
                        </tr>
                        {activeServer === server.display_server_name && tableLoading[server.display_server_name] && (
                            <tr>
                                <td colSpan={6}>
                                    <div className="data-empty-row">Loading tables for {server.display_server_name}...</div>
                                </td>
                            </tr>
                        )}
                        {activeServer === server.display_server_name && !tableLoading[server.display_server_name] && tableErrors[server.display_server_name] && (
                            <tr>
                                <td colSpan={6}>
                                    <div className="data-empty-row data-empty-row--error">{tableErrors[server.display_server_name]}</div>
                                </td>
                            </tr>
                        )}
                        {activeServer === server.display_server_name && !tableLoading[server.display_server_name] && !tableErrors[server.display_server_name] && tables[server.display_server_name] && getVisibleTables(server.display_server_name).length === 0 && (
                            <tr>
                                <td colSpan={6}>
                                    <div className="data-empty-row">No tables match the current filter.</div>
                                </td>
                            </tr>
                        )}
                        {activeServer === server.display_server_name && !tableLoading[server.display_server_name] && !tableErrors[server.display_server_name] && tables[server.display_server_name] && getVisibleTables(server.display_server_name).map((table) => (
                            <tr key={table.display_table_name}
                                className={highlightedTable === table.display_table_name ? 'highlighted' : ''}>
                                <td colSpan={6}>
                                    <div className="data-table-action-row">
                                    <div className="tooltip data-table-main-action">

                                        <button
                                            className={`table-name-button ${!isUserLoggedIn ? 'disabled-button' : ''}`}
                                            onClick={isUserLoggedIn ? () => openTableModal(table.display_table_name, server.display_server_name) : null}
                                        >
                                            <FontAwesomeIcon icon={faTable} className="icon-left"/>

                                            {/* Display the table name with the preview text */}
                                            <span className="table-name">
                                            {table.display_table_name} <span className="preview-text">(latest-month preview)</span>
                                                </span>

                                            <span className={`date-range-display ${dateRanges[getDateRangeKey(server.display_server_name, table.display_table_name)]?.error ? 'error-text' : ''}`}>
                                                {getDateRangeLabel(dateRanges[getDateRangeKey(server.display_server_name, table.display_table_name)])}
                                            </span>
                                        </button>

                                        {dateRanges[`${server.display_server_name}-${table.display_table_name}`] && getStatusIndicator(dateRanges[`${server.display_server_name}-${table.display_table_name}`].end_date)}
                                    </div>


                                    <div className="tooltip data-table-secondary-action">
                                        <button
                                            className={`data-availability-button2 ${!isUserLoggedIn ? 'disabled-button' : ''}`}
                                            onClick={isUserLoggedIn ? () => fetchDataAvailability(server.display_server_name, table.display_table_name) : null}
                                        >
                                            <FontAwesomeIcon icon={faInfoCircle}/> Data Availability
                                        </button>
                                        {!isUserLoggedIn && (
                                            <span className="tooltiptext">Please log in to access</span>
                                        )}
                                    </div>
                                    <div className="tooltip data-table-secondary-action">
                                        {/*<button*/}
                                        {/*    className={`download-button ${!isUserLoggedIn ? 'disabled-button' : ''}`}*/}
                                        {/*    onClick={isUserLoggedIn ? () => openConsentModal(table.display_table_name, server.display_server_name) : null}*/}
                                        {/*>*/}
                                        {/*    <FontAwesomeIcon icon={faDownload}/> Download*/}
                                        {/*</button>*/}
                                        <button
                                            className={`download-button ${!isUserLoggedIn ? 'disabled-button' : ''}`}
                                            onClick={isUserLoggedIn ? () => openDownloadChoiceModal(table.display_table_name, server.display_server_name) : null}
                                        >
                                            <FontAwesomeIcon icon={faDownload}/> Download
                                        </button>
                                        {!isUserLoggedIn && (
                                            <span className="tooltiptext">
                                            Please log in to access
                                                </span>
                                        )}
                                    </div>

                                    <Modal
                                        isOpen={isConsentModalOpen}
                                        onRequestClose={() => setIsConsentModalOpen(false)}
                                        contentLabel="Citation Consent"
                                        className="modal"
                                        overlayClassName="modal-overlay"
                                    >
                                        <div className="consent-modal-content">
                                            <h3>Citation Requirement</h3>
                                            <p>
                                                By downloading this data, you agree to cite the dataset using the DOI
                                                provided in the downloaded file. Proper citation ensures the data is
                                                traceable and credits are given appropriately for the resources used.
                                                The DOI refers to all tables and variables for this site.
                                            </p>
                                            <div className="consent-checkbox">
                                                <input
                                                    type="checkbox"
                                                    checked={consentGiven}
                                                    onChange={toggleConsent}
                                                />
                                                <label>I agree to cite this dataset according to the provided
                                                    DOI.</label>
                                            </div>
                                            <div className="consent-modal-actions">
                                                <button onClick={handleConsent}>Proceed to Download</button>
                                                <button onClick={() => setIsConsentModalOpen(false)}>Cancel</button>
                                            </div>
                                        </div>
                                    </Modal>
                                    {/* Metadata Link */}

                                    <div className="tooltip data-table-secondary-action">
                                        {(() => {
                                            const doiKey = `${server.display_server_name}::${table.display_table_name}`;
                                            const doiUrl = metadataLinks[doiKey];

                                            if (doiUrl === undefined) {
                                                return <span className="metadata-link metadata-link--loading">Loading citation...</span>;
                                            }

                                            return doiUrl ? (
                                                <a
                                                    href={doiUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="metadata-link"
                                                    onClick={() =>
                                                        logInteraction("view_metadata", { metadata_url: doiUrl }, user)
                                                    }
                                                >
                                                    <FontAwesomeIcon icon={faInfoCircle}/> Citation details
                                                </a>
                                            ) : (
                                                <span className="metadata-link metadata-link--loading">No citation</span>
                                            );
                                        })()}
                                    </div>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </React.Fragment>
                ))}
                </tbody>
            </table>

            {/* Progress Popup */}
            {isDownloading && (
                <div
                    id="downloadProgressWidgetPopup"
                    className="download-progress-widget"
                    role="status"
                    aria-live="polite"
                >
                    <div id="downloadProgressWidgetTitle">
                        <h3>{downloadTitle}</h3>
                        <button
                            type="button"
                            className="download-progress-close"
                            onClick={hideDownloadProgressWidget}
                            aria-label="Close download progress"
                        >
                            &times;
                        </button>
                    </div>
                    <progress
                        id="downloadProgressWidgetBar"
                        {...(progressMax > 0 ? {value: progressValue, max: progressMax} : {})}
                    />
                    <p id="downloadProgressWidgetText">{progressText}</p>
                </div>
            )}
            <Modal
                isOpen={isDownloadChoiceOpen}
                onRequestClose={() => setIsDownloadChoiceOpen(false)}
                contentLabel="Choose Download Range"
                className="download-choice-modal"
                overlayClassName="modal-overlay"
            >
                {(() => {
                    const tableName = downloadChoiceContext?.tableName;
                    const serverName = downloadChoiceContext?.serverName;
                    const latestMonthScope = tableName && serverName ? buildRecentMonthsScope(serverName, tableName, 1) : null;
                    const threeMonthScope = tableName && serverName ? buildRecentMonthsScope(serverName, tableName, 3) : null;
                    const twelveMonthScope = tableName && serverName ? buildRecentMonthsScope(serverName, tableName, 12) : null;
                    const range = tableName && serverName ? getTableDateRange(serverName, tableName) : null;

                    return (
                        <div className="download-choice-content">
                            <div className="download-choice-header">
                                <p className="download-choice-eyebrow">CSV download</p>
                                <button
                                    type="button"
                                    className="download-choice-close"
                                    onClick={() => setIsDownloadChoiceOpen(false)}
                                    aria-label="Close download options"
                                >
                                    &times;
                                </button>
                            </div>
                            <h3>{serverName}</h3>
                            <p className="download-choice-table">{tableName}</p>

                            <div className="download-choice-options">
                                <button
                                    type="button"
                                    className="download-choice-option"
                                    onClick={() => startDownloadWithScope(latestMonthScope)}
                                    disabled={!latestMonthScope?.startDate || !latestMonthScope?.endDate}
                                >
                                    <strong>Latest month</strong>
                                    <span>{getDownloadScopeLabel(latestMonthScope)}</span>
                                </button>
                                <button
                                    type="button"
                                    className="download-choice-option"
                                    onClick={() => startDownloadWithScope(threeMonthScope)}
                                    disabled={!threeMonthScope?.startDate || !threeMonthScope?.endDate}
                                >
                                    <strong>Latest 3 months</strong>
                                    <span>{getDownloadScopeLabel(threeMonthScope)}</span>
                                </button>
                                <button
                                    type="button"
                                    className="download-choice-option"
                                    onClick={() => startDownloadWithScope(twelveMonthScope)}
                                    disabled={!twelveMonthScope?.startDate || !twelveMonthScope?.endDate}
                                >
                                    <strong>Latest 12 months</strong>
                                    <span>{getDownloadScopeLabel(twelveMonthScope)}</span>
                                </button>
                                <button
                                    type="button"
                                    className="download-choice-option download-choice-option--large"
                                    onClick={() => startDownloadWithScope({type: 'full'})}
                                >
                                    <strong>Full available archive</strong>
                                    <span>
                                        Uses the prepared CSV for the full site-table history{range?.start_date && range?.end_date ? ` (${getDateRangeLabel(range)})` : ''}.
                                    </span>
                                </button>
                            </div>

                            <p className="download-choice-note">
                                Large archive files can be hundreds of MB. Use monthly or selected-range downloads when you only need a short period.
                            </p>
                        </div>
                    );
                })()}
            </Modal>
            <Modal
                isOpen={isModalOpen}
                onRequestClose={closeModal}
                contentLabel="Table Data"
                className="modal"
                overlayClassName="modal-overlay"
            >

                <div className="macos-window-controls">
                    <div className="macos-button close" onClick={() => closeModal()}></div>

                </div>
                {/*<button className="close-button" onClick={closeModal}>*/}
                {/*    X*/}
                {/*</button>*/}
                {modalContent && renderTableData(modalContent)}
            </Modal>


            <Modal
                isOpen={isCustomModalOpen}
                onRequestClose={closeCustomModal}
                contentLabel="Data Availability"
                className="modal"
                overlayClassName="modal-overlay"
            >
                {/* Remove macOS 'red dot' controls to avoid confusion */}
                {/* <div className="macos-window-controls"> ... </div> */}

                {modalData && (
                    <DataAvailabilityModalContent
                        data={modalData}
                        onClose={closeCustomModal}
                    />
                )}
            </Modal>

            <Modal
                isOpen={isDisclaimerOpen}
                onRequestClose={() => setIsDisclaimerOpen(false)}
                contentLabel="Site-specific Disclaimer"
                className="modal"                // keep existing
                overlayClassName="modal-overlay" // keep existing
            >
                <div className="disclaimer-modal-content">
                    <div className="disclaimer-modal-header">
                        <h3 className="disclaimer-title">⚠️ Site Disclaimer</h3>
                        <button
                            className="disclaimer-close-btn"
                            onClick={() => {
                                   setIsDisclaimerOpen(false);
                                   setDisclaimer(null);
                                   setDisclaimerAck(false);
                                   setNeedExtraInfo(false);
                                   setExtraSchema(null);
                                   setExtraValues({});
                                  setExtraError('');
                                   // setPendingDownloadTable(null);
                                       // setPendingDownloadServer(null);
                                         }}
                            aria-label="Close Disclaimer"
                        >
                            ×
                        </button>
                    </div>

                    <div className="disclaimer-body">
                        <p className="disclaimer-message">
                            {disclaimer?.message ?? 'Please review the site-specific notice.'}
                        </p>

                        {disclaimer?.contactEmail && (
                            <p className="disclaimer-contact">
                                Contact:{' '}
                                <a href={`mailto:${disclaimer.contactEmail}`} className="disclaimer-contact-link">
                                    {disclaimer.contactEmail}
                                </a>
                            </p>
                        )}

                        {disclaimer?.requireAck && (
                            <div className="disclaimer-acknowledgement">
                                <input
                                    type="checkbox"
                                    id="disclaimerAck"
                                    checked={disclaimerAck}
                                    onChange={() => setDisclaimerAck(v => !v)}
                                />
                                <label htmlFor="disclaimerAck">I acknowledge this site-specific disclaimer.</label>
                            </div>
                        )}
                    </div>
                    {extraLoading && (
                        <div className="disclaimer-extra-loading">Checking site requirements…</div>
                    )}

                    {!extraLoading && extraSchema?.fields?.length > 0 && (
                        <div className="disclaimer-extra">
                            <h4 className="disclaimer-extra-title">
                                Additional details required for {pendingDownloadServer}
                            </h4>

                            <div className="disclaimer-extra-grid">
                                {extraSchema.fields
                                    .filter(f => shouldShow(f, extraValues))
                                    .map(f => (
                                        f.type?.toLowerCase() === 'static' || f.type?.toLowerCase() === 'heading'
                                            ? (
                                                <div key={f.name} className={`disclaimer-static ${f.variant || ''}`}>
                                                    {f.title && <div className="disclaimer-heading">{f.title}</div>}
                                                    {f.content && <div className="disclaimer-copy">{f.content}</div>}
                                                </div>
                                            ) : (
                                                <label
                                                    key={f.name}
                                                    htmlFor={f.name}
                                                    className={`disclaimer-extra-field type-${(f.type||'text').toLowerCase()}`}
                                                >
          <span className="disclaimer-extra-label">
            {f.label || f.name}{f.required ? ' *' : ''}
          </span>
                                                    <div className="disclaimer-extra-input">
                                                        {renderExtraField(f)}
                                                    </div>
                                                </label>
                                            )
                                    ))}
                            </div>

                            {extraError && <div className="disclaimer-extra-error">{extraError}</div>}
                        </div>
                    )}
                    <div className="disclaimer-actions">
                        <button
                            className="disclaimer-btn disclaimer-btn-primary"
                            onClick={async () => {
                                // Must acknowledge if required
                                if (disclaimer?.requireAck && !disclaimerAck) return;

                                // If extra info is required, validate then save
                                if (needExtraInfo && extraSchema) {
                                    const missing = findMissing(extraSchema, extraValues);
                                    if (missing.length) {
                                        setExtraError(`Please complete required fields: ${missing.join(', ')}`);
                                        return; // stay in modal
                                    }
                                    const ok = await saveExtraInfo();
                                    if (!ok) return; // stay in modal if save failed
                                }

                                // All good — close disclaimer and open consent
                                setIsDisclaimerOpen(false);
                                logInteraction('site_disclaimer_ack', {
                                    serverName: pendingDownloadServer,
                                    tableName: pendingDownloadTable,
                                    siteName: disclaimer?.siteName || pendingDownloadServer
                                }, user);
                                openConsentModal(pendingDownloadTable, pendingDownloadServer, pendingDownloadScope);
                            }}
                            disabled={(disclaimer?.requireAck && !disclaimerAck) || (needExtraInfo && hasRequiredMissing) || extraLoading}
                        >
                            Continue
                        </button>
                        {extraError && <div className="disclaimer-extra-error">{extraError}</div>}
                        {needExtraInfo && (findMissing(extraSchema, extraValues).length > 0) && (
                            <div className="disclaimer-extra-hint">Please complete all required fields to continue.</div>
                        )}

                        <button
                            className="disclaimer-btn disclaimer-btn-secondary"
                            onClick={() => {
                                // hard cancel: close and reset, do NOT proceed
                                setIsDisclaimerOpen(false);
                                setDisclaimer(null);
                                setDisclaimerAck(false);
                                setNeedExtraInfo(false);
                                setExtraSchema(null);
                                setExtraValues({});
                                setExtraError('');
                                // Optional: also clear pending download state if you want a full abort:
                                // setPendingDownloadTable(null);
                                // setPendingDownloadServer(null);
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </Modal>

        </div>
    );
};

export default Data;
