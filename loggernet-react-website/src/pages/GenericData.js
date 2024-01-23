import React, { useEffect, useState } from 'react';
import ReactEcharts from 'echarts-for-react';
import './data_table.css';
import './ScrollableTable.css';


function PlotModal({ show, onClose, option, currentPage, setCurrentPage, pageSize, setPageSize }) {
    if (!show) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <button className="close-button" onClick={onClose}>
                    <i className="fa fa-times" aria-hidden="true"></i>
                </button>
                <PaginationControls
                    currentPage={currentPage}
                    setCurrentPage={setCurrentPage}
                    pageSize={pageSize}
                    setPageSize={setPageSize}
                />
                <ReactEcharts
                    option={option}
                    style={{ height: '400px', width: '100%' }}
                />
            </div>
        </div>
    );
}






function DataTable({ data, metaData }) {
    return (
        <table className="data-table">
            <thead>
            <tr className="dark-header">
                {metaData.name.map((header, idx) => (
                    <th key={idx} style={{ backgroundColor: "#c0c0c0", fontWeight: "bold" }}>{header}</th>
                ))}
            </tr>
            <tr className="dark-header" style={{ backgroundColor: "#333" }}>
                {metaData.units.map((unit, idx) => (
                    <th key={idx} style={{ backgroundColor: "#c0c0c0", fontWeight: "bold" }}>{unit}</th>
                ))}
            </tr>
            </thead>
            <tbody>
            {data.map(row => <DataRow key={row.id} row={row} />)}
            </tbody>
        </table>
    );
}

function DataRow({ row }) {
    return (
        <tr>
            {Object.entries(row).map(([key, value], idx) => {
                if (key === 'time') { // Assuming 'time' is the field with the date
                    value = value.replace('Z', ''); // Remove 'Z'
                }
                return <td key={idx}>{value}</td>;
            })}
        </tr>
    );
}

function toPostgreSQLColumnName(userSelectedColumn) {
    // Convert to lowercase and replace spaces with underscores
    return userSelectedColumn.toLowerCase().replace(/ /g, '_');
}
function PaginationControls({ currentPage, setCurrentPage, pageSize, setPageSize }) {
    return (
        <div className="pagination-container">
            <label>Page: </label>
            <input
                type="number"
                value={currentPage}
                onChange={(e) => setCurrentPage(Math.max(1, e.target.value))}
                min={1}
                style={{ width: "50px" }}
            />
            <label> Page Size: </label>
            <select
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value)}
            >
                {Array.from({length: 20}, (_, i) => i * 100 + 100).map(num => (
                    <option key={num} value={num}>{num}</option>
                ))}
            </select>
        </div>
    );
}

function GenericData({
                         dataEndpoint,
                         metadataEndpoint,
                         countEndpoint,
                         csvDownloadEndpoint,
                         type
                     }) {
    const [data, setData] = useState([]);
    const [metaData, setMetaData] = useState({ name: [], units: [] });
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [totalCount, setTotalCount] = useState(0);
    const [showModal, setShowModal] = useState(false);  // State to control modal visibility
    const [plotData, setPlotData] = useState([]);
    const [selectedColumn, setSelectedColumn] = useState("");
    const [chartKey, setChartKey] = useState(Date.now()); // set initial key
    const [currentPage, setCurrentPage] = useState(1); // State for current page
    const [pageSize, setPageSize] = useState(100); // State for page size


    useEffect(() => {
        // Modified the fetch to include pagination parameters
        const fetchURL = `${dataEndpoint}?limit=${pageSize}&offset=${(currentPage - 1) * pageSize}`;

        fetch(fetchURL)
            .then(response => response.json())
            .then(fetchedData => setData(fetchedData))
            .catch(error => console.error('Error fetching data:', error));
    }, [dataEndpoint, type, currentPage, pageSize]); // Added currentPage and pageSize as dependencies

    useEffect(() => {
        // Fetch metadata
        fetch(metadataEndpoint)
            .then(response => response.json())
            .then(metadata => setMetaData(metadata))
            .catch(error => console.error('Error fetching metadata:', error));
    }, [metadataEndpoint, type]);

    useEffect(() => {
        // Fetch total count
        fetch(countEndpoint)
            .then(response => response.json())
            .then(count => setTotalCount(count))
            .catch(error => console.error('Error fetching count:', error));
    }, [countEndpoint, type]);

    useEffect(() => {
        fetch(dataEndpoint + '/daterange')
            .then(response => response.json())
            .then(rangeData => {
                if (rangeData.earliest && rangeData.latest) {
                    // Format the date-time string to remove potential milliseconds or the "Z" timezone specifier
                    const earliestDate = rangeData.earliest.split('.')[0];
                    const latestDate = rangeData.latest.split('.')[0];

                    setStartDate(earliestDate);
                    setEndDate(latestDate);
                }
            })
            .catch(error => console.error('Error fetching date range:', error));
    }, [dataEndpoint]);

    useEffect(() => {
        setChartKey(Date.now()); // update the key every time plotData changes
    }, [plotData]);


    const handleDownload = () => {
        let downloadURL = csvDownloadEndpoint;

        if (startDate && endDate) {
            // Format the startDate and endDate to remove the 'Z'
            const formattedStartDate = startDate.replace('Z', '');
            const formattedEndDate = endDate.replace('Z', '');

            downloadURL += `?startDate=${formattedStartDate}&endDate=${formattedEndDate}`;
        }

        window.location.href = downloadURL;
    };






    const fetchDataForPlot = () => {
        let fetchURL = `${dataEndpoint}?limit=${pageSize}&offset=${(currentPage - 1) * pageSize}`;

        if (startDate && endDate) {
            fetchURL += `&startDate=${startDate}&endDate=${endDate}`;
        }

        fetch(fetchURL)
            .then(response => response.json())
            .then(fetchedData => {
                setPlotData(fetchedData);
            })
            .catch(error => console.error('Error fetching data for plot:', error));
    }
    const handlePlot = () => {
        if (!selectedColumn) {
            alert("Please select a column to plot.");
            return;
        }

        fetchDataForPlot();
        setShowModal(true);
    };
    useEffect(() => {
        if (showModal) {
            fetchDataForPlot();
        }
    }, [currentPage, pageSize]);

    const closeModal = () => setShowModal(false);

    const getOption = () => {
        if (!selectedColumn || !plotData.length) return {};

        const actualColumnName = toPostgreSQLColumnName(selectedColumn);
        const yAxisData = plotData.map(d => parseFloat(d[actualColumnName]));
        const minYValue = Math.min(...yAxisData) * 0.95; // 5% buffer below the smallest data point
        const maxYValue = Math.max(...yAxisData) * 1.05; // 5% buffer above the largest data point

        return {
            tooltip: {
                trigger: 'axis',
                axisPointer: {
                    type: 'cross',
                    label: {
                        backgroundColor: '#6a7985'
                    }
                }
            },
            xAxis: {
                type: 'category',
                data: plotData.map(d => {
                    let dateStr = d.time.replace('Z', ''); // Remove 'Z' from the date string
                    let dateObj = new Date(dateStr);
                    return isNaN(dateObj.getTime()) ? dateStr : dateObj.toLocaleString();
                }),
                inverse: true,
                axisLabel: {
                    rotate: 45
                }
            },

            yAxis: {
                type: 'value',
                min: minYValue,
                max: maxYValue
            },
            grid: {
                left: '10%',
                right: '10%',
                bottom: '15%',
                containLabel: true
            },
            series: [{
                data: yAxisData,
                type: 'line',
                name: selectedColumn,
                markPoint: {
                    data: [
                        { type: 'max', name: 'Max' },
                        { type: 'min', name: 'Min' }
                    ]
                },
                markLine: {
                    data: [
                        { type: 'average', name: 'Average' }
                    ]
                }
            }]
        };
    };


    return (
        <div className="data-table-container">
            <div className="controls-container">
                <div className="date-range-container">
                    <input
                        type="datetime-local"
                        value={startDate || ""}
                        onChange={(e) => setStartDate(e.target.value)}
                    />
                    <span> to </span>
                    <input
                        type="datetime-local"
                        value={endDate || ""}
                        onChange={(e) => setEndDate(e.target.value)}
                    />
                    <button className="styled-button" onClick={handleDownload}>Download Filtered Data</button>
                </div>
                <div className="plot-options-container">
                    <label>Choose column to plot:</label>
                    <select value={selectedColumn} onChange={(e) => setSelectedColumn(e.target.value)}>
                        <option value="" disabled>Select column</option>
                        {metaData.name.map((column, idx) => (
                            <option key={idx} value={column}>{column}</option>
                        ))}
                    </select>
                    <button className="styled-button" onClick={handlePlot}>Plot Column</button>
                </div>
                {/* Pagination Controls */}
                <div className="pagination-container">
                    <label>Page: </label>
                    <input
                        type="number"
                        value={currentPage}
                        onChange={(e) => setCurrentPage(Math.max(1, e.target.value))}
                        min={1}
                        style={{ width: "50px" }}
                    />
                    <label> Page Size: </label>
                    <select
                        value={pageSize}
                        onChange={(e) => setPageSize(e.target.value)}
                    >
                        {Array.from({length: 20}, (_, i) => i * 100 + 100).map(num => (
                            <option key={num} value={num}>{num}</option>
                        ))}
                    </select>
                </div>

                {/* Show Last 100 Entries Control */}
                <div className="options-container">
                    <label className="checkbox-container">
                        Show last 100 entries only (Total rows: {totalCount})
                    </label>
                </div>
            </div>

            {/* Data Table */}
            <DataTable data={data} metaData={metaData} />
            <PlotModal
                show={showModal}
                onClose={closeModal}
                option={getOption()}
                currentPage={currentPage}
                setCurrentPage={setCurrentPage}
                pageSize={pageSize}
                setPageSize={setPageSize}
            />
        </div>
    );
}

export default GenericData;
