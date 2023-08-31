import React, { useEffect, useState } from 'react';
import './data_table.css';
import './ScrollableTable.css';

function DataTable({data, metaData}) {
    return (
        <table className="data-table">
            <thead>
            <tr className="dark-header">
                {metaData.name.map((header, idx) => (
                    <th style={{backgroundColor: "#c0c0c0","font-weight": "bold"}} key={idx}>{header}</th>
                ))}
            </tr>
            <tr className="dark-header" style={{ backgroundColor: "#333" }}>
                {metaData.units.map((unit, idx) => (
                    <th style={{backgroundColor: "#c0c0c0","font-weight": "bold"}} key={idx}>{unit}</th>
                ))}
            </tr>
            </thead>
            <tbody>
            {data.map(row => <DataRow key={row.id} row={row} />)}
            </tbody>
        </table>
    );
}

function DataRow({row}) {
    return (
        <tr>
            {Object.values(row).map((value, idx) => (
                <td key={idx}>{value}</td>
            ))}
        </tr>
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
    const [metaData, setMetaData] = useState({name: [], units: []});
    const [showRecent, setShowRecent] = useState(true);
    const [totalCount, setTotalCount] = useState(0);

    const fetchData = () => {
        const fetchURL = showRecent
            ? `${dataEndpoint}?limit=365`
            : dataEndpoint;
        fetch(fetchURL)
            .then(response => response.json())
            .then(fetchedData => {
                if(type === 'battv'){
                    const battvData = fetchedData.map(row => ({
                        time: row.time, // assuming the column is named 'time'
                        battv: row.battv
                    }));
                    setData(battvData);
                } else {
                    setData(fetchedData);
                }
            })
            .catch(error => console.error('Error fetching data:', error));
    }

    useEffect(() => {
        fetchData();
    }, [showRecent, dataEndpoint]);

    useEffect(() => {
        fetch(metadataEndpoint)
            .then(response => response.json())
            .then(data => setMetaData(data))
            .catch(error => console.error('Error fetching metadata:', error));
    }, [metadataEndpoint]);

    const fetchRowCount = () => {
        fetch(countEndpoint)
            .then(response => response.json())
            .then(count => setTotalCount(count))
            .catch(error => console.error('Error fetching count:', error));
    };

    useEffect(() => {
        fetchRowCount();
    }, [countEndpoint]);

    const displayedData = showRecent ? data.slice(0, 365) : data;

    const handleDownloadCSV = () => {
        window.location.href = csvDownloadEndpoint;
    };

    return (
        <div className="data-table-container">
            <div className="controls-container">
                <label className="checkbox-container">
                    <input
                        type="checkbox"
                        checked={showRecent}
                        onChange={() => setShowRecent(!showRecent)}
                    />
                    Show last 365 entries only (Total rows: {totalCount})
                </label>
                <button className="download-csv-button" onClick={handleDownloadCSV}>
                    <i className="fa fa-download" aria-hidden="true" style={{ marginRight: "5px" }}></i>
                    Download CSV
                </button>
            </div>
            <DataTable data={displayedData} metaData={metaData} />
        </div>
    );
}

export default GenericData;



