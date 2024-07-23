import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFolder as farFolder, faFolderOpen as farFolderOpen, faTable } from "@fortawesome/free-solid-svg-icons";
import Modal from "react-modal";
import DatePicker from "react-datepicker";
import LoadingSpinner from "./LoadingSpinner";
import "react-datepicker/dist/react-datepicker.css";
import "./ScrollableTable.css";
import "./Newmodal.css";

// Modal.setAppElement("#root");

const LiveData = () => {
    const [servers, setServers] = useState([]);
    const [activeServer, setActiveServer] = useState(null);
    const [tables, setTables] = useState({});
    const [tableValues, setTableValues] = useState({});
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState(null);
    const [startDate, setStartDate] = useState(new Date());
    const [endDate, setEndDate] = useState(new Date());
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(100);
    const [totalRows, setTotalRows] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [currentTableId, setCurrentTableId] = useState(null);
    const [columnOrder, setColumnOrder] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');

    useEffect(() => {
        setLoading(true);
        setLoadingMessage('Loading servers...');
        fetch("/api/servers")
            .then(response => response.json())
            .then(data => {
                setServers(data.sort((a, b) => a.name.localeCompare(b.name)));
                setLoading(false);
            })
            .catch(error => {
                console.error("Error fetching servers:", error);
                setLoading(false);
            });
    }, []);

    useEffect(() => {
        if (currentTableId && currentPage > 0) {
            fetchTableData(currentTableId);
        }
    }, [currentPage, currentTableId, pageSize]);

    const toggleServer = (serverId) => {
        setActiveServer(prev => prev === serverId ? null : serverId);
        if (!tables[serverId]) {
            fetchTablesAndDateRanges(serverId);
        }
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
        setCurrentPage(1);  // Reset to first page when page size changes
        fetchTableData(currentTableId, 1);  // Refetch data with new page size starting from page 1
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
            setLoadingMessage('Loading tables and date ranges...');
            const response = await fetch(`/api/servers/${serverId}/tables`);
            const tables = await response.json();
            if (response.ok) {
                const tablesWithDateInfo = await Promise.all(tables.map(async (table) => {
                    const dateRangeResponse = await fetch(`/api/tables/${table.table_id}/date-range`);
                    const dateRange = await dateRangeResponse.json();
                    return { ...table, dateRange: dateRangeResponse.ok ? dateRange : null };
                }));
                setTables(prevTables => ({
                    ...prevTables,
                    [serverId]: tablesWithDateInfo.sort((a, b) => a.table_name.localeCompare(b.table_name))
                }));
                setLoading(false);
            } else {
                throw new Error("Failed to fetch tables");
            }
        } catch (error) {
            console.error("Error fetching tables and date ranges:", error);
            setLoading(false);
        }
    };

    const fetchTableData = async (tableId, page = currentPage) => {
        if (!tableId) return;

        setLoading(true);
        setLoadingMessage('Loading table data...');
        const formattedStartDate = startDate.toISOString().split("T")[0];
        const formattedEndDate = endDate.toISOString().split("T")[0];
        const url = `/api/tables/${tableId}/values?startDate=${formattedStartDate}&endDate=${formattedEndDate}&page=${page}&pageSize=${pageSize}`;

        try {
            const response = await fetch(url);
            const valuesData = await response.json();
            if (response.ok && Array.isArray(valuesData.data)) {
                const fieldsData = await fetchFieldsWithUnits(tableId);
                const fieldsInfo = fieldsData.reduce((acc, field) => {
                    acc[field.field_name] = { units: field.units, status: field.status };
                    return acc;
                }, {});

                const dataWithUnits = valuesData.data.map(row => ({
                    ...row,
                    units: fieldsInfo[row.field_name]?.units,
                    status: fieldsInfo[row.field_name]?.status,
                    timestamp: row.timestamp // Use raw timestamp
                }));

                setTableValues(prev => ({ ...prev, [tableId]: dataWithUnits }));
                setModalContent(dataWithUnits);
                setTotalRows(valuesData.totalRecords);  // Set total rows
                setTotalPages(valuesData.totalPages);   // Set total pages
                setLoading(false);
                setIsModalOpen(true);
            } else {
                console.error("Expected valuesData.data to be an array, received:", valuesData);
                if (valuesData.error) {
                    console.error("API Error:", valuesData.error);
                }
                setLoading(false);
            }
        } catch (error) {
            console.error("Error fetching table details:", error);
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

        try {
            setLoading(true);
            setLoadingMessage('Opening table...');
            const dateRangeResponse = await fetch(`/api/tables/${tableId}/date-range`);
            const dateRange = await dateRangeResponse.json();
            if (!dateRangeResponse.ok) throw new Error("Failed to fetch date range.");

            const start = new Date(dateRange.start_date);
            const end = new Date(dateRange.end_date);
            end.setDate(end.getDate());  // Include the end date fully
            setStartDate(start);
            setEndDate(end);

            const fieldsData = await fetchFieldsWithUnits(tableId);
            if (!fieldsData) throw new Error("Failed to fetch fields with units.");

            const fieldsInfo = fieldsData.reduce((acc, field) => {
                acc[field.field_name] = { units: field.units, status: field.status };
                return acc;
            }, {});

            const formattedStartDate = start.toISOString().split("T")[0];
            const formattedEndDate = end.toISOString().split("T")[0];
            const response = await fetch(`/api/tables/${tableId}/values?startDate=${formattedStartDate}&endDate=${formattedEndDate}&page=1&pageSize=${pageSize}`);
            const valuesData = await response.json();

            if (response.ok && Array.isArray(valuesData.data)) {
                const dataWithUnits = valuesData.data.map(row => ({
                    ...row,
                    units: fieldsInfo[row.field_name]?.units,
                    status: fieldsInfo[row.field_name]?.status,
                    timestamp: row.timestamp // Use raw timestamp
                }));

                setTableValues(prev => ({ ...prev, [tableId]: dataWithUnits }));
                setModalContent(dataWithUnits);
                setTotalRows(valuesData.totalRecords);  // Set total rows
                setTotalPages(valuesData.totalPages);   // Set total pages
                setLoading(false);
                setIsModalOpen(true);
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

    const downloadData = async () => {
        if (!currentTableId) return;

        setLoading(true);
        setLoadingMessage('Downloading data...');
        const formattedStartDate = startDate.toISOString().split("T")[0];
        const formattedEndDate = endDate.toISOString().split("T")[0];
        const url = `/api/tables/${currentTableId}/download?startDate=${formattedStartDate}&endDate=${formattedEndDate}`;

        try {
            const response = await fetch(url);
            if (response.ok) {
                const blob = await response.blob();
                const downloadUrl = window.URL.createObjectURL(blob);
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
        if (!data || data.length === 0) return <p>No data available</p>;

        const columns = new Set();
        const columnDetails = {}; // Store units and status for each column
        data.forEach(entry => {
            entry.fields.forEach(field => {
                columns.add(field.field_name);
                if (!columnDetails[field.field_name]) {
                    columnDetails[field.field_name] = {
                        units: field.units || "No units",
                        status: field.status || "Unknown"
                    };
                }
            });
        });
        const sortedColumns = Array.from(columns).sort();

        const rows = data.map((entry) => ({
            ...entry,
            fields: entry.fields.sort((a, b) => a.field_name.localeCompare(b.field_name))
        }));

        return (
            <div className="date-picker-container">
                <div className="date-picker">
                    <DatePicker selected={startDate} onChange={date => setStartDate(date)} dateFormat="dd/MM/yyyy" />
                    <DatePicker selected={endDate} onChange={date => setEndDate(date)} dateFormat="dd/MM/yyyy" />
                </div>
                <div className="download-button">
                    <button onClick={downloadData}>Download</button>
                </div>
                <div>
                    <button onClick={prevPage} disabled={currentPage === 1}>←</button>
                    Page: <input type="number" value={currentPage} onChange={e => setCurrentPage(Number(e.target.value))} />
                    <button onClick={nextPage} disabled={currentPage === totalPages}>→</button>
                    Page Size:
                    <select value={pageSize} onChange={e => handlePageSizeChange(Number(e.target.value))}>
                        <option value="100">100</option>
                        <option value="200">200</option>
                        <option value="300">300</option>
                        <option value="400">400</option>
                        <option value="500">500</option>
                    </select>
                </div>
                <div>Total Rows: {totalRows} Total Pages: {totalPages}</div>
                <table className="data-table">
                    <thead>
                    <tr>
                        <th>Timestamp</th>
                        {sortedColumns.map(col => (
                            <th key={`header-${col}`}>{col}</th>
                        ))}
                    </tr>
                    <tr>
                        <th></th>
                        {sortedColumns.map(col => (
                            <th key={`units-${col}`}>{columnDetails[col].units}</th>
                        ))}
                    </tr>
                    <tr>
                        <th></th>
                        {sortedColumns.map(col => (
                            <th key={`status-${col}`}>{columnDetails[col].status}</th>
                        ))}
                    </tr>
                    </thead>
                    <tbody>
                    {rows.map((row, index) => (
                        <tr key={index}>
                            <td>{row.timestamp.split('T')[0] + ' ' + row.timestamp.split('T')[1].slice(0, 8)}</td>
                            {sortedColumns.map(col => (
                                <td key={`${col}-${index}`}>{row.fields.find(f => f.field_name === col)?.value || '-'}</td>
                            ))}
                        </tr>
                    ))}
                    </tbody>
                </table>
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
                    <LoadingSpinner />
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
                                        <FontAwesomeIcon icon={activeServer === server.server_id ? farFolderOpen : farFolder} className="icon-right" />
                                    </span>
                                </button>
                            </td>
                        </tr>
                        {activeServer === server.server_id && tables[server.server_id] && tables[server.server_id].map((table) => (
                            <tr key={table.table_id}>
                                <td colSpan={6}>
                                    <button className="table-name-button" onClick={() => openTableModal(table.table_id)}>
                                        <FontAwesomeIcon icon={faTable} className="icon-left" />
                                        {table.table_name}
                                        <span className={`status-indicator ${table.status}`}>{table.status}</span>
                                        {/* Display date range if available */}
                                        <span className="date-range-display">
                                            {table.dateRange ? `${new Date(table.dateRange.start_date).toLocaleDateString()} - ${new Date(table.dateRange.end_date).toLocaleDateString()}` : 'No dates available'}
                                        </span>
                                        {table.dateRange && getStatusIndicator(table.dateRange.end_date)}
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
                <button className="close-button" onClick={closeModal}>
                    X
                </button>
                {modalContent && renderTableData(modalContent)}
            </Modal>
        </div>
    );
};

export default LiveData;
