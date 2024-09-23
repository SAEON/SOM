import React, { useState, useEffect,useRef } from 'react';
import axios from 'axios';
import { Oval } from 'react-loader-spinner';
import Modal from 'react-modal';
import ReactECharts from 'echarts-for-react'; // Import ECharts
import './UnifiedMappingTable.css';

const UnifiedMappingTable = () => {
    const [data, setData] = useState([]);
    const [selectedRow, setSelectedRow] = useState(null);
    const [updateValues, setUpdateValues] = useState({
        displayServerName: '',
        displayTableName: '',
        displayFieldName: '',
        latitude: '',
        longitude: '',
        multiplier: '', // Add multiplier here
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
    const [errorModalIsOpen, setErrorModalIsOpen] = useState(false);
    const [alertModalIsOpen, setAlertModalIsOpen] = useState(false);
    const [modalMessage, setModalMessage] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [alertMessage, setAlertMessage] = useState('');

    // Site mappings state
    const [siteMappingModalIsOpen, setSiteMappingModalIsOpen] = useState(false);
    const [siteMappings, setSiteMappings] = useState([]);

    // Units mappings state
    const [unitsMappingModalIsOpen, setUnitsMappingModalIsOpen] = useState(false);
    const [unitsMappings, setUnitsMappings] = useState([]);
    const [selectedUZPhenName, setSelectedUZPhenName] = useState('');

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
            if (result.data && Array.isArray(result.data.rows)) {
                setData(result.data.rows);
                const totalRows = result.data.total;
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

    useEffect(() => {
        fetchData();
    }, [selectedServer, selectedTable, selectedField, includeInSummaryFilter, currentPage]);

    const handleUpdate = async () => {
        const { displayServerName, displayTableName, displayFieldName, latitude, longitude, units, aggregationType, multiplier, includeInSummary } = updateValues;

        // Check if the values are not numeric
        if (isNaN(latitude) || isNaN(longitude) || isNaN(aggregationType) || isNaN(multiplier)) {
            setErrorMessage('Latitude, Longitude, Aggregation Type, and Multiplier must be numeric.');
            setErrorModalIsOpen(true);
            return;
        } else {
            setErrorMessage('');
        }

        setLoading(true);
        try {
            // Check for duplicates
            const duplicateCheckResponse = await axios.post('/api/unified_mapping_table/check_duplicates', {
                displayServerName,
                displayTableName,
                displayFieldName,
                aggregationType,
                multiplier // Ensure multiplier is included in the duplicate check request
            });

            if (duplicateCheckResponse.status === 409) {
                setAlertMessage(`Warning: ${duplicateCheckResponse.data.message}`);
                setAlertModalIsOpen(true);
                console.log('Duplicates:', duplicateCheckResponse.data.duplicates); // Log duplicates to console or handle them as needed
                setLoading(false);
                return; // Prevent update if duplicates are found
            }

            // Proceed with update
            const response = await axios.post('/api/unified_mapping_table/update', {
                ids: [selectedRow],
                displayServerName,
                displayTableName,
                displayFieldName,
                latitude,
                longitude,
                units,
                aggregationType,
                multiplier, // Include multiplier in the update request
                includeInSummary
            });

            if (response.status === 200) {
                setAlertMessage('Update successful. Summary table updated.');
                setAlertModalIsOpen(true);
                fetchData();
            } else {
                setAlertMessage(`Update failed: ${response.data.message || response.data.error}`);
                setAlertModalIsOpen(true);
            }
        } catch (error) {
            const errorMessage = error.response?.data?.message || error.message;
            if (error.response && error.response.status === 409) {
                setAlertMessage('Update failed due to duplicate entries.');
            } else if (errorMessage.includes('Summary table update failed due to conflict resolution issue.')) {
                setAlertMessage('Update failed due to a conflict/duplicate entry issue.');
            } else {
                setAlertMessage(`Update failed: ${errorMessage}`);
            }
            setAlertModalIsOpen(true);
        } finally {
            setLoading(false);
        }
    };


    const handleRowSelect = (row) => {
        if (selectedRow === row.id) {
            setSelectedRow(null);
        } else {
            setSelectedRow(row.id);
            setUpdateValues({
                displayServerName: row.display_server_name || '',
                displayTableName: row.display_table_name || '',
                displayFieldName: row.display_field_name || '',
                latitude: row.latitude || '',
                longitude: row.longitude || '',
                units: row.display_units || '',
                multiplier: row.multiplier || '', // Set multiplier value here
                aggregationType: row.aggregation_type || '',
                includeInSummary: row.include_in_summary
            });
        }
    };

    const openModal = () => setModalIsOpen(true);
    const closeModal = () => setModalIsOpen(false);

    const closeErrorModal = () => setErrorModalIsOpen(false);
    const closeAlertModal = () => setAlertModalIsOpen(false);

    const showDuplicates = async () => {
        try {
            const duplicateCheckResponse = await axios.post('/api/unified_mapping_table/check_duplicates', {
                displayServerName: updateValues.displayServerName,
                displayTableName: updateValues.displayTableName,
                displayFieldName: updateValues.displayFieldName,
                aggregationType: updateValues.aggregationType
            });

            if (duplicateCheckResponse.status === 200 && duplicateCheckResponse.data.message !== 'No duplicates found') {
                setAlertMessage(`Warning: ${duplicateCheckResponse.data.message}`);
                setAlertModalIsOpen(true);
                console.log('Duplicates:', duplicateCheckResponse.data.duplicates); // Log duplicates to console or handle them as needed
            } else {
                alert('No duplicates found');
            }
        } catch (error) {
            console.error('Error checking for duplicates:', error);
            alert('Error checking for duplicates');
        }
    };

    // Fetch site mappings when the modal is opened
    useEffect(() => {
        const fetchSiteMappings = async () => {
            setLoading(true);
            try {
                const response = await axios.get('/api/site_mappings');
                setSiteMappings(response.data.sort((a, b) => a.site_name.localeCompare(b.site_name)) || []);
            } catch (error) {
                console.error('Error fetching site mappings:', error);
                setErrorMessage('Failed to load site mappings');
            } finally {
                setLoading(false);
            }
        };

        if (siteMappingModalIsOpen) {
            fetchSiteMappings();
        }
    }, [siteMappingModalIsOpen]);

    const handleSiteMappingChange = (id, field, value) => {
        const newMappings = siteMappings.map(site => {
            if (site.site_id === id) {
                return { ...site, [field]: value };
            }
            return site;
        });
        setSiteMappings(newMappings);
    };

    const updateSiteMappings = async () => {
        setLoading(true);
        try {
            await axios.post('/api/site_mappings/update', { siteMappings });
            alert('Site mappings updated successfully.');
            fetchData(); // Refresh the unified mapping table data
        } catch (error) {
            console.error('Failed to update site mappings:', error);
            alert('Failed to update site mappings.');
        } finally {
            setLoading(false);
            setSiteMappingModalIsOpen(false); // Close the modal
        }
    };

    // Fetch units mappings when the modal is opened
    useEffect(() => {
        const fetchUnitsMappings = async () => {
            setLoading(true);
            try {
                const response = await axios.get('/api/units_mappings');
                setUnitsMappings(response.data.sort((a, b) => a.uz_phen_name.localeCompare(b.uz_phen_name)) || []);
            } catch (error) {
                console.error('Error fetching units mappings:', error);
                setErrorMessage('Failed to load units mappings');
            } finally {
                setLoading(false);
            }
        };

        if (unitsMappingModalIsOpen) {
            fetchUnitsMappings();
        }
    }, [unitsMappingModalIsOpen]);

    const handleUnitsMappingChange = (id, field, value) => {
        const newMappings = unitsMappings.map(unit => {
            if (unit.id === id) {
                return { ...unit, [field]: value };
            }
            return unit;
        });
        setUnitsMappings(newMappings);
    };

    const updateUnitsMappings = async () => {
        setLoading(true);
        try {
            await axios.post('/api/units_mappings/update', { unitsMappings });
            alert('Units mappings updated successfully.');
            fetchData(); // Refresh the unified mapping table data
        } catch (error) {
            console.error('Failed to update units mappings:', error);
            alert('Failed to update units mappings.');
        } finally {
            setLoading(false);
            setUnitsMappingModalIsOpen(false); // Close the modal
        }
    };

    const handleUZPhenNameChange = (e) => {
        const selectedName = e.target.value;
        setSelectedUZPhenName(selectedName);

        // Optionally, scroll to the selected row
        const row = document.getElementById(`unit-row-${selectedName}`);
        if (row) {
            row.scrollIntoView({ behavior: 'smooth' });
        }
    };


    const [sankeyModalIsOpen, setSankeyModalIsOpen] = useState(false);
    const [filterModalIsOpen, setFilterModalIsOpen] = useState(false);
    const [sankeyData, setSankeyData] = useState(null);
    const [availableDisplayServerNames, setAvailableDisplayServerNames] = useState([]);
    const [selectedServers, setSelectedServers] = useState([]);
    const chartRef = useRef(null);

    // New state for Sankey diagram adjustments
    const [sankeySize, setSankeySize] = useState({ width: 1200, height: 800 });
    const [lineStyle, setLineStyle] = useState('gray'); // gray, source, or target




    useEffect(() => {
        // Fetch the list of display_server_name values with include_in_summary = true for filtering
        const fetchDisplayServerNames = async () => {
            try {
                const result = await axios.get('/api/unified_mapping_table/display_servers');
                setAvailableDisplayServerNames(result.data);
            } catch (error) {
                console.error('Error fetching display server names:', error);
            }
        };
        fetchDisplayServerNames();
    }, []);

    const handleServerSelection = (serverName) => {
        setSelectedServers((prevSelected) =>
            prevSelected.includes(serverName)
                ? prevSelected.filter((name) => name !== serverName)
                : [...prevSelected, serverName]
        );
    };

    const generateSankey = async () => {
        try {
            const result = await axios.get('/api/unified_mapping_table/sankey', {
                params: { includeInSummary: true, selectedServers }
            });

            const data = result.data;

            setSankeyData(data);
            setSankeyModalIsOpen(true);
        } catch (error) {
            console.error('Error generating Sankey diagram:', error);
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

    const sankeyOptions = sankeyData && {
        title: {
            text: 'Site-Variable Mappings',
            left: 'center'
        },
        tooltip: {
            trigger: 'item',
            triggerOn: 'mousemove'
        },
        series: [
            {
                type: 'sankey',
                layout: 'none',
                data: sankeyData.nodes,
                links: sankeyData.links,
                lineStyle: {
                    color: lineStyle,
                    curveness: 0.5
                },
                nodeWidth: 20,
                nodeGap: 12,
                label: {
                    fontSize: 10,
                    overflow: 'break'
                }
            }
        ]
    };

    const closeSankeyModal = () => setSankeyModalIsOpen(false);

    const increaseSize = () => {
        setSankeySize((prevSize) => ({
            width: prevSize.width + 200,
            height: prevSize.height + 100,
        }));
    };

    const decreaseSize = () => {
        setSankeySize((prevSize) => ({
            width: Math.max(800, prevSize.width - 200),
            height: Math.max(600, prevSize.height - 100),
        }));
    };

    const changeLineStyle = (style) => {
        setLineStyle(style);
    };



    return (
        <div className="unified-mapping-table">
            <button onClick={openModal}>Info</button>

            <button onClick={() => setFilterModalIsOpen(true)}>Filter and Generate Sankey</button>

            {/* Filter Modal */}
            <Modal
                isOpen={filterModalIsOpen}
                onRequestClose={() => setFilterModalIsOpen(false)}
                contentLabel="Select Servers for Sankey"
                className="filter-modal"
            >
                <div className="filter-modal-header">
                    <h2>Select Servers for Sankey Diagram</h2>
                    <button className="filter-modal-close-button" onClick={() => setFilterModalIsOpen(false)}>X</button>
                </div>
                <div className="server-selection">
                    {availableDisplayServerNames.map((server) => (
                        <div key={server}>
                            <input
                                type="checkbox"
                                id={server}
                                checked={selectedServers.includes(server)}
                                onChange={() => handleServerSelection(server)}
                            />
                            <label htmlFor={server}>{server}</label>
                        </div>
                    ))}
                </div>
                <div className="filter-modal-actions">
                    <button
                        onClick={() => {
                            setFilterModalIsOpen(false);
                            generateSankey();
                        }}
                    >
                        Generate Sankey
                    </button>
                </div>
            </Modal>


            {/* Sankey Diagram Modal */}
            <Modal
                isOpen={sankeyModalIsOpen}
                onRequestClose={closeSankeyModal}
                contentLabel="Sankey Diagram"
                overlayClassName="sankey-modal-overlay"
                className="sankey-modal"
            >
                <div className="sankey-modal-header">
                    <button className="sankey-modal-close-button" onClick={closeSankeyModal}>X</button>
                    <h2>Site-Variable Mappings</h2>
                    <div>
                        <button onClick={decreaseSize}>Reduce Size</button>
                        <button onClick={increaseSize}>Increase Size</button>
                        <button onClick={() => changeLineStyle('source')}>Line Color: Source</button>
                        <button onClick={() => changeLineStyle('target')}>Line Color: Target</button>
                        <button onClick={() => changeLineStyle('gray')}>Line Color: Gray</button>
                    </div>
                    <button className="sankey-save-button" onClick={saveChart}>Save Chart</button>
                </div>
                <div className="sankey-container" style={{ overflow: 'auto', width: '100%', height: '100%' }}>
                    {sankeyData ? (
                        <ReactECharts
                            ref={chartRef}
                            option={sankeyOptions}
                            style={{ width: `${sankeySize.width}px`, height: `${sankeySize.height}px` }}
                        />
                    ) : (
                        <p>Loading Sankey diagram...</p>
                    )}
                </div>
            </Modal>


            <button onClick={() => setSiteMappingModalIsOpen(true)}>Site Mappings</button>
            <button onClick={() => setUnitsMappingModalIsOpen(true)}>Units Mappings</button>
            <Modal isOpen={modalIsOpen} onRequestClose={closeModal} contentLabel="Instructions" className="info-modal">
                <div className="info-modal-header">
                    <button className="info-modal-close-button" onClick={closeModal}>X</button>
                    <h2>Unified Mapping Table Instructions</h2>
                </div>
                <p>Welcome to the Unified Mapping Table page. Here’s a step-by-step guide on how to navigate and use this interface:</p>
                <ol>
                    <li>
                        <strong>Filter Data:</strong>
                        <ul>
                            <li>Use the dropdown filters at the top to select the <em>Server</em>, <em>Table</em>, and <em>Field</em> you want to view.</li>
                            <li>Click the <em>Include in Summary</em> checkbox filter to display only the row should be included or not in the summary.</li>
                        </ul>
                    </li>
                    <li>
                        <strong>Select Rows:</strong>
                        <ul>
                            <li>Select rows by clicking the checkbox next that row.</li>
                        </ul>
                    </li>
                    <li>
                        <strong>Update Rows:</strong>
                        <ul>
                            <li>Fill in the fields in the update section with the new values you wish to apply to the selected row.</li>
                            <li>Click the "Update Selected Row" button to apply your changes. Make sure to verify the changes before updating to avoid any conflicts or duplicate entries.</li>
                        </ul>
                    </li>

                    <li>
                        <strong>Site and Units Mappings:</strong>
                        <ul>
                            <li>Use the <em>Site Mappings</em> and <em>Units Mappings</em> buttons to manage and update site-specific and unit-specific mappings.</li>
                            <li>Within the Units Mappings modal, use the dropdown at the top to select a <em>UZ Phen Name</em> and navigate to that row for editing.</li>
                        </ul>
                    </li>
                </ol>
                <p>If you encounter any errors or issues, an alert message will be displayed with relevant information. Follow the on-screen instructions to resolve the issue or contact support for further assistance.</p>
                <button onClick={closeModal}>Close</button>
            </Modal>

            <Modal isOpen={siteMappingModalIsOpen} onRequestClose={() => setSiteMappingModalIsOpen(false)} contentLabel="Site Mappings" className="site-mapping-modal">
                <div className="site-mapping-modal-header">
                    <button className="site-mapping-close-button" onClick={() => setSiteMappingModalIsOpen(false)}>X</button>
                    <h2>Site Mappings</h2>
                    <button className="site-mapping-save-button" onClick={updateSiteMappings}>Save Changes</button>
                </div>
                <table className="site-mapping-table">
                    <thead>
                    <tr>
                        <th>Site Name</th>
                        <th>Display Name</th>
                        <th>Longitude</th>
                        <th>Latitude</th>
                        <th>Altitude</th>
                        <th>Description</th>
                        <th>Image</th>
                        <th>Website URL</th>
                        <th>Modal Content</th>
                        <th>Citation</th> {/* New field */}
                        <th>DOI</th> {/* New field */}
                    </tr>
                    </thead>
                    <tbody>
                    {siteMappings.map(site => (
                        <tr key={site.site_id}>
                            <td>{site.site_name}</td>
                            <td>
                                <input
                                    type="text"
                                    value={site.display_name}
                                    onChange={(e) => handleSiteMappingChange(site.site_id, 'display_name', e.target.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={site.longitude}
                                    onChange={(e) => handleSiteMappingChange(site.site_id, 'longitude', e.target.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={site.latitude}
                                    onChange={(e) => handleSiteMappingChange(site.site_id, 'latitude', e.target.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={site.altitude || ''}
                                    onChange={(e) => handleSiteMappingChange(site.site_id, 'altitude', e.target.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={site.description || ''}
                                    onChange={(e) => handleSiteMappingChange(site.site_id, 'description', e.target.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={site.image || ''}
                                    onChange={(e) => handleSiteMappingChange(site.site_id, 'image', e.target.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={site.website_url || ''}
                                    onChange={(e) => handleSiteMappingChange(site.site_id, 'website_url', e.target.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={site.modal_content || ''}
                                    onChange={(e) => handleSiteMappingChange(site.site_id, 'modal_content', e.target.value)}
                                />
                            </td>
                            <td> {/* New field for citation */}
                                <input
                                    type="text"
                                    value={site.citation || ''}
                                    onChange={(e) => handleSiteMappingChange(site.site_id, 'citation', e.target.value)}
                                />
                            </td>
                            <td> {/* New field for DOI */}
                                <input
                                    type="text"
                                    value={site.doi || ''}
                                    onChange={(e) => handleSiteMappingChange(site.site_id, 'doi', e.target.value)}
                                />
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </Modal>

            <Modal isOpen={unitsMappingModalIsOpen} onRequestClose={() => setUnitsMappingModalIsOpen(false)} contentLabel="Units Mappings" className="site-mapping-modal">
                <div className="site-mapping-modal-header">
                    <button className="site-mapping-close-button" onClick={() => setUnitsMappingModalIsOpen(false)}>X</button>
                    <h2>Units Mappings</h2>
                    <button className="site-mapping-save-button" onClick={updateUnitsMappings}>Save Changes</button>
                </div>
                <div className="units-mapping-filter">
                    <label htmlFor="uzPhenName">Select UZ Phen Name:</label>
                    <select id="uzPhenName" value={selectedUZPhenName} onChange={handleUZPhenNameChange}>
                        <option value="">Select UZ Phen Name</option>
                        {unitsMappings.map(unit => (
                            <option key={unit.id} value={unit.uz_phen_name}>{unit.uz_phen_name}</option>
                        ))}
                    </select>
                </div>
                <table className="site-mapping-table">
                    <thead>
                    <tr>
                        <th>UZ Phen Name</th>
                        <th>Phen Name</th>
                        <th>Phen Name Full</th>
                        <th>Phen Type</th>
                        <th>Units</th>
                        <th>Measure</th>
                        <th>Offset</th>
                        <th>Var Type</th>
                        <th>UZ Units</th>
                        <th>UZ Measure</th>
                    </tr>
                    </thead>
                    <tbody>
                    {unitsMappings.map(unit => (
                        <tr key={unit.id} id={`unit-row-${unit.uz_phen_name}`}>
                            <td>{unit.uz_phen_name}</td>
                            <td>
                                <input
                                    type="text"
                                    value={unit.phen_name}
                                    onChange={(e) => handleUnitsMappingChange(unit.id, 'phen_name', e.target.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={unit.phen_name_full}
                                    onChange={(e) => handleUnitsMappingChange(unit.id, 'phen_name_full', e.target.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={unit.phen_type}
                                    onChange={(e) => handleUnitsMappingChange(unit.id, 'phen_type', e.target.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={unit.units}
                                    onChange={(e) => handleUnitsMappingChange(unit.id, 'units', e.target.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={unit.measure}
                                    onChange={(e) => handleUnitsMappingChange(unit.id, 'measure', e.target.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={unit.offset}
                                    onChange={(e) => handleUnitsMappingChange(unit.id, 'offset', e.target.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={unit.var_type}
                                    onChange={(e) => handleUnitsMappingChange(unit.id, 'var_type', e.target.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={unit.uz_units}
                                    onChange={(e) => handleUnitsMappingChange(unit.id, 'uz_units', e.target.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={unit.uz_measure}
                                    onChange={(e) => handleUnitsMappingChange(unit.id, 'uz_measure', e.target.value)}
                                />
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </Modal>
            <Modal isOpen={errorModalIsOpen} onRequestClose={closeErrorModal} contentLabel="Error Message">
                <h2>Error</h2>
                <p>{errorMessage}</p>
                <button onClick={closeErrorModal}>Close</button>
            </Modal>
            <Modal isOpen={alertModalIsOpen} onRequestClose={closeAlertModal} contentLabel="Alert Message">
                <h2>Alert</h2>
                <p>{alertMessage}</p>
                <button onClick={closeAlertModal}>Close</button>
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
                    <label>Longitude</label>
                    <input
                        type="text"
                        placeholder="Longitude"
                        value={updateValues.longitude}
                        onChange={e => setUpdateValues({ ...updateValues, longitude: e.target.value })}
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
                    <label>Units</label>
                    <input
                        type="text"
                        placeholder="Units"
                        value={updateValues.units}
                        onChange={e => setUpdateValues({ ...updateValues, units: e.target.value })}
                    />
                </div>
                <div className="input-group">
                    <label>Multiplier</label>
                    <input
                        type="text"
                        placeholder="Multiplier"
                        value={updateValues.multiplier}
                        onChange={e => setUpdateValues({ ...updateValues, multiplier: e.target.value })}
                    />
                </div>
                <div className="input-group">
                    <label>Aggregation (minutes)</label>
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
                <button onClick={handleUpdate} disabled={loading}>Update Selected Row</button>
                <button onClick={showDuplicates}>Show Duplicates</button>
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
                    <th></th>
                    <th>Current Server Name</th>
                    <th>Current Table Name</th>
                    <th>Current Field Name</th>
                    <th>Display Server Name</th>
                    <th>Display Table Name</th>
                    <th>Display Field Name</th>
                    <th>Longitude</th>
                    <th>Latitude</th>
                    <th>Units</th>
                    <th>Multiplier</th> {/* Add Multiplier header */}
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
                                    checked={selectedRow === row.id}
                                    onChange={() => handleRowSelect(row)}
                                />
                            </td>
                            <td>{row.current_server_name}</td>
                            <td>{row.current_table_name}</td>
                            <td>{row.current_field_name}</td>
                            <td>{row.display_server_name}</td>
                            <td>{row.display_table_name}</td>
                            <td>{row.display_field_name}</td>
                            <td>{row.longitude}</td>
                            <td>{row.latitude}</td>
                            <td>{row.display_units}</td>
                            <td>{row.multiplier}</td> {/* Add Multiplier field */}
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
