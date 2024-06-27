import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFolder as farFolder, faFolderOpen as farFolderOpen, faTable, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import Modal from "react-modal";
import DatePicker from "react-datepicker";
import {
    startOfToday,
    endOfToday,
    startOfYesterday,
    endOfYesterday,
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
    startOfYear,
    endOfYear,
    subWeeks,
    subMonths,
    subYears
} from 'date-fns';
import "react-datepicker/dist/react-datepicker.css";
import "./ScrollableTable.css";
import "./Newmodal.css";

Modal.setAppElement("#root");

const MappingSummaryTable = () => {
    const [servers, setServers] = useState([]);
    const [activeServer, setActiveServer] = useState(null);
    const [tables, setTables] = useState({});
    const [dateRanges, setDateRanges] = useState({});
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState(null);
    const [startDate, setStartDate] = useState(new Date(new Date().setFullYear(new Date().getFullYear() - 1))); // Default to one year ago
    const [endDate, setEndDate] = useState(new Date());
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(100);
    const [totalRows, setTotalRows] = useState(0);
    const [currentTableName, setCurrentTableName] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [dropdownOpen, setDropdownOpen] = useState(false);

    useEffect(() => {
        setLoading(true);
        setLoadingMessage('Loading servers...');
        fetch("/api/summary_table/servers")
            .then(response => response.json())
            .then(data => {
                console.log('Servers fetched:', data);
                const uniqueServers = data.reduce((acc, row) => {
                    if (!acc.some(server => server.display_server_name === row.display_server_name)) {
                        acc.push(row);
                    }
                    return acc;
                }, []);
                setServers(uniqueServers.sort((a, b) => a.display_server_name.localeCompare(b.display_server_name)));
                setLoading(false);
            })
            .catch(error => {
                console.error("Error fetching servers:", error);
                setLoading(false);
            });
    }, []);

    const toggleServer = (serverName) => {
        setActiveServer(prev => prev === serverName ? null : serverName);
        if (!tables[serverName]) {
            fetchTables(serverName);
        }
    };

    const fetchTables = async (serverName) => {
        try {
            setLoading(true);
            setLoadingMessage('Loading tables...');
            const response = await fetch(`/api/summary_table/tables?serverName=${serverName}`);
            const data = await response.json();
            console.log(`Tables fetched for ${serverName}:`, data);
            if (response.ok) {
                const uniqueTables = data.reduce((acc, row) => {
                    if (!acc.some(table => table.display_table_name === row.display_table_name)) {
                        acc.push(row);
                    }
                    return acc;
                }, []);
                setTables(prevTables => ({
                    ...prevTables,
                    [serverName]: uniqueTables.sort((a, b) => a.display_table_name.localeCompare(b.display_table_name))
                }));
                uniqueTables.forEach(table => fetchDateRange(serverName, table.display_table_name));
                setLoading(false);
            } else {
                throw new Error("Failed to fetch tables");
            }
        } catch (error) {
            console.error("Error fetching tables:", error);
            setLoading(false);
        }
    };

    const fetchDateRange = async (serverName, tableName) => {
        try {
            const response = await fetch(`/api/summary_table/date_range?serverName=${serverName}&tableName=${tableName}`);
            const data = await response.json();
            console.log(`Date range fetched for ${serverName} - ${tableName}:`, data);
            if (response.ok) {
                setDateRanges(prevDateRanges => ({
                    ...prevDateRanges,
                    [`${serverName}-${tableName}`]: data
                }));
            }
        } catch (error) {
            console.error("Error fetching date range:", error);
        }
    };

    const fetchTableData = async (tableName, serverName, page = 1) => {
        if (!tableName || !serverName) return;

        const dateRangeKey = `${serverName}-${tableName}`;
        const defaultStartDate = dateRanges[dateRangeKey]?.start_date ? new Date(dateRanges[dateRangeKey].start_date) : new Date(new Date().setFullYear(new Date().getFullYear() - 1));
        const defaultEndDate = dateRanges[dateRangeKey]?.end_date ? new Date(dateRanges[dateRangeKey].end_date) : new Date();
        setStartDate(defaultStartDate);
        setEndDate(defaultEndDate);

        setLoading(true);
        setLoadingMessage('Loading table data...');
        const formattedStartDate = defaultStartDate.toISOString().split("T")[0];
        const formattedEndDate = defaultEndDate.toISOString().split("T")[0];
        const url = `/api/summary_table/values?tableName=${tableName}&serverName=${serverName}&startDate=${formattedStartDate}&endDate=${formattedEndDate}&page=${page}&pageSize=${pageSize}`;

        try {
            const response = await fetch(url);
            const data = await response.json();
            console.log(`Data fetched for ${tableName} under ${serverName}:`, data.rows);
            if (response.ok && Array.isArray(data.rows)) {
                setModalContent(data.rows);
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
        } catch (error) {
            console.error("Error fetching table details:", error);
            setLoading(false);
        }
    };


    const clearAndReloadData = async () => {
        setModalContent(null);
        setLoading(true);
        setLoadingMessage('Reloading data...');

        const formattedStartDate = startDate.toISOString().split("T")[0];
        const formattedEndDate = endDate.toISOString().split("T")[0];
        const url = `/api/summary_table/values?tableName=${currentTableName}&serverName=${activeServer}&startDate=${formattedStartDate}&endDate=${formattedEndDate}&page=1&pageSize=${totalRows}`;

        try {
            const response = await fetch(url);
            const data = await response.json();
            console.log(`Data fetched for ${currentTableName} under ${activeServer}:`, data);
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

    const closeModal = () => {
        setIsModalOpen(false);
        setModalContent(null);
    };

    const downloadData = async () => {
        if (!currentTableName || !activeServer) return;

        setLoading(true);
        setLoadingMessage('Downloading data...');

        const formattedStartDate = startDate.toISOString().split("T")[0];
        const formattedEndDate = endDate.toISOString().split("T")[0];
        const url = `/api/summary_table/values?tableName=${currentTableName}&serverName=${activeServer}&startDate=${formattedStartDate}&endDate=${formattedEndDate}&page=1&pageSize=${totalRows}`;

        try {
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();

                // Transform the data for download
                const transformedData = transformData(data.rows);

                // Get unique field names for header
                const fieldNames = Array.from(new Set(data.rows.map(item => item.display_field_name.trim()))).sort();
                const fieldUnits = data.rows.reduce((acc, item) => {
                    acc[item.display_field_name.trim()] = item.units;
                    return acc;
                }, {});

                // Create headers and units row
                const headers = ['Timestamp', ...fieldNames, 'Latitude', 'Longitude'];
                const units = ['', ...fieldNames.map(name => fieldUnits[name] || ''), '', ''];

                // Convert array to CSV string
                const csvContent = [
                    headers.join(','),
                    units.join(','),
                    ...transformedData.map(row => [
                        row.timestamp.replace(',', 'T'),  // Replace comma with 'T'
                        ...fieldNames.map(name => row[name] || ''),
                        row.latitude,
                        row.longitude
                    ].join(','))
                ].join('\n');

                // Create new blob with CSV content
                const csvBlob = new Blob([csvContent], { type: 'text/csv' });
                const downloadUrl = window.URL.createObjectURL(csvBlob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = 'data.csv';
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(downloadUrl);
                setLoading(false);
            } else {
                console.error("Failed to download data");
                setLoading(false);
            }
        } catch (error) {
            console.error("Error downloading data:", error);
            setLoading(false);
        }
    };

    const handlePageSizeChange = (newSize) => {
        setPageSize(newSize);
        fetchTableData(currentTableName, activeServer, 1);
    };

    const nextPage = () => {
        if (currentPage < Math.ceil(totalRows / pageSize)) {
            const newPage = currentPage + 1;
            setCurrentPage(newPage);
            fetchTableData(currentTableName, activeServer, newPage);
        }
    };

    const prevPage = () => {
        if (currentPage > 1) {
            const newPage = currentPage - 1;
            setCurrentPage(newPage);
            fetchTableData(currentTableName, activeServer, newPage);
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

    const renderTableData = (data) => {
        if (!data || data.length === 0) return <p>No data available</p>;

        // Transform the data
        const transformedData = transformData(data);

        // Get unique field names for header
        const fieldNames = Array.from(new Set(data.map(item => item.display_field_name.trim()))).sort();
        const fieldUnits = data.reduce((acc, item) => {
            acc[item.display_field_name.trim()] = item.units;
            return acc;
        }, {});

        return (
            <div className="modal-content">
                <div className="date-picker-container">
                    <div className="date-picker">
                        <DatePicker selected={startDate} onChange={date => setStartDate(date)} dateFormat="dd/MM/yyyy" />
                        <DatePicker selected={endDate} onChange={date => setEndDate(date)} dateFormat="dd/MM/yyyy" />
                    </div>
                    <div className="download-button">
                        <button onClick={downloadData}>Download</button>
                    </div>
                </div>
                <div className="pagination-controls">
                    <button onClick={prevPage} disabled={currentPage === 1}>←</button>
                    Page: <input type="number" value={currentPage} onChange={e => setCurrentPage(Number(e.target.value))} />
                    <button onClick={nextPage}>→</button>
                    Page Size:
                    <select value={pageSize} onChange={e => handlePageSizeChange(Number(e.target.value))}>
                        <option value="100">100</option>
                        <option value="200">200</option>
                        <option value="300">300</option>
                        <option value="400">400</option>
                        <option value="500">500</option>
                    </select>
                    <span>Total Records: {totalRows}</span>
                    <span>Total Pages: {Math.ceil(totalRows / pageSize)}</span>
                </div>
                <table className="data-table">
                    <thead>
                    <tr>
                        <th>Timestamp</th>
                        {fieldNames.map(fieldName => (
                            <th key={fieldName}>{fieldName}</th>
                        ))}
                        <th>Latitude</th>
                        <th>Longitude</th>
                    </tr>
                    <tr>
                        <th></th>
                        {fieldNames.map(fieldName => (
                            <th key={`${fieldName}-unit`}>{fieldUnits[fieldName]}</th>
                        ))}
                        <th></th>
                        <th></th>
                    </tr>
                    </thead>
                    <tbody>
                    {transformedData.map((row, index) => (
                        <tr key={index}>
                            <td>{row.timestamp}</td>
                            {fieldNames.map(fieldName => (
                                <td key={fieldName}>{row[fieldName] || ''}</td>
                            ))}
                            <td>{row.latitude}</td>
                            <td>{row.longitude}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        );
    };

    const handleDropdownClick = () => {
        const isOpening = !dropdownOpen;
        setDropdownOpen(isOpening);

        // Disable body scroll when dropdown is open
        document.body.style.overflow = isOpening ? 'hidden' : 'auto';
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

        if (diffInDays <= 2) {
            return <span className="status-indicator green">Updated recently (last few days) </span>;
        } else if (diffInDays <= 7) {
            return <span className="status-indicator blue">Updated this week</span>;
        } else if (diffInDays <= 30) {
            return <span className="status-indicator yellow">Updated this month</span>;
        } else {
            return <span className="status-indicator red">Needs update (> month)</span>;
        }
    };

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
                                <button className="dropdown-item" onClick={() => { handleDateRangeSelection(startOfToday(), endOfToday()); handleDropdownClick(); }}>Today</button>
                                <button className="dropdown-item" onClick={() => { handleSelectYesterday(); handleDropdownClick(); }}>Yesterday</button>
                                <button className="dropdown-item" onClick={() => { handleSelectThisWeek(); handleDropdownClick(); }}>This Week</button>
                                <button className="dropdown-item" onClick={() => { handleSelectLastWeek(); handleDropdownClick(); }}>Last Week</button>
                                <button className="dropdown-item" onClick={() => { handleSelectThisMonth(); handleDropdownClick(); }}>This Month</button>
                                <button className="dropdown-item" onClick={() => { handleSelectLastMonth(); handleDropdownClick(); }}>Last Month</button>
                                <button className="dropdown-item" onClick={() => { handleSelectThisYear(); handleDropdownClick(); }}>This Year</button>
                                <button className="dropdown-item" onClick={() => { handleSelectLastYear(); handleDropdownClick(); }}>Last Year</button>
                            </div>
                        )}
                    </div>
                    <div className="date-picker-container">
                        <DatePicker selected={startDate} onChange={date => setStartDate(date)} selectsStart startDate={startDate} endDate={endDate} dateFormat="dd-MM-yyyy" />
                        <DatePicker selected={endDate} onChange={date => setEndDate(date)} selectsEnd startDate={startDate} endDate={endDate} minDate={startDate} dateFormat="dd-MM-yyyy" />
                    </div>
                </div>
            </div>

            {loading && (
                <div className="loading-overlay">
                    <div className="loading-message">{loadingMessage}</div>
                </div>
            )}
            <table>
                <tbody>
                {servers.map((server) => (
                    <React.Fragment key={server.display_server_name}>
                        <tr>
                            <td colSpan={6}>
                                <button className="site-name-button" onClick={() => toggleServer(server.display_server_name)}>
                                    <span className="button-content">
                                        {server.display_server_name}
                                        <FontAwesomeIcon icon={activeServer === server.display_server_name ? farFolderOpen : farFolder} className="icon-right" />
                                    </span>
                                </button>
                            </td>
                        </tr>
                        {activeServer === server.display_server_name && tables[server.display_server_name] && tables[server.display_server_name].map((table) => (
                            <tr key={table.display_table_name}>
                                <td colSpan={6}>
                                    <button className="table-name-button" onClick={() => openTableModal(table.display_table_name, server.display_server_name)}>
                                        <FontAwesomeIcon icon={faTable} className="icon-left" />
                                        <span className="table-name">{table.display_table_name}</span>
                                        <span className="date-range-display">
                                            {dateRanges[`${server.display_server_name}-${table.display_table_name}`]
                                                ? `${new Date(dateRanges[`${server.display_server_name}-${table.display_table_name}`].start_date).toLocaleDateString()} - ${new Date(dateRanges[`${server.display_server_name}-${table.display_table_name}`].end_date).toLocaleDateString()}`
                                                : 'No dates available'}
                                        </span>
                                    </button>
                                    {dateRanges[`${server.display_server_name}-${table.display_table_name}`] && getStatusIndicator(dateRanges[`${server.display_server_name}-${table.display_table_name}`].end_date)}
                                    <button className="data-availability-button" onClick={() => {/* Functionality to be added later */}}>
                                        <FontAwesomeIcon icon={faInfoCircle} /> Data Availability
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </React.Fragment>
                ))}
                </tbody>
            </table>

            <Modal
                isOpen={isModalOpen}
                onRequestClose={closeModal}
                contentLabel="Table Data"
                className="modal"
                overlayClassName="modal-overlay"
            >
                <div className="modal-header">
                    <button className="close-button" onClick={closeModal}>
                        X
                    </button>
                </div>
                {modalContent && renderTableData(modalContent)}
            </Modal>
        </div>
    );
};

export default MappingSummaryTable;
