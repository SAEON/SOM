import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Oval } from 'react-loader-spinner';
import Modal from 'react-modal';
import './UnifiedMappingTable.css';

const UnifiedMappingTable = () => {
    const [data, setData] = useState([]);
    const [selectedRows, setSelectedRows] = useState([]);
    const [updateValues, setUpdateValues] = useState({
        displayServerName: '',
        displayTableName: '',
        displayFieldName: '',
        latitude: '',
        longitude: '',
        units: '',
        aggregationType: '',
        includeInSummary: false
    });
    const [includeInSummaryIndeterminate, setIncludeInSummaryIndeterminate] = useState(false);
    const [serverNames, setServerNames] = useState([]);
    const [tableNames, setTableNames] = useState([]);
    const [fieldNames, setFieldNames] = useState([]);
    const [selectedServer, setSelectedServer] = useState('');
    const [selectedTable, setSelectedTable] = useState('');
    const [selectedField, setSelectedField] = useState('');
    const [includeInSummaryFilter, setIncludeInSummaryFilter] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(false);
    const rowsPerPage = 100;
    const [modalIsOpen, setModalIsOpen] = useState(false);

    useEffect(() => {
        const fetchServerNames = async () => {
            try {
                const result = await axios.get('/api/unified_mapping_table/servers');
                setServerNames(result.data.sort());
            } catch (error) {
                console.error('Error fetching server names:', error);
                setServerNames([]);
            }
        };
        fetchServerNames();
    }, []);

    useEffect(() => {
        const fetchTableNames = async () => {
            if (selectedServer) {
                try {
                    const result = await axios.get('/api/unified_mapping_table/tables', {
                        params: { serverName: selectedServer }
                    });
                    setTableNames(result.data.sort());
                    setSelectedTable('');
                    setFieldNames([]);
                    setSelectedField('');
                } catch (error) {
                    console.error('Error fetching table names:', error);
                    setTableNames([]);
                }
            } else {
                setTableNames([]);
                setSelectedTable('');
                setFieldNames([]);
                setSelectedField('');
            }
        };
        fetchTableNames();
    }, [selectedServer]);

    useEffect(() => {
        const fetchFieldNames = async () => {
            if (selectedTable) {
                try {
                    const result = await axios.get('/api/unified_mapping_table/fields', {
                        params: { serverName: selectedServer, tableName: selectedTable }
                    });
                    setFieldNames(result.data.sort());
                    setSelectedField('');
                } catch (error) {
                    console.error('Error fetching field names:', error);
                    setFieldNames([]);
                }
            } else {
                setFieldNames([]);
                setSelectedField('');
            }
        };
        fetchFieldNames();
    }, [selectedTable]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const result = await axios.get('/api/unified_mapping_table', {
                    params: {
                        serverName: selectedServer,
                        tableName: selectedTable,
                        fieldName: selectedField,
                        includeInSummary: includeInSummaryFilter,
                        page: currentPage,
                        limit: rowsPerPage
                    }
                });
                // console.log(result.data); // Log the data to check the structure
                if (result.data && Array.isArray(result.data.rows)) {
                    setData(result.data.rows);
                    const totalRows = result.data.total; // Total number of rows from the backend
                    setTotalPages(Math.ceil(totalRows / rowsPerPage));
                } else {
                    setData([]);
                    setTotalPages(1);
                }
            } catch (error) {
                console.error('Error fetching data:', error);
                setData([]);
            }
        };
        fetchData();
    }, [selectedServer, selectedTable, selectedField, includeInSummaryFilter, currentPage]);

    const handleUpdate = async () => {
        const { displayServerName, displayTableName, displayFieldName, latitude, longitude, units, aggregationType, includeInSummary } = updateValues;

        setLoading(true); // Start loading
        try {
            // Clear the summary table first
            await axios.post('/api/summary_table/clear');

            console.log('Updating with values:', {
                ids: selectedRows,
                displayServerName,
                displayTableName,
                displayFieldName,
                latitude,
                longitude,
                units,
                aggregationType,
                includeInSummary
            });

            // Update the summary table with new values
            const response = await axios.post('/api/unified_mapping_table/update', {
                ids: selectedRows,
                displayServerName,
                displayTableName,
                displayFieldName,
                latitude,
                longitude,
                units,
                aggregationType,
                includeInSummary
            });

            if (response.status === 200) {
                alert(response.data.message); // Display success message
            }

            // Refresh data after update
            const result = await axios.get('/api/unified_mapping_table', {
                params: {
                    serverName: selectedServer,
                    tableName: selectedTable,
                    fieldName: selectedField,
                    includeInSummary: includeInSummaryFilter,
                    page: currentPage,
                    limit: rowsPerPage
                }
            });

            if (result.data && Array.isArray(result.data.rows)) {
                setData(result.data.rows);
                const totalRows = result.data.total; // Total number of rows from the backend
                setTotalPages(Math.ceil(totalRows / rowsPerPage));
            } else {
                setData([]);
                setTotalPages(1);
            }
        } catch (error) {
            console.error('Error updating data:', error);
            alert(`Update failed: ${error.response?.data?.message || error.message}`); // Display detailed error message
        } finally {
            setLoading(false); // End loading
        }
    };




    const handleRowSelect = (row) => {
        if (selectedRows.includes(row.id)) {
            setSelectedRows(selectedRows.filter(id => id !== row.id));
        } else {
            setSelectedRows([...selectedRows, row.id]);
            setUpdateValues({
                displayServerName: row.display_server_name || '',
                displayTableName: row.display_table_name || '',
                displayFieldName: row.display_field_name || '',
                latitude: row.latitude || '',
                longitude: row.longitude || '',
                units: row.display_units || '',
                aggregationType: row.aggregation_type || '',
                includeInSummary: row.include_in_summary
            });
        }

        const includeInSummaryValues = data.filter(r => selectedRows.includes(r.id)).map(r => r.include_in_summary);
        const allTrue = includeInSummaryValues.every(value => value === true);
        const allFalse = includeInSummaryValues.every(value => value === false);

        setIncludeInSummaryIndeterminate(!allTrue && !allFalse);
    };

    const handleSelectAll = () => {
        if (selectedRows.length === data.length) {
            setSelectedRows([]);
        } else {
            setSelectedRows(data.map(row => row.id));
        }
    };

    const openModal = () => setModalIsOpen(true);
    const closeModal = () => setModalIsOpen(false);

    return (
        <div className="unified-mapping-table">
            <button onClick={openModal}>Info</button>
            <Modal isOpen={modalIsOpen} onRequestClose={closeModal} contentLabel="Instructions">
                <h2>Instructions</h2>
                <p>Welcome to the Unified Mapping Table page. Here’s how you can use this page:</p>
                <ol>
                    <li>Use the dropdown filters to select the Server, Table, and Field you want to view.</li>
                    <li>Use the checkbox filter to show only rows included or not included in the summary.</li>
                    <li>Select individual rows by clicking the checkboxes or use the "Select All" checkbox to select all visible rows.</li>
                    <li>Fill in the fields in the update section to update the selected rows.</li>
                    <li>Click the "Update Selected Rows" button to apply changes.</li>
                </ol>
                <button onClick={closeModal}>Close</button>
            </Modal>
            <div className="update-section">
                <div className="input-group">
                    <label>Display Server Name</label>
                    <input
                        type="text"
                        placeholder="Display Server Name"
                        value={updateValues.displayServerName}
                        onChange={e => setUpdateValues({ ...updateValues, displayServerName: e.target.value })}
                    />
                </div>
                <div className="input-group">
                    <label>Display Table Name</label>
                    <input
                        type="text"
                        placeholder="Display Table Name"
                        value={updateValues.displayTableName}
                        onChange={e => setUpdateValues({ ...updateValues, displayTableName: e.target.value })}
                    />
                </div>
                <div className="input-group">
                    <label>Display Field Name</label>
                    <input
                        type="text"
                        placeholder="Display Field Name"
                        value={updateValues.displayFieldName}
                        onChange={e => setUpdateValues({ ...updateValues, displayFieldName: e.target.value })}
                    />
                </div>
                <div className="input-group">
                    <label>Latitude</label>
                    <input
                        type="text"
                        placeholder="Latitude"
                        value={updateValues.latitude}
                        onChange={e => setUpdateValues({ ...updateValues, latitude: e.target.value })}
                    />
                </div>
                <div className="input-group">
                    <label>Longitude</label>
                    <input
                        type="text"
                        placeholder="Longitude"
                        value={updateValues.longitude}
                        onChange={e => setUpdateValues({ ...updateValues, longitude: e.target.value })}
                    />
                </div>
                <div className="input-group">
                    <label>Units</label>
                    <input
                        type="text"
                        placeholder="Units"
                        value={updateValues.units}
                        onChange={e => setUpdateValues({ ...updateValues, units: e.target.value })}
                    />
                </div>
                <div className="input-group">
                    <label>Aggregation Type</label>
                    <input
                        type="text"
                        placeholder="Aggregation Type"
                        value={updateValues.aggregationType}
                        onChange={e => setUpdateValues({ ...updateValues, aggregationType: e.target.value })}
                    />
                </div>
                <div className="input-group">
                    <label>
                        Include in Summary
                        <input
                            type="checkbox"
                            checked={updateValues.includeInSummary}
                            indeterminate={includeInSummaryIndeterminate ? "indeterminate" : ""}
                            onChange={e => setUpdateValues({ ...updateValues, includeInSummary: e.target.checked })}
                        />
                    </label>
                </div>
                <button onClick={handleUpdate} disabled={loading}>Update Selected Rows</button>
            </div>
            <div className="filter-section">
                <select value={selectedServer} onChange={e => {
                    setSelectedServer(e.target.value);
                    setSelectedTable('');
                    setSelectedField('');
                }}>
                    <option value="">Select Server</option>
                    {serverNames.map(server => (
                        <option key={server} value={server}>{server}</option>
                    ))}
                </select>
                <select value={selectedTable} onChange={e => setSelectedTable(e.target.value)} disabled={!selectedServer}>
                    <option value="">Select Table</option>
                    {tableNames.map(table => (
                        <option key={table} value={table}>{table}</option>
                    ))}
                </select>
                <select value={selectedField} onChange={e => setSelectedField(e.target.value)} disabled={!selectedTable}>
                    <option value="">Select Field</option>
                    {fieldNames.map(field => (
                        <option key={field} value={field}>{field}</option>
                    ))}
                </select>
                <select value={includeInSummaryFilter} onChange={e => setIncludeInSummaryFilter(e.target.value)}>
                    <option value="">Include in Summary</option>
                    <option value="true">True</option>
                    <option value="false">False</option>
                </select>
            </div>
            <table>
                <thead>
                <tr>
                    <th>
                        <input
                            type="checkbox"
                            checked={selectedRows.length === data.length && data.length > 0}
                            onChange={handleSelectAll}
                        />
                    </th>
                    <th>Current Server Name</th>
                    <th>Current Table Name</th>
                    <th>Current Field Name</th>
                    <th>Display Server Name</th>
                    <th>Display Table Name</th>
                    <th>Display Field Name</th>
                    <th>Latitude</th>
                    <th>Longitude</th>
                    <th>Units</th>
                    <th>Aggregation Type</th>
                    <th>Include in Summary</th>
                </tr>
                </thead>
                <tbody>
                {data.length > 0 ? (
                    data.map(row => (
                        <tr key={row.id}>
                            <td>
                                <input
                                    type="checkbox"
                                    checked={selectedRows.includes(row.id)}
                                    onChange={() => handleRowSelect(row)}
                                />
                            </td>
                            <td>{row.current_server_name}</td>
                            <td>{row.current_table_name}</td>
                            <td>{row.current_field_name}</td>
                            <td>{row.display_server_name}</td>
                            <td>{row.display_table_name}</td>
                            <td>{row.display_field_name}</td>
                            <td>{row.latitude}</td>
                            <td>{row.longitude}</td>
                            <td>{row.display_units}</td>
                            <td>{row.aggregation_type}</td>
                            <td>{row.include_in_summary.toString()}</td>
                        </tr>
                    ))
                ) : (
                    <tr>
                        <td colSpan="12">No data available</td>
                    </tr>
                )}
                </tbody>
            </table>
            {loading && (
                <div className="loading-spinner">
                    <Oval
                        height={80}
                        width={80}
                        color="#4fa94d"
                        wrapperStyle={{}}
                        wrapperClass=""
                        visible={true}
                        ariaLabel='oval-loading'
                        secondaryColor="#4fa94d"
                        strokeWidth={2}
                        strokeWidthSecondary={2}
                    />
                </div>
            )}
            <div className="pagination">
                <button onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1 || loading}>
                    Previous
                </button>
                <span>Page {currentPage} of {totalPages}</span>
                <button onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages || loading}>
                    Next
                </button>
            </div>
        </div>
    );
};

export default UnifiedMappingTable;
