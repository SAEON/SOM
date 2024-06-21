import React, { useState, useEffect } from 'react';
import './ScrollableTable.css';
import './Newmodal.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolder as farFolder, faFolderOpen as farFolderOpen, faTable } from '@fortawesome/free-solid-svg-icons';
import Modal from 'react-modal';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";

Modal.setAppElement('#root');

const ScrollableTable3 = () => {
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

    useEffect(() => {
        fetch('/api/servers')
            .then(response => response.json())
            .then(data => {
                setServers(data.sort((a, b) => a.name.localeCompare(b.name)));
            })
            .catch(error => console.error('Error fetching servers:', error));
    }, []);

    const toggleServer = (serverId) => {
        setActiveServer(prev => prev === serverId ? null : serverId);
        if (!tables[serverId]) {
            fetch(`/api/servers/${serverId}/tables`)
                .then(response => response.json())
                .then(data => {
                    setTables(prevTables => ({ ...prevTables, [serverId]: data }));
                })
                .catch(error => console.error('Error fetching tables:', error));
        }
    };

    const fetchFieldsWithUnits = async (tableId) => {
        const response = await fetch(`/api/tables/${tableId}/fields`);
        if (!response.ok) {
            throw new Error('Failed to fetch field details');
        }
        return response.json();
    };

    const openTableModal = async (tableId) => {
        try {
            const dateRangeResponse = await fetch(`/api/tables/${tableId}/date-range`);
            const dateRange = await dateRangeResponse.json();
            const start = new Date(dateRange.start_date);
            const end = new Date(dateRange.end_date);
            end.setDate(end.getDate() + 1); // Adjust end date to include the last day fully
            setStartDate(start);
            setEndDate(end);

            const fieldsData = await fetchFieldsWithUnits(tableId);
            const fieldsInfo = fieldsData.reduce((acc, field) => {
                acc[field.field_name] = { units: field.units, status: field.status };
                return acc;
            }, {});

            const formattedStartDate = start.toISOString().split('T')[0];
            const formattedEndDate = end.toISOString().split('T')[0];
            const response = await fetch(`/api/tables/${tableId}/values?startDate=${formattedStartDate}&endDate=${formattedEndDate}&page=${currentPage}&pageSize=${pageSize}`);
            const valuesData = await response.json();

            if (Array.isArray(valuesData.data)) {
                const dataWithUnits = valuesData.data.map(row => ({
                    ...row,
                    units: fieldsInfo[row.field_name]?.units,
                    status: fieldsInfo[row.field_name]?.status
                }));
                setTableValues(prev => ({ ...prev, [tableId]: dataWithUnits }));
                setModalContent(dataWithUnits);
                setIsModalOpen(true);
            } else {
                console.error('Expected valuesData.data to be an array, received:', valuesData);
            }
        } catch (error) {
            console.error('Error fetching table details:', error);
        }
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setModalContent(null);
    };

    const renderTableData = (data) => {
        if (!data || data.length === 0) return <p>No data available</p>;

        // Collecting column headers and details
        const columns = new Set();
        const columnDetails = {};  // This will store units and status for each column
        data.forEach(entry => {
            entry.fields.forEach(field => {
                columns.add(field.field_name);
                if (!columnDetails[field.field_name]) {
                    columnDetails[field.field_name] = {
                        units: field.units || 'No units',  // Capture units
                        status: field.status || 'Unknown' // Capture status
                    };
                }
            });
        });

        // Building rows from data for display
        const rows = data.map(entry => {
            const row = { timestamp: entry.timestamp };
            entry.fields.forEach(field => {
                row[field.field_name] = field.value;
            });
            return row;
        });

        return (
            <div className="modal-content-table">
                <DatePicker selected={startDate} onChange={date => setStartDate(date)} dateFormat="dd/MM/yyyy" />
                <DatePicker selected={endDate} onChange={date => setEndDate(date)} dateFormat="dd/MM/yyyy" />
                <div>
                    Page: <input type="number" value={currentPage} onChange={e => setCurrentPage(Number(e.target.value))} />
                    Page Size: <input type="number" value={pageSize} onChange={e => setPageSize(Number(e.target.value))} />
                </div>
                <table className="data-table">
                    <thead>
                    <tr>
                        <th>Timestamp</th>
                        {Array.from(columns).map(col => <th key={`header-${col}`}>{col}</th>)}
                    </tr>
                    <tr>
                        {['Timestamp', ...Array.from(columns)].map(col => (
                            <th key={`units-${col}`}>{col !== 'Timestamp' ? columnDetails[col].units : ''}</th>
                        ))}
                    </tr>
                    <tr>
                        {['Timestamp', ...Array.from(columns)].map(col => (
                            <th key={`status-${col}`}>{col !== 'Timestamp' ? columnDetails[col].status : ''}</th>
                        ))}
                    </tr>
                    </thead>
                    <tbody>
                    {rows.map((row, index) => (
                        <tr key={index}>
                            {['timestamp', ...Array.from(columns)].map(col => (
                                <td key={`${col}-${index}`}>{row[col] || '-'}</td>
                            ))}
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div className="scrollable-table-container">
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
                            <tr key={table.id}>
                                <td colSpan={6}>
                                    <button className="table-name-button" onClick={() => openTableModal(table.id)}>
                                        <FontAwesomeIcon icon={faTable} className="icon-left" />
                                        {table.table_name}
                                        <span className={`status-indicator ${table.status}`}>{table.status}</span>
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

export default ScrollableTable3;
