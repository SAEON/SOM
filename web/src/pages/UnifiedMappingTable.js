import React, {useEffect, useRef, useState} from 'react';
import axios from 'axios';
import {Oval} from 'react-loader-spinner';
import Modal from 'react-modal';
import ReactECharts from 'echarts-for-react'; // Import ECharts
import './UnifiedMappingTable.css';

const UnifiedMappingTable = () => {
    const [data, setData] = useState([]);
    const [selectedRow, setSelectedRow] = useState(null);
    const [selectedBulkRows, setSelectedBulkRows] = useState([]);
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
    const [bulkValues, setBulkValues] = useState({
        displayServerName: '',
        displayTableName: '',
        latitude: '',
        longitude: '',
        multiplier: '1',
        aggregationType: '',
        includeInSummary: true,
        applyToFilteredRows: false
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
    const [health, setHealth] = useState(null);
    const [healthRefreshing, setHealthRefreshing] = useState(false);
    const [preflight, setPreflight] = useState(null);
    const [uploadingSiteId, setUploadingSiteId] = useState(null);
    const [activeWorkflowTab, setActiveWorkflowTab] = useState('mapping');
    const [activeIssueType, setActiveIssueType] = useState('');
    const [issueRows, setIssueRows] = useState([]);
    const [issueSource, setIssueSource] = useState('');
    const [issueLoading, setIssueLoading] = useState(false);
    const [issueMessage, setIssueMessage] = useState('');
    const [highlightedSiteMappingId, setHighlightedSiteMappingId] = useState(null);
    const [backfillWalkthrough, setBackfillWalkthrough] = useState(null);
    const [backfillFile, setBackfillFile] = useState(null);
    const [backfillBusy, setBackfillBusy] = useState(false);
    const [backfillResult, setBackfillResult] = useState(null);
    const [backfillJobs, setBackfillJobs] = useState([]);
    const [backfillServers, setBackfillServers] = useState([]);
    const [backfillTables, setBackfillTables] = useState([]);
    const [selectedBackfillServer, setSelectedBackfillServer] = useState('');
    const [selectedBackfillTable, setSelectedBackfillTable] = useState('');

    // Site mappings state
    const [siteMappingModalIsOpen, setSiteMappingModalIsOpen] = useState(false);
    const [siteMappings, setSiteMappings] = useState([]);
    const [siteMappingSearch, setSiteMappingSearch] = useState('');
    const [siteLocationGaps, setSiteLocationGaps] = useState([]);
    const [publicMapLocations, setPublicMapLocations] = useState([]);

    // Units mappings state
    const [unitsMappingModalIsOpen, setUnitsMappingModalIsOpen] = useState(false);
    const [unitsMappings, setUnitsMappings] = useState([]);
    const [selectedUZPhenName, setSelectedUZPhenName] = useState('');

    const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

    const getApiErrorMessage = (error) => {
        const data = error.response?.data;
        if (Array.isArray(data?.errors) && data.errors.length > 0) {
            return data.errors.join('\n');
        }
        return data?.message || data?.error || error.message || 'Unexpected error';
    };

    const buildUpdatePayload = () => ({
        ids: selectedRow ? [selectedRow] : [],
        displayServerName: normalizeText(updateValues.displayServerName),
        displayTableName: normalizeText(updateValues.displayTableName),
        displayFieldName: normalizeText(updateValues.displayFieldName),
        latitude: normalizeText(updateValues.latitude),
        longitude: normalizeText(updateValues.longitude),
        units: normalizeText(updateValues.units),
        aggregationType: normalizeText(updateValues.aggregationType),
        multiplier: normalizeText(updateValues.multiplier),
        includeInSummary: updateValues.includeInSummary
    });

    const buildBulkPayload = () => ({
        ids: bulkValues.applyToFilteredRows ? [] : selectedBulkRows,
        filters: {
            serverName: selectedServer,
            tableName: selectedTable,
            fieldName: selectedField,
            includeInSummary: includeInSummaryFilter
        },
        displayServerName: normalizeText(bulkValues.displayServerName),
        displayTableName: normalizeText(bulkValues.displayTableName),
        latitude: normalizeText(bulkValues.latitude),
        longitude: normalizeText(bulkValues.longitude),
        aggregationType: normalizeText(bulkValues.aggregationType),
        multiplier: normalizeText(bulkValues.multiplier),
        includeInSummary: bulkValues.includeInSummary,
        copyCurrentFieldNames: true,
        copyCurrentUnits: true
    });

    const selectedBulkRowCount = bulkValues.applyToFilteredRows ? null : selectedBulkRows.length;
    const visibleRowIds = data.map((row) => row.id);
    const allVisibleRowsSelected = visibleRowIds.length > 0 && visibleRowIds.every((id) => selectedBulkRows.includes(id));

    const fetchHealth = async () => {
        setHealthRefreshing(true);
        try {
            const result = await axios.get('/api/unified_mapping_table/health');
            setHealth(result.data);
        } catch (error) {
            console.error('Error fetching mapping health:', error);
            setHealth(null);
        } finally {
            setHealthRefreshing(false);
        }
    };

    useEffect(() => {
        fetchHealth();
    }, []);

    const issueTypeByMetricLabel = {
        'Blank live display field names': 'blank_live_display_field_names',
        'Blank live display server names': 'blank_live_display_server_names',
        'Blank live display table names': 'blank_live_display_table_names',
        'Blank live site card display names': 'blank_live_site_card_display_names',
        'Display server names needing trim': 'display_server_names_needing_trim',
        'Invalid live coordinates': 'invalid_live_coordinates',
        'Live site card names needing trim': 'live_site_card_names_needing_trim'
    };

    const issueLabels = {
        blank_live_display_field_names: 'Blank live display field names',
        blank_live_display_server_names: 'Blank live display server names',
        blank_live_display_table_names: 'Blank live display table names',
        blank_live_site_card_display_names: 'Blank live site card display names',
        display_server_names_needing_trim: 'Display server names needing trim',
        invalid_live_coordinates: 'Invalid live coordinates',
        live_site_card_names_needing_trim: 'Live site card names needing trim',
        duplicate_live_keys: 'Duplicate live key groups'
    };

    const issueHelp = {
        blank_live_display_field_names: {
            route: 'Live Mapping row',
            meaning: 'These raw fields are marked Include in Summary, but no public field name has been supplied.',
            fix: 'Click Edit Row, add Display Server, Display Table, Display Field, units, coordinates, multiplier, and aggregation, then run Preflight and Update Selected Row.'
        },
        blank_live_display_server_names: {
            route: 'Live Mapping row',
            meaning: 'These rows are live, but they are not linked to a public display site name yet.',
            fix: 'Click Edit Row and add the public Display Server Name. This must match the public site/table naming used on the Data tab.'
        },
        blank_live_display_table_names: {
            route: 'Live Mapping row',
            meaning: 'These rows are live, but have no public table name.',
            fix: 'Click Edit Row and set the Display Table Name, for example hourly, daily, 5 minute, 10 minute, or saeonflux.'
        },
        blank_live_site_card_display_names: {
            route: 'Site Assets',
            meaning: 'A LoggerNet site has live public data rows, but the matching site card has no Display name, so Home/Map presentation is incomplete.',
            fix: 'Click Open Site Mappings. Add a Display name and public card fields, or clear/remove the live field mappings if this site should not be public yet.'
        },
        display_server_names_needing_trim: {
            route: 'Live Mapping row',
            meaning: 'A public display site name has leading or trailing spaces. That can create duplicate-looking sites.',
            fix: 'Click Edit Row and save the trimmed display server name.'
        },
        invalid_live_coordinates: {
            route: 'Live Mapping row',
            meaning: 'Rows are marked live but their latitude/longitude are blank or outside valid ranges.',
            fix: 'Click Edit Row and add valid decimal coordinates, or untick Include in Summary until coordinates are known.'
        },
        live_site_card_names_needing_trim: {
            route: 'Site Assets',
            meaning: 'A public site card Display name has extra leading or trailing spaces.',
            fix: 'Open Site Mappings, trim the Display name, then Save Changes.'
        },
        duplicate_live_keys: {
            route: 'Live Mapping row',
            meaning: 'More than one live raw field maps to the same public site/table/field/aggregation key.',
            fix: 'Review the duplicate rows and either rename one public field, change the aggregation, or disable Include in Summary on the row that should not publish.'
        }
    };

    const fetchIssueRows = async (type) => {
        if (!type) return;
        setActiveIssueType(type);
        setIssueLoading(true);
        setIssueMessage('');
        setIssueRows([]);
        try {
            const result = await axios.get('/api/unified_mapping_table/issues', {
                params: {type, limit: 200}
            });
            setIssueRows(result.data.rows || []);
            setIssueSource(result.data.source || '');
            setActiveWorkflowTab(result.data.source === 'site' ? 'sites' : 'mapping');
        } catch (error) {
            console.error('Failed to load mapping issues:', error);
            setIssueMessage(getApiErrorMessage(error));
        } finally {
            setIssueLoading(false);
        }
    };

    const selectIssueRow = (row) => {
        if (issueSource === 'site') {
            setHighlightedSiteMappingId(row.site_id);
            setSiteMappingModalIsOpen(true);
            return;
        }
        handleRowSelect(row);
        setActiveWorkflowTab('mapping');
        window.setTimeout(() => {
            document.querySelector('.mapping-editor-card')?.scrollIntoView({behavior: 'smooth', block: 'start'});
        }, 50);
    };

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
                        params: {serverName: selectedServer}
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
                        params: {serverName: selectedServer, tableName: selectedTable}
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

    const fetchBackfillWalkthrough = async () => {
        try {
            const result = await axios.get('/api/backfill/walkthrough');
            setBackfillWalkthrough(result.data);
        } catch (error) {
            setBackfillResult({ok: false, errors: [getApiErrorMessage(error)]});
        }
    };

    const fetchBackfillJobs = async () => {
        try {
            const result = await axios.get('/api/backfill/jobs', {params: {limit: 10}});
            setBackfillJobs(result.data.items || []);
        } catch (error) {
            console.error('Failed to fetch backfill jobs:', error);
        }
    };

    const fetchBackfillServers = async () => {
        try {
            const result = await axios.get('/api/summary_table/servers');
            setBackfillServers((result.data || [])
                .map((row) => row.display_server_name)
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b)));
        } catch (error) {
            setBackfillResult({ok: false, errors: [getApiErrorMessage(error)]});
        }
    };

    const fetchBackfillTables = async (serverName) => {
        if (!serverName) {
            setBackfillTables([]);
            setSelectedBackfillTable('');
            return;
        }
        try {
            const result = await axios.get('/api/summary_table/tables', {params: {serverName}});
            setBackfillTables((result.data || [])
                .map((row) => row.display_table_name)
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b)));
        } catch (error) {
            setBackfillTables([]);
            setBackfillResult({ok: false, errors: [getApiErrorMessage(error)]});
        }
    };

    useEffect(() => {
        if (activeWorkflowTab === 'backfill') {
            fetchBackfillWalkthrough();
            fetchBackfillServers();
            fetchBackfillJobs();
        }
    }, [activeWorkflowTab]);

    useEffect(() => {
        if (activeWorkflowTab === 'backfill') {
            fetchBackfillTables(selectedBackfillServer);
        }
    }, [activeWorkflowTab, selectedBackfillServer]);

    const requireBackfillSelection = () => {
        if (!selectedBackfillServer || !selectedBackfillTable) {
            setBackfillResult({
                ok: false,
                errors: ['Select a public server and table in the Backfill target before using the backfill workflow.']
            });
            return false;
        }
        return true;
    };

    const downloadBackfillTemplate = async () => {
        if (!requireBackfillSelection()) return;
        setBackfillBusy(true);
        setBackfillResult(null);
        try {
            const response = await axios.get('/api/backfill/template', {
                params: {serverName: selectedBackfillServer, tableName: selectedBackfillTable},
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([response.data], {type: 'text/csv'}));
            const link = document.createElement('a');
            link.href = url;
            link.download = `${selectedBackfillServer}_${selectedBackfillTable}_backfill_template.csv`.replace(/[^a-z0-9._-]+/gi, '_');
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            setBackfillResult({ok: false, errors: [getApiErrorMessage(error)]});
        } finally {
            setBackfillBusy(false);
        }
    };

    const submitBackfillFile = async (mode) => {
        if (!requireBackfillSelection()) return;
        if (!backfillFile) {
            setBackfillResult({ok: false, errors: ['Choose a completed CSV template first.']});
            return;
        }

        const formData = new FormData();
        formData.append('serverName', selectedBackfillServer);
        formData.append('tableName', selectedBackfillTable);
        formData.append('file', backfillFile);

        setBackfillBusy(true);
        setBackfillResult(null);
        try {
            const result = await axios.post(`/api/backfill/${mode}`, formData, {
                headers: {'Content-Type': 'multipart/form-data'}
            });
            setBackfillResult(result.data);
            fetchBackfillJobs();
            if (mode === 'import') {
                fetchHealth();
            }
        } catch (error) {
            setBackfillResult(error.response?.data || {ok: false, errors: [getApiErrorMessage(error)]});
            fetchBackfillJobs();
        } finally {
            setBackfillBusy(false);
        }
    };

    const handleUpdate = async () => {
        const payload = buildUpdatePayload();
        const {latitude, longitude, aggregationType, multiplier} = payload;

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
            const preflightResponse = await axios.post('/api/unified_mapping_table/preflight', payload);
            setPreflight(preflightResponse.data);

            const response = await axios.post('/api/unified_mapping_table/update', payload);

            if (response.status === 200) {
                const warnings = response.data.warnings?.length ? `\n\nWarnings:\n${response.data.warnings.join('\n')}` : '';
                setAlertMessage(`Update successful. Summary table updated.${warnings}`);
                setAlertModalIsOpen(true);
                fetchData();
                fetchHealth();
            } else {
                setAlertMessage(`Update failed: ${response.data.message || response.data.error}`);
                setAlertModalIsOpen(true);
            }
        } catch (error) {
            setPreflight(error.response?.data || null);
            setAlertMessage(`Update failed:\n${getApiErrorMessage(error)}`);
            setAlertModalIsOpen(true);
        } finally {
            setLoading(false);
        }
    };

    const toggleBulkRowSelection = (rowId) => {
        setSelectedBulkRows((current) =>
            current.includes(rowId)
                ? current.filter((id) => id !== rowId)
                : [...current, rowId]
        );
    };

    const selectVisibleBulkRows = () => {
        setSelectedBulkRows((current) => {
            const existing = new Set(current);
            visibleRowIds.forEach((id) => existing.add(id));
            return Array.from(existing);
        });
    };

    const clearBulkSelection = () => {
        setSelectedBulkRows([]);
        setBulkValues((current) => ({...current, applyToFilteredRows: false}));
    };

    const handleBulkApply = async () => {
        if (!bulkValues.applyToFilteredRows && selectedBulkRows.length === 0) {
            setAlertMessage('Tick one or more mapping rows before applying shared values.');
            setAlertModalIsOpen(true);
            return;
        }
        if (bulkValues.applyToFilteredRows && !selectedServer) {
            setAlertMessage('Choose at least a server filter before applying shared values to filtered rows.');
            setAlertModalIsOpen(true);
            return;
        }

        const payload = buildBulkPayload();
        setLoading(true);
        try {
            const response = await axios.post('/api/unified_mapping_table/bulk-apply', payload);
            const summary = response.data.summary || {};
            setAlertMessage(`Bulk mapping applied successfully.\nRows updated: ${response.data.rowsUpdated}\nSummary updated: ${summary.updated || 0}\nSummary inserted: ${summary.inserted || 0}\nSummary removed: ${summary.deleted || 0}`);
            setAlertModalIsOpen(true);
            setSelectedBulkRows([]);
            fetchData();
            fetchHealth();
        } catch (error) {
            setAlertMessage(`Bulk mapping failed:\n${getApiErrorMessage(error)}`);
            setAlertModalIsOpen(true);
        } finally {
            setLoading(false);
        }
    };

    const runPreflight = async () => {
        if (!selectedRow) {
            setAlertMessage('Select a row before running preflight.');
            setAlertModalIsOpen(true);
            return;
        }

        setLoading(true);
        try {
            const result = await axios.post('/api/unified_mapping_table/preflight', buildUpdatePayload());
            setPreflight(result.data);
            setAlertMessage(result.data.warnings?.length ? `Ready to publish.\n\nWarnings:\n${result.data.warnings.join('\n')}` : 'Ready to publish.');
            setAlertModalIsOpen(true);
        } catch (error) {
            setPreflight(error.response?.data || null);
            setAlertMessage(`Preflight failed:\n${getApiErrorMessage(error)}`);
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

    const getAlertTone = () => {
        const message = alertMessage.toLowerCase();
        if (message.includes('image uploaded')) {
            return {kicker: 'Image ready', title: 'Image uploaded'};
        }
        if (message.includes('successfully') || message.includes('update successful')) {
            return {kicker: 'Saved', title: 'Site mappings updated'};
        }
        return {kicker: 'Needs attention', title: 'Site mappings not saved'};
    };

    const focusSiteMappingFromMessage = (message) => {
        const firstLine = String(message || '').split('\n').find((line) => line.includes(':'));
        const siteName = normalizeText(firstLine?.split(':')[0]);
        if (!siteName) return;
        const match = siteMappings.find((site) => normalizeText(site.site_name) === siteName || normalizeText(site.display_name) === siteName);
        if (match) {
            setHighlightedSiteMappingId(match.site_id);
            setSiteMappingSearch(siteName);
        }
    };

    const showDuplicates = async () => {
        await fetchIssueRows('duplicate_live_keys');
        window.setTimeout(() => {
            document.querySelector('.mapping-issue-panel')?.scrollIntoView({behavior: 'smooth', block: 'start'});
        }, 50);
    };

    // Fetch site mappings when the modal is opened
    useEffect(() => {
        const fetchSiteMappings = async () => {
            setLoading(true);
            try {
                const [response, gapsResponse, locationsResponse] = await Promise.all([
                    axios.get('/api/site_mappings?scope=assets'),
                    axios.get('/api/summary_table/location-gaps'),
                    axios.get('/api/summary_table/locations'),
                ]);
                setSiteMappings(response.data.sort((a, b) => a.site_name.localeCompare(b.site_name)) || []);
                setSiteLocationGaps(gapsResponse.data?.items || []);
                setPublicMapLocations(Array.isArray(locationsResponse.data) ? locationsResponse.data : []);
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

    useEffect(() => {
        if (!siteMappingModalIsOpen || !highlightedSiteMappingId || siteMappings.length === 0) return;
        window.setTimeout(() => {
            document
                .querySelector(`[data-site-mapping-id="${highlightedSiteMappingId}"]`)
                ?.scrollIntoView({behavior: 'smooth', block: 'center'});
        }, 50);
    }, [siteMappingModalIsOpen, highlightedSiteMappingId, siteMappings]);

    const handleSiteMappingChange = (id, field, value) => {
        const newMappings = siteMappings.map(site => {
            if (site.site_id === id) {
                return {...site, [field]: value};
            }
            return site;
        });
        setSiteMappings(newMappings);
    };

    const uploadSiteImage = async (siteId, file) => {
        if (!file) return;

        setUploadingSiteId(siteId);
        const formData = new FormData();
        formData.append('image', file);
        formData.append('siteId', siteId);

        try {
            const response = await axios.post('/api/site_mappings/image', formData, {
                headers: {'Content-Type': 'multipart/form-data'}
            });
            handleSiteMappingChange(siteId, 'image', response.data.fileName);
            setAlertMessage(`Image uploaded: ${response.data.fileName}\n\nThe file was uploaded and saved to this site asset. It will still be there after refresh. If this site is ready to go public, make sure it also has a Display name and the other public card fields, then click Save Changes.`);
            setAlertModalIsOpen(true);
        } catch (error) {
            setAlertMessage(`Image upload failed:\n${getApiErrorMessage(error)}`);
            setAlertModalIsOpen(true);
        } finally {
            setUploadingSiteId(null);
        }
    };

    const updateSiteMappings = async () => {
        setLoading(true);
        let shouldCloseSiteMappingModal = false;
        try {
            console.log('Preparing to send site mappings:', siteMappings);
            const response = await axios.post('/api/site_mappings/update', { siteMappings });
            console.log('Update successful:', response.data);
            setAlertMessage(`Site mappings updated successfully.\nSite rows updated: ${response.data.siteMappingsUpdated}\nUnified rows updated: ${response.data.unifiedMappingsUpdated}`);
            setAlertModalIsOpen(true);
            fetchData(); // Refresh the unified mapping table data
            fetchHealth();
            shouldCloseSiteMappingModal = true;
        } catch (error) {
            console.error('Failed to update site mappings:', error);
            if (error.response) {
                console.error('Error status:', error.response.status);
                console.error('Error data:', error.response.data);
                console.error('Error headers:', error.response.headers);
            } else if (error.request) {
                console.error('No response received:', error.request);
            } else {
                console.error('Error message:', error.message);
            }
            const apiMessage = getApiErrorMessage(error);
            focusSiteMappingFromMessage(apiMessage);
            setAlertMessage(`Site mappings need attention before saving.\n\n${apiMessage}\n\nWhat this means: a Display name publishes the site into the public Home/Data/Map views. For each published site, complete the required public card fields such as image, coordinates, and description. If the site is not ready to go public yet, remove its Display name and save it as an unpublished asset.\n\nFix the highlighted site, then click Save Changes again.`);
            setAlertModalIsOpen(true);
        } finally {
            setLoading(false);
            if (shouldCloseSiteMappingModal) {
                setSiteMappingModalIsOpen(false);
            }
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
                return {...unit, [field]: value};
            }
            return unit;
        });
        setUnitsMappings(newMappings);
    };

    const updateUnitsMappings = async () => {
        setLoading(true);
        try {
            await axios.post('/api/units_mappings/update', {unitsMappings});
            setAlertMessage('Units mappings updated successfully.');
            setAlertModalIsOpen(true);
            fetchData(); // Refresh the unified mapping table data
            fetchHealth();
        } catch (error) {
            console.error('Failed to update units mappings:', error);
            setAlertMessage(`Failed to update units mappings:\n${getApiErrorMessage(error)}`);
            setAlertModalIsOpen(true);
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
            row.scrollIntoView({behavior: 'smooth'});
        }
    };


    const [sankeyModalIsOpen, setSankeyModalIsOpen] = useState(false);
    const [filterModalIsOpen, setFilterModalIsOpen] = useState(false);
    const [sankeyData, setSankeyData] = useState(null);
    const [availableDisplayServerNames, setAvailableDisplayServerNames] = useState([]);
    const [selectedServers, setSelectedServers] = useState([]);
    const chartRef = useRef(null);

    // New state for Sankey diagram adjustments
    const [sankeySize, setSankeySize] = useState({width: 1200, height: 800});
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
                params: {includeInSummary: true, selectedServers}
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


    const [isVariableDescModalVisible, setIsVariableDescModalVisible] = useState(false);
    const [isUnitDescModalVisible, setIsUnitDescModalVisible] = useState(false);

    const [variableDescriptionList, setVariableDescriptionList] = useState([]);
    const [unitDescriptionList, setUnitDescriptionList] = useState([]);

	    const filteredSiteMappings = siteMappings.filter((site) => {
	        const query = normalizeText(siteMappingSearch).toLowerCase();
	        if (!query) return true;
	        return [
            site.site_name,
            site.display_name,
            site.description,
            site.website_url,
            site.citation,
            site.doi
	        ].some((value) => String(value || '').toLowerCase().includes(query));
	    });
    const mappedWithoutPublicDataCount = siteLocationGaps.filter((gap) => gap.issue === 'mapped_without_public_data').length;
    const publicDataWithoutMappedLocationCount = siteLocationGaps.filter((gap) => gap.issue === 'public_data_without_mapped_location').length;
    const publicMapLocationCount = publicMapLocations.length;

    const getMetricCount = (label) => Number((health?.metrics || []).find((metric) => metric.label === label)?.count || 0);
    const flowCounts = {
        unifiedRows: getMetricCount('Unified rows'),
        liveRows: getMetricCount('Live unified rows'),
        fieldIssues:
            getMetricCount('Blank live display server names') +
            getMetricCount('Blank live display table names') +
            getMetricCount('Blank live display field names') +
            getMetricCount('Display server names needing trim') +
            getMetricCount('Invalid live coordinates') +
            Number(health?.duplicateLiveKeys || 0),
        siteIssues:
            getMetricCount('Blank live site card display names') +
            getMetricCount('Live site card names needing trim')
    };

    useEffect(() => {
        if (isVariableDescModalVisible) {
            fetchVariableDescriptionList();
        }
    }, [isVariableDescModalVisible]);

    useEffect(() => {
        if (isUnitDescModalVisible) {
            fetchUnitDescriptionList();
        }
    }, [isUnitDescModalVisible]);

    const fetchVariableDescriptionList = async () => {
        try {
            const result = await axios.get('/api/field_metadata_names');
            setVariableDescriptionList(result.data);
        } catch (error) {
            console.error('Error fetching variable descriptions:', error);
        }
    };

    const fetchUnitDescriptionList = async () => {
        try {
            const result = await axios.get('/api/field_metadata_units');
            setUnitDescriptionList(result.data);
        } catch (error) {
            console.error('Error fetching unit descriptions:', error);
        }
    };

    const handleVariableDescChange = (index, value) => {
        const updatedDescriptions = [...variableDescriptionList];
        updatedDescriptions[index].description = value;
        setVariableDescriptionList(updatedDescriptions);
    };

    const handleUnitDescChange = (index, value) => {
        const updatedDescriptions = [...unitDescriptionList];
        updatedDescriptions[index].units_description = value;
        setUnitDescriptionList(updatedDescriptions);
    };

    const updateVariableDescriptionList = async () => {
        if (!Array.isArray(variableDescriptionList)) {
            console.error("variableDescriptionList is not an array:", variableDescriptionList);
            return;
        }

        try {
            await axios.post('/api/field_metadata_names/update', {variableDescriptions: variableDescriptionList});
            alert('Variable descriptions updated successfully');
            setIsVariableDescModalVisible(false);
        } catch (error) {
            console.error('Error updating variable descriptions:', error);
        }
    };

    const updateUnitDescriptionList = async () => {
        if (!Array.isArray(unitDescriptionList)) {
            console.error("unitDescriptionList is not an array:", unitDescriptionList);
            return;
        }

        try {
            await axios.post('/api/field_metadata_units/update', {unitDescriptions: unitDescriptionList});
            alert('Unit descriptions updated successfully');
            setIsUnitDescModalVisible(false);
        } catch (error) {
            console.error('Error updating unit descriptions:', error);
        }
    };


    return (
        <div className="unified-mapping-table">
            <header className="mapping-page-hero">
                <div>
                    <span className="mapping-page-kicker">Technician console</span>
                    <h1>Unified Mapping</h1>
                    <p>Prepare LoggerNet sites, fields, metadata, and images before they appear in public views.</p>
                </div>
                <div className="mapping-workflow-steps" aria-label="Mapping workflow">
                    <span>Map</span>
                    <span>Check</span>
                    <span>Publish</span>
                </div>
            </header>

            <section className="mapping-health-panel">
                <div className="mapping-section-heading">
                    <div>
                    <h2>Unified Mapping Readiness</h2>
                    <p>Only rows with Include in Summary enabled are checked for public Data, Home, and Map readiness.</p>
                    </div>
                    <button type="button" className="mapping-secondary-button" onClick={fetchHealth} disabled={loading || healthRefreshing}>
                        {healthRefreshing ? 'Refreshing...' : 'Refresh Checks'}
                    </button>
                </div>
                {health && (
                    <>
                        <div className="mapping-health-grid">
                            {(health.metrics || []).map((metric) => (
                                <button
                                    type="button"
                                    className={`mapping-health-card ${metric.count > 0 && !['Unified rows', 'Live unified rows'].includes(metric.label) ? 'mapping-health-card--warn' : ''} ${issueTypeByMetricLabel[metric.label] ? 'mapping-health-card--clickable' : ''} ${activeIssueType === issueTypeByMetricLabel[metric.label] ? 'mapping-health-card--active' : ''}`}
                                    key={metric.label}
                                    onClick={() => issueTypeByMetricLabel[metric.label] && fetchIssueRows(issueTypeByMetricLabel[metric.label])}
                                    disabled={!issueTypeByMetricLabel[metric.label]}
                                >
                                    <span>{metric.label}</span>
                                    <strong>{metric.count}</strong>
                                </button>
                            ))}
                            <button
                                type="button"
                                className={`mapping-health-card ${health.duplicateLiveKeys > 0 ? 'mapping-health-card--warn' : ''} mapping-health-card--clickable ${activeIssueType === 'duplicate_live_keys' ? 'mapping-health-card--active' : ''}`}
                                onClick={() => fetchIssueRows('duplicate_live_keys')}
                            >
                                <span>Duplicate live key groups</span>
                                <strong>{health.duplicateLiveKeys}</strong>
                            </button>
                        </div>
                        {(activeIssueType || issueLoading || issueMessage) && (
                            <section className="mapping-issue-panel">
                                <div className="mapping-section-heading">
                                    <div>
                                        <h2>{issueLabels[activeIssueType] || 'Mapping issues'}</h2>
                                        <p>{issueSource === 'site' ? 'These rows are edited from Site Mappings.' : 'Select a row to load it into the publisher form.'}</p>
                                    </div>
                                    <button type="button" className="mapping-secondary-button" onClick={() => { setActiveIssueType(''); setIssueRows([]); setIssueMessage(''); }}>
                                        Clear
                                    </button>
                                </div>
                                {activeIssueType && issueHelp[activeIssueType] && (
                                    <div className="mapping-issue-help">
                                        <span>Fix in: {issueHelp[activeIssueType].route}</span>
                                        <strong>{issueHelp[activeIssueType].meaning}</strong>
                                        <p>{issueHelp[activeIssueType].fix}</p>
                                    </div>
                                )}
                                {issueLoading && <p className="mapping-issue-message">Loading issue rows...</p>}
                                {issueMessage && <p className="mapping-issue-message mapping-issue-message--bad">{issueMessage}</p>}
                                {!issueLoading && !issueMessage && issueRows.length === 0 && (
                                    <p className="mapping-issue-message">No rows found for this issue.</p>
                                )}
                                {issueRows.length > 0 && (
                                    <div className="mapping-issue-table-wrap">
                                        <table className="mapping-issue-table">
                                            <thead>
                                            <tr>
                                                {issueSource === 'site' ? (
                                                    <>
                                                        <th>LoggerNet Site</th>
                                                        <th>Display Name</th>
                                                        <th>Latitude</th>
                                                        <th>Longitude</th>
                                                        <th>Image</th>
                                                        <th></th>
                                                    </>
                                                ) : (
                                                    <>
                                                        <th>LoggerNet Site</th>
                                                        <th>Current Table</th>
                                                        <th>Current Field</th>
                                                        <th>Public Site</th>
                                                        <th>Public Table</th>
                                                        <th>Public Field</th>
                                                        <th></th>
                                                    </>
                                                )}
                                            </tr>
                                            </thead>
                                            <tbody>
                                            {issueRows.map((row) => (
                                                <tr key={row.id || row.site_id}>
                                                    {issueSource === 'site' ? (
                                                        <>
                                                            <td>{row.site_name}</td>
                                                            <td>{row.display_name || '(blank)'}</td>
                                                            <td>{row.latitude || '—'}</td>
                                                            <td>{row.longitude || '—'}</td>
                                                            <td>{row.image || '—'}</td>
                                                            <td><button type="button" className="mapping-secondary-button" onClick={() => selectIssueRow(row)}>Open Site Mappings</button></td>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <td>{row.current_server_name}</td>
                                                            <td>{row.current_table_name}</td>
                                                            <td>{row.current_field_name}</td>
                                                            <td>
                                                                <strong>{row.display_server_name || '(blank)'}</strong>
                                                                <small className="mapping-issue-link-note">Links to Site Assets by LoggerNet site name: {row.current_server_name}</small>
                                                            </td>
                                                            <td>{row.display_table_name || '(blank)'}</td>
                                                            <td>{row.display_field_name || '(blank)'}</td>
                                                            <td><button type="button" className="mapping-secondary-button" onClick={() => selectIssueRow(row)}>Edit Row</button></td>
                                                        </>
                                                    )}
                                                </tr>
                                            ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </section>
                        )}
                        {health.examples?.length > 0 && (
                            <details className="mapping-health-examples">
                                <summary>Show example rows needing attention</summary>
                                <ul>
                                    {health.examples.slice(0, 10).map((row) => (
                                        <li key={row.id}>
                                            {row.current_server_name} / {row.current_table_name} / {row.current_field_name || '(blank field)'} → {row.display_server_name || '(blank display site)'}
                                        </li>
                                    ))}
                                </ul>
                            </details>
                        )}
                    </>
                )}
            </section>

            <section className="mapping-flow-summary" aria-label="How Unified Mapping publishes data">
                <div className="mapping-section-heading">
                    <div>
                        <h2>How a site becomes public</h2>
                        <p>There are two gates: live field mappings publish data; site assets publish the Home and Map card.</p>
                    </div>
                </div>
                <div className="mapping-flow-diagram">
                    <div className="mapping-flow-node">
                        <span>1. Raw LoggerNet</span>
                        <strong>Server / table / field</strong>
                        <small>{flowCounts.unifiedRows.toLocaleString()} raw mapping rows tracked</small>
                    </div>
                    <div className="mapping-flow-link">
                        <span>Include in Summary = true</span>
                    </div>
                    <div className={`mapping-flow-node ${flowCounts.fieldIssues ? 'mapping-flow-node--warn' : ''}`}>
                        <span>2. Live field mapping</span>
                        <strong>Public site, table, field, units, coordinates</strong>
                        <small>{flowCounts.liveRows.toLocaleString()} live rows, {flowCounts.fieldIssues.toLocaleString()} field issues</small>
                    </div>
                    <div className="mapping-flow-link">
                        <span>Summary rebuild</span>
                    </div>
                    <div className="mapping-flow-node">
                        <span>3. Public data</span>
                        <strong>Data tab, downloads, API, availability</strong>
                        <small>Backfill templates are generated after this public table exists</small>
                    </div>
                    <div className={`mapping-flow-node mapping-flow-node--site ${flowCounts.siteIssues ? 'mapping-flow-node--warn' : ''}`}>
                        <span>4. Site asset card</span>
                        <strong>Display name, coordinates, image, description</strong>
                        <small>{flowCounts.siteIssues.toLocaleString()} linked site-card issues</small>
                    </div>
                    <div className="mapping-flow-link">
                        <span>Home and Map views</span>
                    </div>
                    <div className="mapping-flow-node">
                        <span>5. Public discovery</span>
                        <strong>Site cards, map markers, metadata links</strong>
                        <small>Site Assets are linked by the LoggerNet site name</small>
                    </div>
                </div>
            </section>

            <nav className="mapping-workflow-tabs" aria-label="Unified Mapping sections">
                <button className={activeWorkflowTab === 'mapping' ? 'active' : ''} onClick={() => setActiveWorkflowTab('mapping')}>Live Mapping</button>
                <button className={activeWorkflowTab === 'sites' ? 'active' : ''} onClick={() => setActiveWorkflowTab('sites')}>Site Assets</button>
                <button className={activeWorkflowTab === 'metadata' ? 'active' : ''} onClick={() => setActiveWorkflowTab('metadata')}>Metadata</button>
                <button className={activeWorkflowTab === 'backfill' ? 'active' : ''} onClick={() => setActiveWorkflowTab('backfill')}>Backfill</button>
                <button className={activeWorkflowTab === 'flow' ? 'active' : ''} onClick={() => setActiveWorkflowTab('flow')}>Flow Map</button>
            </nav>

            <section className="mapping-action-panel">
                {activeWorkflowTab === 'mapping' && (
                    <>
                        <button className="mapping-action-card" onClick={openModal}>
                            <strong>Instructions</strong>
                            <span>Review the publish workflow and field rules.</span>
                        </button>
                        <button className="mapping-action-card" onClick={runPreflight} disabled={loading || !selectedRow}>
                            <strong>Run Preflight</strong>
                            <span>Check the selected row before publishing it.</span>
                        </button>
                        <button className="mapping-action-card" onClick={showDuplicates}>
                            <strong>Find Duplicates</strong>
                            <span>Detect conflicting live display mappings.</span>
                        </button>
                    </>
                )}
                {activeWorkflowTab === 'sites' && (
                    <>
                        <button className="mapping-action-card" onClick={() => setSiteMappingModalIsOpen(true)}>
                            <strong>Site Mappings</strong>
                            <span>Edit display names, coordinates, DOI, citation, and images.</span>
                        </button>
                        <button className="mapping-action-card" onClick={fetchHealth}>
                            <strong>Refresh Site Checks</strong>
                            <span>Recalculate site readiness counts.</span>
                        </button>
                    </>
                )}
                {activeWorkflowTab === 'metadata' && (
                    <>
                        <button className="mapping-action-card" onClick={() => setUnitsMappingModalIsOpen(true)}>
                            <strong>Units Mappings</strong>
                            <span>Map raw unit names to public units.</span>
                        </button>
                        <button className="mapping-action-card" onClick={() => setIsVariableDescModalVisible(true)}>
                            <strong>Variable Descriptions</strong>
                            <span>Maintain public field descriptions.</span>
                        </button>
                        <button className="mapping-action-card" onClick={() => setIsUnitDescModalVisible(true)}>
                            <strong>Unit Descriptions</strong>
                            <span>Maintain public unit descriptions.</span>
                        </button>
                    </>
                )}
                {activeWorkflowTab === 'backfill' && (
                    <div className="backfill-workflow-panel">
                        <div className="backfill-workflow-main">
                            <div className="mapping-section-heading">
                                <div>
                                    <h2>Technician Data Backfill</h2>
                                    <p>Use a generated CSV template to safely load missed or historical values into a public site/table.</p>
                                </div>
                                <button className="mapping-secondary-button" type="button" onClick={fetchBackfillJobs}>Refresh Jobs</button>
                            </div>

                            <div className="backfill-target-card">
                                <span>Current target</span>
                                <strong>{selectedBackfillServer || 'Select a public server'} / {selectedBackfillTable || 'Select a public table'}</strong>
                                <small>Backfill only writes to fields already published through Unified Mapping and present in the Data tab.</small>
                                <div className="backfill-target-selectors">
                                    <label>
                                        Public server
                                        <select value={selectedBackfillServer} onChange={e => {
                                            setSelectedBackfillServer(e.target.value);
                                            setSelectedBackfillTable('');
                                            setBackfillFile(null);
                                            setBackfillResult(null);
                                        }}>
                                            <option value="">Select Server</option>
                                            {backfillServers.map(server => (
                                                <option key={server} value={server}>{server}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <label>
                                        Public table
                                        <select value={selectedBackfillTable} onChange={e => {
                                            setSelectedBackfillTable(e.target.value);
                                            setBackfillFile(null);
                                            setBackfillResult(null);
                                        }} disabled={!selectedBackfillServer}>
                                            <option value="">{selectedBackfillServer ? 'Select Table' : 'Select a server first'}</option>
                                            {backfillTables.map(table => (
                                                <option key={table} value={table}>{table}</option>
                                            ))}
                                        </select>
                                    </label>
                                </div>
                            </div>

                            <div className="backfill-button-row">
                                <button className="mapping-action-card" type="button" onClick={downloadBackfillTemplate} disabled={backfillBusy}>
                                    <strong>1. Download Template</strong>
                                    <span>Creates a CSV with timestamp plus the mapped public field names.</span>
                                </button>
                                <label className="mapping-action-card backfill-file-card">
                                    <strong>2. Choose Completed CSV</strong>
                                    <span>{backfillFile ? backfillFile.name : 'Upload the completed template after adding values.'}</span>
                                    <input
                                        type="file"
                                        accept=".csv,text/csv"
                                        onChange={(event) => setBackfillFile(event.target.files?.[0] || null)}
                                    />
                                </label>
                                <button className="mapping-action-card" type="button" onClick={() => submitBackfillFile('preflight')} disabled={backfillBusy}>
                                    <strong>3. Run Preflight</strong>
                                    <span>Checks timestamps, headers, blank rows, and import size without writing values.</span>
                                </button>
                                <button className="mapping-action-card mapping-action-card--primary" type="button" onClick={() => submitBackfillFile('import')} disabled={backfillBusy}>
                                    <strong>4. Import Values</strong>
                                    <span>Writes values, then the scheduled summary and availability jobs refresh public views.</span>
                                </button>
                            </div>

                            {backfillBusy && <p className="mapping-issue-message">Working on the backfill request...</p>}
                            {backfillResult && (
                                <div className={`backfill-result ${backfillResult.ok ? 'backfill-result--ok' : 'backfill-result--bad'}`}>
                                    <strong>{backfillResult.ok ? 'Backfill check passed' : backfillResult.message || 'Backfill needs attention'}</strong>
                                    <div className="backfill-result-stats">
                                        <span>Rows: {backfillResult.rowCount || 0}</span>
                                        <span>Values: {backfillResult.valueCount || 0}</span>
                                        {backfillResult.insertedOrUpdatedCount !== undefined && (
                                            <span>Changed: {backfillResult.insertedOrUpdatedCount}</span>
                                        )}
                                    </div>
                                    {backfillResult.warnings?.length > 0 && (
                                        <ul>
                                            {backfillResult.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                                        </ul>
                                    )}
                                    {backfillResult.errors?.length > 0 && (
                                        <ul>
                                            {backfillResult.errors.map((error) => <li key={error}>{error}</li>)}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>

                        <aside className="backfill-guide-panel">
                            <h3>Walkthrough</h3>
                            <ol>
                                {(backfillWalkthrough?.steps || [
                                    'Select a server and table.',
                                    'Download the template.',
                                    'Run Preflight before importing.',
                                ]).map((step) => <li key={step}>{step}</li>)}
                            </ol>
                            <h3>CSV rules</h3>
                            <ul>
                                {(backfillWalkthrough?.csvRules || []).map((rule) => <li key={rule}>{rule}</li>)}
                            </ul>
                        </aside>
                    </div>
                )}
                {activeWorkflowTab === 'flow' && (
                    <div className="mapping-flow-tools">
                        <div className="mapping-flow-help">
                            <h2>Flow Map</h2>
                            <p>Use this to inspect the full many-to-one field mapping. It is useful when a raw server has live fields, but public site assets are still incomplete.</p>
                        </div>
                        <button className="mapping-action-card" onClick={() => setFilterModalIsOpen(true)}>
                            <strong>Filter and Generate Sankey</strong>
                            <span>Inspect how raw names map into public names.</span>
                        </button>
                    </div>
                )}
            </section>

            {activeWorkflowTab === 'backfill' && (
                <section className="backfill-jobs-panel">
                    <div className="mapping-section-heading">
                        <div>
                            <h2>Recent Backfill Jobs</h2>
                            <p>Preflight and import activity is retained for transfer checks and audit review.</p>
                        </div>
                    </div>
                    <div className="mapping-issue-table-wrap">
                        <table className="mapping-issue-table">
                            <thead>
                            <tr>
                                <th>Created</th>
                                <th>User</th>
                                <th>Target</th>
                                <th>Mode</th>
                                <th>Status</th>
                                <th>Rows</th>
                                <th>Values</th>
                                <th>Changed</th>
                            </tr>
                            </thead>
                            <tbody>
                            {backfillJobs.map((job) => (
                                <tr key={job.id}>
                                    <td>{new Date(job.created_at).toLocaleString()}</td>
                                    <td>{job.created_by_username || '—'}</td>
                                    <td>{job.server_name} / {job.table_name}</td>
                                    <td>{job.mode}</td>
                                    <td>{job.status}</td>
                                    <td>{job.row_count}</td>
                                    <td>{job.value_count}</td>
                                    <td>{job.inserted_or_updated_count}</td>
                                </tr>
                            ))}
                            {backfillJobs.length === 0 && (
                                <tr><td colSpan="8">No backfill jobs recorded yet.</td></tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            <Modal
                isOpen={isVariableDescModalVisible}
                onRequestClose={() => setIsVariableDescModalVisible(false)}
                contentLabel="Variable Descriptions"
                className="variable-description-modal"
                overlayClassName="metadata-modal-overlay"
            >
                <div className="variable-description-modal-header">
                    <button className="variable-description-close-button"
                            onClick={() => setIsVariableDescModalVisible(false)}>×
                    </button>
                    <h2>Variable Descriptions</h2>
                    <button className="variable-description-save-button" onClick={updateVariableDescriptionList}>Save
                        Changes
                    </button>
                </div>
                <div className="variable-description-modal-body">
                    <table className="variable-description-table">
                        <thead>
                        <tr>
                            <th>Variable Name</th>
                            <th>Description</th>
                        </tr>
                        </thead>
                        <tbody>
                        {variableDescriptionList.map((variable, index) => (
                            <tr key={index}>
                                <td>{variable.display_field_name}</td>
                                <td className={variable.description ? '' : 'empty-description'}>
                                    <input
                                        type="text"
                                        value={variable.description || ''}
                                        onChange={(e) => handleVariableDescChange(index, e.target.value)}
                                    />
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </Modal>

            <Modal
                isOpen={isUnitDescModalVisible}
                onRequestClose={() => setIsUnitDescModalVisible(false)}
                contentLabel="Unit Descriptions"
                className="unit-description-modal"
                overlayClassName="metadata-modal-overlay"
            >
                <div className="unit-description-modal-header">
                    <button className="unit-description-close-button"
                            onClick={() => setIsUnitDescModalVisible(false)}>×
                    </button>
                    <h2>Unit Descriptions</h2>
                    <button className="unit-description-save-button" onClick={updateUnitDescriptionList}>Save Changes
                    </button>
                </div>
                <div className="unit-description-modal-body">
                    <table className="unit-description-table">
                        <thead>
                        <tr>
                            <th>Unit</th>
                            <th>Description</th>
                        </tr>
                        </thead>
                        <tbody>
                        {unitDescriptionList.map((unit, index) => (
                            <tr key={index}>
                                <td>{unit.units}</td>
                                <td className={unit.units_description ? '' : 'empty-description'}>
                                    <input
                                        type="text"
                                        value={unit.units_description || ''}
                                        onChange={(e) => handleUnitDescChange(index, e.target.value)}
                                    />
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            </Modal>

            {/* Filter Modal */}
            <Modal
                isOpen={filterModalIsOpen}
                onRequestClose={() => setFilterModalIsOpen(false)}
                contentLabel="Select Servers for Sankey"
                overlayClassName="sankey-filter-modal-overlay"
                className="sankey-filter-modal"
            >
                <div className="sankey-filter-modal-header">
                    <h2>Select Servers for Sankey Diagram</h2>
                    <button className="sankey-filter-modal-close-button" onClick={() => setFilterModalIsOpen(false)}>×</button>
                </div>
                <div className="sankey-server-selection">
                    {availableDisplayServerNames.map((server) => (
                        <div className="sankey-server-selection-option" key={server}>
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
                <div className="sankey-filter-modal-actions">
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
                    <button className="sankey-modal-close-button" onClick={closeSankeyModal}>×</button>
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
                <div className="sankey-container" style={{overflow: 'auto', width: '100%', height: '100%'}}>
                    {sankeyData ? (
                        <ReactECharts
                            ref={chartRef}
                            option={sankeyOptions}
                            style={{width: `${sankeySize.width}px`, height: `${sankeySize.height}px`}}
                        />
                    ) : (
                        <p>Loading Sankey diagram...</p>
                    )}
                </div>
            </Modal>

            <Modal isOpen={modalIsOpen} onRequestClose={closeModal} contentLabel="Instructions" className="info-modal">
                <div className="info-modal-header">
                    <button className="info-modal-close-button" onClick={closeModal}>×</button>
                    <h2>Unified Mapping Table Instructions</h2>
                </div>
                <p>Welcome to the Unified Mapping Table page. Here’s a step-by-step guide on how to navigate and use
                    this interface:</p>
                <ol>
                    <li>
                        <strong>Filter Data:</strong>
                        <ul>
                            <li>Use the dropdown filters at the top to select the <em>Server</em>, <em>Table</em>,
                                and <em>Field</em> you want to view.
                            </li>
                            <li>Click the <em>Include in Summary</em> checkbox filter to display only the row should be
                                included or not in the summary.
                            </li>
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
                            <li>Fill in the fields in the update section with the new values you wish to apply to the
                                selected row.
                            </li>
                            <li>Click the "Update Selected Row" button to apply your changes. Make sure to verify the
                                changes before updating to avoid any conflicts or duplicate entries.
                            </li>
                        </ul>
                    </li>

                    <li>
                        <strong>Site and Units Mappings:</strong>
                        <ul>
                            <li>Use the <em>Site Mappings</em> and <em>Units Mappings</em> buttons to manage and update
                                site-specific and unit-specific mappings.
                            </li>
                            <li>Within the Units Mappings modal, use the dropdown at the top to select a <em>UZ Phen
                                Name</em> and navigate to that row for editing.
                            </li>
                        </ul>
                    </li>
                </ol>
                <p>If you encounter any errors or issues, an alert message will be displayed with relevant information.
                    Follow the on-screen instructions to resolve the issue or contact support for further
                    assistance.</p>
                <button onClick={closeModal}>Close</button>
            </Modal>

            <Modal isOpen={siteMappingModalIsOpen} onRequestClose={() => setSiteMappingModalIsOpen(false)}
                   contentLabel="Site Mappings" className="site-mapping-modal" overlayClassName="site-mapping-modal-overlay">
                <div className="site-mapping-modal-header">
                    <button className="site-mapping-close-button" onClick={() => setSiteMappingModalIsOpen(false)}>×
                    </button>
	                    <div>
	                        <h2>Site Mappings</h2>
	                        <p>{filteredSiteMappings.length} of {siteMappings.length} site assets shown</p>
                            <div className="site-mapping-status-row">
                                <span>{publicMapLocationCount} public map locations</span>
                                {mappedWithoutPublicDataCount > 0 && (
                                    <span className="site-mapping-status-row--warning">
                                        {mappedWithoutPublicDataCount} mapped without public data
                                    </span>
                                )}
                                {publicDataWithoutMappedLocationCount > 0 && (
                                    <span className="site-mapping-status-row--warning">
                                        {publicDataWithoutMappedLocationCount} public data site missing coordinates
                                    </span>
                                )}
                            </div>
	                    </div>
                    <div className="site-mapping-header-actions">
                        <input
                            type="search"
                            value={siteMappingSearch}
                            placeholder="Search sites, DOI, citation..."
                            onChange={(e) => setSiteMappingSearch(e.target.value)}
                        />
                        <button className="site-mapping-save-button" onClick={updateSiteMappings} disabled={loading}>Save Changes</button>
                    </div>
                </div>
                <div className="site-mapping-card-list">
                    {filteredSiteMappings.map(site => {
                        const imageSrc = site.image?.startsWith('http') ? site.image : `/images/${encodeURIComponent(site.image || '')}`;
                        const isHighlighted = highlightedSiteMappingId === site.site_id;
                        const hasCoordinates = site.latitude && site.longitude;
                        return (
                            <article
                                key={site.site_id}
                                data-site-mapping-id={site.site_id}
                                className={`site-mapping-card ${isHighlighted ? 'site-mapping-card--highlighted' : ''}`}
                            >
                                <div className="site-mapping-card-main">
                                    <div className="site-mapping-card-title">
                                        <span>{site.site_name}</span>
                                        <div>
                                            <small>{hasCoordinates ? 'Coordinates set' : 'Coordinates needed'}</small>
                                            <small>{site.image ? 'Image set' : 'Image needed'}</small>
                                        </div>
                                    </div>
                                    <label>
                                        Display name
                                        <input
                                            type="text"
                                            value={site.display_name || ''}
                                            onChange={(e) => handleSiteMappingChange(site.site_id, 'display_name', e.target.value)}
                                        />
                                    </label>
                                    <div className="site-mapping-field-grid">
                                        <label>
                                            Longitude
                                            <input
                                                type="number"
                                                step="any"
                                                value={site.longitude || ''}
                                                onChange={(e) => handleSiteMappingChange(site.site_id, 'longitude', e.target.value)}
                                            />
                                        </label>
                                        <label>
                                            Latitude
                                            <input
                                                type="number"
                                                step="any"
                                                value={site.latitude || ''}
                                                onChange={(e) => handleSiteMappingChange(site.site_id, 'latitude', e.target.value)}
                                            />
                                        </label>
                                        <label>
                                            Altitude
                                            <input
                                                type="number"
                                                step="any"
                                                value={site.altitude || ''}
                                                onChange={(e) => handleSiteMappingChange(site.site_id, 'altitude', e.target.value)}
                                            />
                                        </label>
                                    </div>
                                    <label>
                                        Description
                                        <textarea
                                            rows="3"
                                            value={site.description || ''}
                                            onChange={(e) => handleSiteMappingChange(site.site_id, 'description', e.target.value)}
                                        />
                                    </label>
                                    <label>
                                        Modal content
                                        <textarea
                                            rows="3"
                                            value={site.modal_content || ''}
                                            onChange={(e) => handleSiteMappingChange(site.site_id, 'modal_content', e.target.value)}
                                        />
                                    </label>
                                </div>
                                <aside className="site-mapping-card-side">
                                    <div className="site-image-editor">
                                        {site.image ? (
                                            <img
                                                key={imageSrc}
                                                src={imageSrc}
                                                alt=""
                                                className="site-image-preview-large"
                                                onLoad={(e) => {
                                                    e.currentTarget.style.display = 'block';
                                                    e.currentTarget.nextElementSibling?.classList.remove('site-image-load-error--visible');
                                                }}
                                                onError={(e) => {
                                                    e.currentTarget.style.display = 'none';
                                                    e.currentTarget.nextElementSibling?.classList.add('site-image-load-error--visible');
                                                }}
                                            />
                                        ) : (
                                            <div className="site-image-placeholder">No image</div>
                                        )}
                                        {site.image && (
                                            <div className="site-image-placeholder site-image-load-error">
                                                Image file not reachable
                                            </div>
                                        )}
                                        <input
                                            type="text"
                                            value={site.image || ''}
                                            placeholder="filename.jpg or https://..."
                                            onChange={(e) => handleSiteMappingChange(site.site_id, 'image', e.target.value)}
                                        />
                                        <label className="site-image-upload-button">
                                            {uploadingSiteId === site.site_id ? 'Uploading...' : 'Upload Image'}
                                            <input
                                                type="file"
                                                accept="image/png,image/jpeg,image/webp,image/gif"
                                                disabled={uploadingSiteId === site.site_id}
                                                onChange={(e) => uploadSiteImage(site.site_id, e.target.files?.[0])}
                                            />
                                        </label>
                                    </div>
                                    <label>
                                        Website URL
                                        <input
                                            type="url"
                                            value={site.website_url || ''}
                                            onChange={(e) => handleSiteMappingChange(site.site_id, 'website_url', e.target.value)}
                                        />
                                    </label>
                                    <label>
                                        Citation
                                        <textarea
                                            rows="2"
                                            value={site.citation || ''}
                                            onChange={(e) => handleSiteMappingChange(site.site_id, 'citation', e.target.value)}
                                        />
                                    </label>
                                    <label>
                                        DOI
                                        <input
                                            type="url"
                                            value={site.doi || ''}
                                            onChange={(e) => handleSiteMappingChange(site.site_id, 'doi', e.target.value)}
                                        />
                                    </label>
                                </aside>
                            </article>
                        );
                    })}
                    {filteredSiteMappings.length === 0 && (
                        <p className="mapping-issue-message">No site mappings match that search.</p>
                    )}
                </div>
            </Modal>

            <Modal isOpen={unitsMappingModalIsOpen} onRequestClose={() => setUnitsMappingModalIsOpen(false)}
                   contentLabel="Units Mappings" className="site-mapping-modal" overlayClassName="site-mapping-modal-overlay">
                <div className="site-mapping-modal-header">
                    <button className="site-mapping-close-button" onClick={() => setUnitsMappingModalIsOpen(false)}>×
                    </button>
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
                                    value={unit.phen_name || ''}
                                    onChange={(e) => handleUnitsMappingChange(unit.id, 'phen_name', e.target.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={unit.phen_name_full || ''}
                                    onChange={(e) => handleUnitsMappingChange(unit.id, 'phen_name_full', e.target.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={unit.phen_type || ''}
                                    onChange={(e) => handleUnitsMappingChange(unit.id, 'phen_type', e.target.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={unit.units || ''}
                                    onChange={(e) => handleUnitsMappingChange(unit.id, 'units', e.target.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={unit.measure || ''}
                                    onChange={(e) => handleUnitsMappingChange(unit.id, 'measure', e.target.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={unit.offset || ''}
                                    onChange={(e) => handleUnitsMappingChange(unit.id, 'offset', e.target.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={unit.var_type || ''}
                                    onChange={(e) => handleUnitsMappingChange(unit.id, 'var_type', e.target.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={unit.uz_units || ''}
                                    onChange={(e) => handleUnitsMappingChange(unit.id, 'uz_units', e.target.value)}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    value={unit.uz_measure || ''}
                                    onChange={(e) => handleUnitsMappingChange(unit.id, 'uz_measure', e.target.value)}
                                />
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </Modal>
            <Modal
                isOpen={errorModalIsOpen}
                onRequestClose={closeErrorModal}
                contentLabel="Error Message"
                className="mapping-message-modal"
                overlayClassName="mapping-message-modal-overlay"
            >
                <div className="mapping-message-modal-header">
                    <div>
                        <span>Error</span>
                        <h2>Something went wrong</h2>
                    </div>
                    <button className="mapping-message-close-button" onClick={closeErrorModal}>×</button>
                </div>
                <p>{errorMessage}</p>
                <div className="mapping-message-actions">
                    <button onClick={closeErrorModal}>Close</button>
                </div>
            </Modal>
            <Modal
                isOpen={alertModalIsOpen}
                onRequestClose={closeAlertModal}
                contentLabel="Alert Message"
                className="mapping-message-modal"
                overlayClassName="mapping-message-modal-overlay"
            >
                <div className="mapping-message-modal-header">
                    <div>
                        <span>{getAlertTone().kicker}</span>
                        <h2>{getAlertTone().title}</h2>
                    </div>
                    <button className="mapping-message-close-button" onClick={closeAlertModal}>×</button>
                </div>
                <pre className="mapping-alert-message">{alertMessage}</pre>
                <div className="mapping-message-actions">
                    <button onClick={closeAlertModal}>Close</button>
                </div>
            </Modal>
            {preflight && (
                <div className={`mapping-preflight-panel ${preflight.ok ? 'mapping-preflight-panel--ok' : 'mapping-preflight-panel--bad'}`}>
                    <strong>{preflight.ok ? 'Selected row is ready to go live.' : 'Selected row is blocked.'}</strong>
                    {preflight.errors?.length > 0 && (
                        <ul>
                            {preflight.errors.map((message) => <li key={message}>{message}</li>)}
                        </ul>
                    )}
                    {preflight.warnings?.length > 0 && (
                        <ul>
                            {preflight.warnings.map((message) => <li key={message}>{message}</li>)}
                        </ul>
                    )}
                </div>
            )}
            <section className="mapping-editor-card">
                <div className="mapping-section-heading">
                    <div>
                        <h2>Selected Row Publisher</h2>
                        <p>{selectedRow ? 'Review and preflight the selected mapping before updating public summary data.' : 'Select a row from the table to edit its public mapping.'}</p>
                    </div>
                </div>
            <div className="update-section">
                <div className="input-group">
                    <label>Display Server Name</label>
                    <input
                        type="text"
                        placeholder="Display Server Name"
                        value={updateValues.displayServerName}
                        onChange={e => setUpdateValues({...updateValues, displayServerName: e.target.value})}
                    />
                </div>
                <div className="input-group">
                    <label>Display Table Name</label>
                    <input
                        type="text"
                        placeholder="Display Table Name"
                        value={updateValues.displayTableName}
                        onChange={e => setUpdateValues({...updateValues, displayTableName: e.target.value})}
                    />
                </div>
                <div className="input-group">
                    <label>Display Field Name</label>
                    <input
                        type="text"
                        placeholder="Display Field Name"
                        value={updateValues.displayFieldName}
                        onChange={e => setUpdateValues({...updateValues, displayFieldName: e.target.value})}
                    />
                </div>
                <div className="input-group">
                    <label>Longitude</label>
                    <input
                        type="text"
                        placeholder="Longitude"
                        value={updateValues.longitude}
                        onChange={e => setUpdateValues({...updateValues, longitude: e.target.value})}
                    />
                </div>
                <div className="input-group">
                    <label>Latitude</label>
                    <input
                        type="text"
                        placeholder="Latitude"
                        value={updateValues.latitude}
                        onChange={e => setUpdateValues({...updateValues, latitude: e.target.value})}
                    />
                </div>
                <div className="input-group">
                    <label>Units</label>
                    <input
                        type="text"
                        placeholder="Units"
                        value={updateValues.units}
                        onChange={e => setUpdateValues({...updateValues, units: e.target.value})}
                    />
                </div>
                <div className="input-group">
                    <label>Multiplier</label>
                    <input
                        type="text"
                        placeholder="Multiplier"
                        value={updateValues.multiplier}
                        onChange={e => setUpdateValues({...updateValues, multiplier: e.target.value})}
                    />
                </div>
                <div className="input-group">
                    <label>Aggregation (minutes)</label>
                    <input
                        type="text"
                        placeholder="Aggregation Type"
                        value={updateValues.aggregationType}
                        onChange={e => setUpdateValues({...updateValues, aggregationType: e.target.value})}
                    />
                </div>
                <div className="input-group">
                    <label>
                        Include in Summary
                        <input
                            type="checkbox"
                            checked={updateValues.includeInSummary}
                            indeterminate={includeInSummaryIndeterminate ? "indeterminate" : ""}
                            onChange={e => setUpdateValues({...updateValues, includeInSummary: e.target.checked})}
                        />
                    </label>
                </div>
                <button className="mapping-primary-button" onClick={handleUpdate} disabled={loading || !selectedRow}>Update Selected Row</button>
	                <button className="mapping-secondary-button" onClick={runPreflight} disabled={loading || !selectedRow}>Run Preflight</button>
	                <button className="mapping-secondary-button" onClick={showDuplicates}>Show Duplicates</button>
	            </div>
	            </section>
	            <section className="mapping-editor-card mapping-bulk-card">
	                <div className="mapping-section-heading">
	                    <div>
	                        <h2>Bulk Publisher</h2>
	                        <p>Apply shared site/table values once while each selected row keeps its own variable name and units.</p>
	                    </div>
	                    <div className="mapping-bulk-actions">
	                        <button type="button" className="mapping-secondary-button" onClick={selectVisibleBulkRows} disabled={loading || data.length === 0}>
	                            Select Visible
	                        </button>
	                        <button type="button" className="mapping-secondary-button" onClick={clearBulkSelection} disabled={loading || selectedBulkRows.length === 0}>
	                            Clear
	                        </button>
	                    </div>
	                </div>
	                <div className="mapping-bulk-status">
	                    <strong>{bulkValues.applyToFilteredRows ? 'Current filter target' : `${selectedBulkRowCount} selected row${selectedBulkRowCount === 1 ? '' : 's'}`}</strong>
	                    <label>
	                        <input
	                            className="mapping-checkbox"
	                            type="checkbox"
	                            checked={bulkValues.applyToFilteredRows}
	                            onChange={e => setBulkValues({...bulkValues, applyToFilteredRows: e.target.checked})}
	                        />
	                        Apply to all active rows matching the current filters
	                    </label>
	                </div>
	                <div className="update-section">
	                    <div className="input-group">
	                        <label>Display Server Name</label>
	                        <input
	                            type="text"
	                            placeholder="Display Server Name"
	                            value={bulkValues.displayServerName}
	                            onChange={e => setBulkValues({...bulkValues, displayServerName: e.target.value})}
	                        />
	                    </div>
	                    <div className="input-group">
	                        <label>Display Table Name</label>
	                        <input
	                            type="text"
	                            placeholder="Display Table Name"
	                            value={bulkValues.displayTableName}
	                            onChange={e => setBulkValues({...bulkValues, displayTableName: e.target.value})}
	                        />
	                    </div>
	                    <div className="input-group">
	                        <label>Longitude</label>
	                        <input
	                            type="text"
	                            placeholder="Longitude"
	                            value={bulkValues.longitude}
	                            onChange={e => setBulkValues({...bulkValues, longitude: e.target.value})}
	                        />
	                    </div>
	                    <div className="input-group">
	                        <label>Latitude</label>
	                        <input
	                            type="text"
	                            placeholder="Latitude"
	                            value={bulkValues.latitude}
	                            onChange={e => setBulkValues({...bulkValues, latitude: e.target.value})}
	                        />
	                    </div>
	                    <div className="input-group">
	                        <label>Multiplier</label>
	                        <input
	                            type="text"
	                            placeholder="Multiplier"
	                            value={bulkValues.multiplier}
	                            onChange={e => setBulkValues({...bulkValues, multiplier: e.target.value})}
	                        />
	                    </div>
	                    <div className="input-group">
	                        <label>Aggregation (minutes)</label>
	                        <input
	                            type="text"
	                            placeholder="Aggregation Type"
	                            value={bulkValues.aggregationType}
	                            onChange={e => setBulkValues({...bulkValues, aggregationType: e.target.value})}
	                        />
	                    </div>
	                    <div className="input-group">
	                        <label>
	                            Include in Summary
	                            <input
	                                type="checkbox"
	                                className="mapping-checkbox"
	                                checked={bulkValues.includeInSummary}
	                                onChange={e => setBulkValues({...bulkValues, includeInSummary: e.target.checked})}
	                            />
	                        </label>
	                    </div>
	                    <button className="mapping-primary-button" onClick={handleBulkApply} disabled={loading || (!bulkValues.applyToFilteredRows && selectedBulkRows.length === 0)}>
	                        Apply Shared Values
	                    </button>
	                </div>
	            </section>
	            <section className="mapping-table-card">
                <div className="mapping-section-heading">
                    <div>
                        <h2>Mapping Rows</h2>
                        <p>Filter raw LoggerNet rows, select one row, then update the public display values above.</p>
                    </div>
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
                <select value={selectedTable} onChange={e => setSelectedTable(e.target.value)}
                        disabled={!selectedServer}>
                    <option value="">Select Table</option>
                    {tableNames.map(table => (
                        <option key={table} value={table}>{table}</option>
                    ))}
                </select>
                <select value={selectedField} onChange={e => setSelectedField(e.target.value)}
                        disabled={!selectedTable}>
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
            <div className="mapping-table-wrap">
	            <table>
	                <thead>
	                <tr>
	                    <th>
	                        <input
	                            type="checkbox"
	                            checked={allVisibleRowsSelected}
	                            onChange={allVisibleRowsSelected ? clearBulkSelection : selectVisibleBulkRows}
	                            aria-label="Select visible mapping rows"
	                        />
	                    </th>
	                    <th>Edit</th>
	                    <th>Current Server Name</th>
                    <th>Current Table Name</th>
                    <th>Current Field Name</th>
                    <th>Display Server Name</th>
                    <th>Display Table Name</th>
                    <th>Display Field Name</th>
                    <th>Longitude</th>
                    <th>Latitude</th>
                    <th>Units</th>
                    <th>Multiplier</th>
                    {/* Add Multiplier header */}
                    <th>Aggregation Type</th>
                    <th>Include in Summary</th>
                </tr>
                </thead>
                <tbody>
                {data.length > 0 ? (
	                    data.map(row => (
	                        <tr key={row.id} className={selectedRow === row.id ? 'selected-mapping-row' : ''}>
	                            <td>
	                                <input
	                                    type="checkbox"
	                                    checked={selectedBulkRows.includes(row.id)}
	                                    onChange={() => toggleBulkRowSelection(row.id)}
	                                    aria-label={`Select ${row.current_server_name} ${row.current_table_name} ${row.current_field_name}`}
	                                />
	                            </td>
	                            <td>
	                                <button type="button" className="mapping-row-button" onClick={() => handleRowSelect(row)}>
	                                    Edit
	                                </button>
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
                            <td>{row.multiplier}</td>
                            {/* Add Multiplier field */}
                            <td>{row.aggregation_type}</td>
                            <td>{row.include_in_summary.toString()}</td>
                        </tr>
                    ))
	                ) : (
	                    <tr>
	                        <td colSpan="14">No data available</td>
	                    </tr>
	                )}
                </tbody>
            </table>
            </div>
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
                <button onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={currentPage === totalPages || loading}>
                    Next
                </button>
            </div>
            </section>
        </div>
    );
};

export default UnifiedMappingTable;
