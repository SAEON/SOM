import React, {useEffect, useState} from "react";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {
    faDownload,
    faFolder as farFolder,
    faFolderOpen as farFolderOpen,
    faTable
} from "@fortawesome/free-solid-svg-icons";
import Modal from "react-modal";
import DatePicker from "react-datepicker";
import LoadingSpinner from "./LoadingSpinner";
import "react-datepicker/dist/react-datepicker.css";
import "./ScrollableTable.css";
import "./Newmodal.css";
import {logInteraction} from '../utils/logInteraction'; // Import the logInteraction function

Modal.setAppElement("#root");

const LiveData = ({user}) => { // Ensure user is passed as a prop
    const [servers, setServers] = useState([]);
    const [activeServer, setActiveServer] = useState(null);
    const [tables, setTables] = useState({});
    const [tableValues, setTableValues] = useState({});
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState(null);
    const [startDate, setStartDate] = useState(new Date());
    const [endDate, setEndDate] = useState(new Date());
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [totalRows, setTotalRows] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [currentTableId, setCurrentTableId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState("");
    const [tableLoading, setTableLoading] = useState({});

    useEffect(() => {// Log the interaction whether the user is logged in or not
        logInteraction('page_view', {viewport: {width: window.innerWidth, height: window.innerHeight}}, user);
    }, [user]);

    useEffect(() => {
        setLoading(true);
        setLoadingMessage("Loading servers...");
        fetch("/api/servers")
            .then((response) => response.json())
            .then((data) => {
                setServers(data.sort((a, b) => a.name.localeCompare(b.name)));
                setLoading(false);
            })
            .catch((error) => {
                console.error("Error fetching servers:", error);
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        if (isModalOpen && currentTableId && currentPage > 0) {
            fetchTableData(currentTableId);
        }
    }, [currentPage, currentTableId, pageSize]);


    const toggleServer = async (serverId) => {
        setLoading(true); // Set loading to true when toggle starts
        setActiveServer((prev) => (prev === serverId ? null : serverId));

        if (!tables[serverId]) {
            await fetchTablesAndDateRanges(serverId);
        }

        // Find the server name based on the serverId
        const server = servers.find((server) => server.server_id === serverId);
        const serverName = server ? server.name : `Unknown Server (${serverId})`;

        // Log the interaction with the server name
        logInteraction('toggle_server', {serverName}, user);

        // Set loading to false only after everything is done
        setLoading(false);
    };

    const fetchFieldsWithUnits = async (tableId) => {
        const response = await fetch(`/api/tables/${tableId}/fields`);
        if (!response.ok) {
            throw new Error("Failed to fetch field details");
        }
        return response.json();
    };

    const handlePageSizeChange = (newSize) => {
        setPageSize(newSize);
        setCurrentPage(1); // Reset to first page when page size changes
        fetchTableData(currentTableId, 1); // Refetch data with new page size starting from page 1
    };

    const nextPage = () => {
        const newPage = currentPage + 1;
        if (newPage <= totalPages) {
            setCurrentPage(newPage);
            fetchTableData(currentTableId, newPage);
        }
    };

    const prevPage = () => {
        const newPage = currentPage - 1;
        if (newPage >= 1) {
            setCurrentPage(newPage);
            fetchTableData(currentTableId, newPage);
        }
    };


    const fetchTablesAndDateRanges = async (serverId) => {
        try {
            setLoading(true);
            setLoadingMessage("Loading tables...");

            // Fetch tables for the selected server
            const response = await fetch(`/api/servers/${serverId}/tables`);
            if (!response.ok) throw new Error("Failed to fetch tables");

            const tables = await response.json();

            const tableIds = tables.map((table) => table.table_id);
            let dateRangesByTableId = {};
            if (tableIds.length > 0) {
                const dateRangeResponse = await fetch('/api/tables/date-ranges', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({tableIds}),
                });
                if (dateRangeResponse.ok) {
                    const ranges = await dateRangeResponse.json();
                    dateRangesByTableId = ranges.reduce((acc, range) => {
                        acc[range.table_id] = range;
                        return acc;
                    }, {});
                }
            }

            const tablesWithDateInfo = tables.map((table) => ({
                ...table,
                dateRange: dateRangesByTableId[table.table_id] || null,
            }));

            // Update state after all data is fetched
            setTables((prevTables) => ({
                ...prevTables,
                [serverId]: tablesWithDateInfo.sort((a, b) => a.table_name.localeCompare(b.table_name)),
            }));

            setLoading(false);
        } catch (error) {
            console.error("Error fetching tables and date ranges:", error);
            setLoading(false);
        }
    };


    const fetchTableData = async (tableId, page = currentPage, prefetch = false) => {
        if (!tableId) return;

        setTableLoading((prev) => ({...prev, [tableId]: true}));
        setLoadingMessage("Loading table data...");
        const formattedStartDate = startDate.toISOString().split("T")[0];
        const formattedEndDate = endDate.toISOString().split("T")[0];
        const url = `/api/tables/${tableId}/values?startDate=${formattedStartDate}&endDate=${formattedEndDate}&page=${page}&pageSize=${pageSize}`;

        try {
            const response = await fetch(url);
            const valuesData = await response.json();
            if (response.ok && Array.isArray(valuesData.data)) {
                const fieldsData = await fetchFieldsWithUnits(tableId);
                const fieldsInfo = fieldsData.reduce((acc, field) => {
                    acc[field.field_name] = {units: field.units, status: field.status};
                    return acc;
                }, {});

                const dataWithUnits = valuesData.data.map((row) => ({
                    ...row,
                    units: fieldsInfo[row.field_name]?.units,
                    status: fieldsInfo[row.field_name]?.status,
                    timestamp: row.timestamp, // Use raw timestamp
                }));

                setTableValues((prev) => ({...prev, [tableId]: dataWithUnits}));
                if (!prefetch) {
                    setModalContent(dataWithUnits);
                    setTotalRows(valuesData.totalRecords); // Set total rows
                    setTotalPages(valuesData.totalPages); // Set total pages
                    setIsModalOpen(true);
                }
                setTableLoading((prev) => ({...prev, [tableId]: false}));
                setLoading(false);
            } else {
                console.error("Expected valuesData.data to be an array, received:", valuesData);
                if (valuesData.error) {
                    console.error("API Error:", valuesData.error);
                }
                setTableLoading((prev) => ({...prev, [tableId]: false}));
                setLoading(false);
            }
        } catch (error) {
            console.error("Error fetching table details:", error);
            setTableLoading((prev) => ({...prev, [tableId]: false}));
            setLoading(false);
        }
    };

    const openTableModal = async (tableId) => {
        if (!validateUUID(tableId)) {
            console.error("Invalid table ID:", tableId);
            return;
        }

        setCurrentTableId(tableId);
        setCurrentPage(1);

        // console.log('Table ID:', tableId);

        try {
            setLoading(true);
            setLoadingMessage("Opening table...");

            const cachedTable = Object.values(tables)
                .flat()
                .find((table) => table.table_id === tableId);
            let dateRange = cachedTable?.dateRange;
            if (!dateRange) {
                const dateRangeResponse = await fetch(`/api/tables/${tableId}/date-range`);
                dateRange = await dateRangeResponse.json();
                if (!dateRangeResponse.ok) throw new Error("Failed to fetch date range.");
            }

            const end = new Date(dateRange.end_date);
            const start = new Date(end);
            start.setMonth(start.getMonth() - 1);
            setStartDate(start);
            setEndDate(end);

            const [fieldsData, serverAndTableResponse] = await Promise.all([
                fetchFieldsWithUnits(tableId),
                fetch(`/api/tables/${tableId}/info`),
            ]);
            if (!fieldsData) throw new Error("Failed to fetch fields with units.");
            const serverAndTableInfo = await serverAndTableResponse.json();
            if (!serverAndTableResponse.ok) throw new Error("Failed to fetch server and table information.");

            // Use unique property names
            const {servername: fetchedServerName, tablename: fetchedTableName} = serverAndTableInfo;

            // // DEBUG: Log the values to check if they are being fetched correctly
            // console.log("Fetched Server Name:", fetchedServerName);
            // console.log("Fetched Table Name:", fetchedTableName);

            if (!fetchedServerName || !fetchedTableName) {
                console.error("Server name or table name is missing. Interaction logging might fail.");
            }

            const fieldsInfo = fieldsData.reduce((acc, field) => {
                acc[field.field_name] = {units: field.units, status: field.status};
                return acc;
            }, {});

            const formattedStartDate = start.toISOString().split("T")[0];
            const formattedEndDate = end.toISOString().split("T")[0];
            const response = await fetch(`/api/tables/${tableId}/values?startDate=${formattedStartDate}&endDate=${formattedEndDate}&page=1&pageSize=${pageSize}`);
            const valuesData = await response.json();

            if (response.ok && Array.isArray(valuesData.data)) {
                const dataWithUnits = valuesData.data.map((row) => ({
                    ...row,
                    units: fieldsInfo[row.field_name]?.units,
                    status: fieldsInfo[row.field_name]?.status,
                    timestamp: row.timestamp, // Use raw timestamp
                }));

                setTableValues((prev) => ({...prev, [tableId]: dataWithUnits}));
                setModalContent(dataWithUnits);
                setTotalRows(valuesData.totalRecords); // Set total rows
                setTotalPages(valuesData.totalPages); // Set total pages
                setLoading(false);
                setIsModalOpen(true);

                // Log the interaction with server and table names
                logInteraction('view_table', {serverName: fetchedServerName, tableName: fetchedTableName}, user);
            } else {
                console.error("Expected valuesData.data to be an array, received:", valuesData);
                if (valuesData.error) {
                    console.error("API Error:", valuesData.error);
                }
                setLoading(false);
                setIsModalOpen(false); // Optionally close the modal or show an error state instead
            }
        } catch (error) {
            console.error("Error fetching table details:", error);
            setLoading(false);
            setIsModalOpen(false); // Consider closing modal or showing error state
        }
    };


    const closeModal = () => {
        setIsModalOpen(false);
        setModalContent(null);
    };

    // const downloadData = async (tableId) => {
    //     if (!tableId) return;
    //
    //     setLoading(true);
    //     setLoadingMessage("Downloading data...");
    //
    //     try {
    //         // Fetch server and table information
    //         const serverAndTableResponse = await fetch(`/api/tables/${tableId}/info`);
    //         const serverAndTableInfo = await serverAndTableResponse.json();
    //
    //         if (!serverAndTableResponse.ok || !serverAndTableInfo) {
    //             throw new Error("Failed to fetch server and table information.");
    //         }
    //
    //         const { servername: fetchedServerName, tablename: fetchedTableName } = serverAndTableInfo;
    //
    //         if (!fetchedServerName || !fetchedTableName) {
    //             console.error("Server name or table name is missing.");
    //             setLoading(false);
    //             return;
    //         }
    //
    //         // Construct the download URL
    //         const url = `/api/tables/${tableId}/download`;
    //
    //         // Create a temporary link element for the download
    //         const link = document.createElement('a');
    //         link.href = url;
    //         link.download = `${fetchedTableName}_${fetchedServerName}.csv`;
    //
    //         // Append the link to the body and trigger the download
    //         document.body.appendChild(link);
    //         link.click();
    //         document.body.removeChild(link);
    //
    //         setLoading(false);
    //
    //         // Log interactions after download
    //         await logInteraction("consent_given", { serverName: fetchedServerName, tableName: fetchedTableName }, user);
    //         await logInteraction('download_data', { serverName: fetchedServerName, tableName: fetchedTableName }, user);
    //
    //     } catch (error) {
    //         console.error("Error downloading data:", error);
    //         setLoading(false);
    //         alert('Failed to start the download. Please try again.');
    //     }
    // };
    const downloadData = async (tableId) => {
        if (!tableId) return;

        setLoading(true);
        setLoadingMessage("Downloading data...");

        try {
            // Fetch server and table information
            const serverAndTableResponse = await fetch(`/api/tables/${tableId}/info`);
            const serverAndTableInfo = await serverAndTableResponse.json();

            if (!serverAndTableResponse.ok || !serverAndTableInfo) {
                throw new Error("Failed to fetch server and table information.");
            }

            const {servername: fetchedServerName, tablename: fetchedTableName} = serverAndTableInfo;

            if (!fetchedServerName || !fetchedTableName) {
                console.error("Server name or table name is missing.");
                setLoading(false);
                return;
            }

            // Construct the file name (ensure it matches the actual file name on the server)
            const fileName = `${fetchedTableName}_${fetchedServerName}.csv`;
            console.log(fileName);
            // Construct the download URL pointing to the Nginx-served file
            const url = `/express_downloads/${encodeURIComponent(fileName)}`;

            // Create a temporary link element for the download
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName; // Ensure the downloaded file has the correct name
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setLoading(false);

            // Log interactions after download
            await logInteraction("consent_given", {serverName: fetchedServerName, tableName: fetchedTableName}, user);
            await logInteraction('download_data', {serverName: fetchedServerName, tableName: fetchedTableName}, user);

        } catch (error) {
            console.error("Error downloading data:", error);
            setLoading(false);
            alert('Failed to start the download. Please try again.');
        }
    };


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


    const renderTableData = (data) => {
        if (!data || data.length === 0) return <p>No data available for preview, try download instead</p>;

        const columns = new Set();
        const columnDetails = {}; // Store units and status for each column
        data.forEach((entry) => {
            entry.fields.forEach((field) => {
                columns.add(field.field_name);
                if (!columnDetails[field.field_name]) {
                    columnDetails[field.field_name] = {
                        units: field.units || "No units",
                        status: field.status || "Unknown",
                    };
                }
            });
        });
        const sortedColumns = Array.from(columns).sort();

        const rows = data.map((entry) => ({
            ...entry,
            fields: entry.fields.sort((a, b) => a.field_name.localeCompare(b.field_name)),
        }));

        return (
            <div className="livedata-modal-content">
                <div className="livedata-date-picker-container">
                    <div className="livedata-date-picker">
                        <DatePicker
                            selected={startDate}
                            onChange={(date) => setStartDate(date)}
                            dateFormat="dd/MM/yyyy"
                        />
                        <DatePicker
                            selected={endDate}
                            onChange={(date) => setEndDate(date)}
                            dateFormat="dd/MM/yyyy"
                        />
                    </div>
                    <div className="livedata-download-button">
                        <button
                            className="livedata-button"
                            // onClick={() => downloadData(currentTableId, startDate, endDate)}
                            onClick={() => downloadData(currentTableId)}
                            disabled={loading}
                        >
                            {loading ? "Loading..." : "Download"}
                        </button>
                    </div>
                </div>
                <div className="livedata-pagination-controls">
                    <button
                        className="livedata-button"
                        onClick={prevPage}
                        disabled={currentPage === 1}
                    >
                        ←
                    </button>
                    <span>
                    Page:{" "}
                        <input
                            type="number"
                            value={currentPage}
                            onChange={(e) => setCurrentPage(Number(e.target.value))}
                        />
                </span>
                    <button
                        className="livedata-button"
                        onClick={nextPage}
                        disabled={currentPage === totalPages}
                    >
                        →
                    </button>
                    <span>
                    Page Size:{" "}
                        <select
                            value={pageSize}
                            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                        >
                        {[10, 20, 30, 40, 50, 100].map((size) => (
                            <option key={size} value={size}>
                                {size}
                            </option>
                        ))}
                    </select>
                </span>
                    <span>Total Rows: {totalRows}</span>
                    <span>Total Pages: {totalPages}</span>
                </div>
                <div className="livedata-table-container">
                    <table className="livedata-data-table">
                        <thead>
                        <tr>
                            <th>Timestamp</th>
                            {sortedColumns.map((col) => (
                                <th key={`header-${col}`}>{col}</th>
                            ))}
                        </tr>
                        <tr>
                            <th></th>
                            {sortedColumns.map((col) => (
                                <th key={`units-${col}`}>{columnDetails[col].units}</th>
                            ))}
                        </tr>
                        <tr>
                            <th></th>
                            {sortedColumns.map((col) => (
                                <th key={`status-${col}`}>{columnDetails[col].status}</th>
                            ))}
                        </tr>
                        </thead>
                        <tbody>
                        {rows.map((row, index) => (
                            <tr key={index}>
                                <td>
                                    {row.timestamp.split("T")[0] +
                                    " " +
                                    row.timestamp.split("T")[1].slice(0, 8)}
                                </td>
                                {sortedColumns.map((col) => (
                                    <td key={`${col}-${index}`}>
                                        {row.fields.find((f) => f.field_name === col)?.value || "-"}
                                    </td>
                                ))}
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const validateUUID = (uuid) => {
        const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
        return uuidRegex.test(uuid);
    };

    return (
        <div className="scrollable-table-container">
            {loading && (
                <div className="loading-overlay">
                    <LoadingSpinner/>
                    <div className="loading-message">{loadingMessage}</div>
                </div>
            )}
            <table>
                <tbody>
                {servers.map((server) => (
                    <React.Fragment key={server.server_id}>
                        <tr>
                            <td colSpan={6}>
                                <button className="site-name-button" onClick={() => toggleServer(server.server_id)}>
                                        <span className="button-content">
                                            {server.name}
                                            <span className={`status-indicator ${server.status}`}>{server.status}</span>
                                            <FontAwesomeIcon
                                                icon={activeServer === server.server_id ? farFolderOpen : farFolder}
                                                className="icon-right"/>
                                        </span>
                                </button>
                            </td>
                        </tr>
                        {activeServer === server.server_id &&
                        tables[server.server_id] &&
                        tables[server.server_id].map((table) => (
                            <tr key={table.table_id}>
                                <td colSpan={6}>
                                    <button className="table-name-button"
                                            onClick={() => openTableModal(table.table_id)}>
                                        <FontAwesomeIcon icon={faTable} className="icon-left"/>
                                        {table.table_name}
                                        <span className={`status-indicator ${table.status}`}>{table.status}</span>
                                        <span className="table-name">
        {table.display_table_name} <span className="preview-text">(View lastest month's data)</span>
    </span>
                                        {/* Display date range if available */}
                                        <span
                                            className="date-range-display">{table.dateRange ? `${new Date(table.dateRange.start_date).toLocaleDateString()} - ${new Date(table.dateRange.end_date).toLocaleDateString()}` : "No dates available"}</span>
                                        {table.dateRange && getStatusIndicator(table.dateRange.end_date)}
                                    </button>
                                    <button className="download-button" onClick={() => downloadData(table.table_id)}>
                                        <FontAwesomeIcon icon={faDownload} className="icon-right"/>
                                        Download
                                    </button>

                                </td>
                            </tr>
                        ))}
                    </React.Fragment>
                ))}
                </tbody>
            </table>

            <Modal isOpen={isModalOpen} onRequestClose={closeModal} contentLabel="Table Data" className="modal"
                   overlayClassName="modal-overlay">

                <div className="macos-window-controls">
                    <div className="macos-button close" onClick={() => closeModal()}></div>

                </div>

                {modalContent && renderTableData(modalContent)}
            </Modal>
        </div>
    );
};

export default LiveData;
