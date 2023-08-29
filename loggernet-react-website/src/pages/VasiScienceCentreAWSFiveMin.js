import React, { useEffect, useState } from 'react';
import './data_table.css'; // Importing a CSS file for styling
import './ScrollableTable.css';

function VasiScienceCentreAWSFiveMin() {
    const [data, setData] = useState([]);
    const [showRecent, setShowRecent] = useState(true);
    const [totalCount, setTotalCount] = useState(0);

    const metaData = {
        name: [
            "Time", "WS_ms_S_WVT", "WindDir_D1_WVT", "WindDir_SD1_WVT", "AirTC_Avg",
            "RH", "SlrW_Avg", "CUV5_W_Avg", "Rain_mm_Tot", "T107_C_Avg"
        ],
        units: [
            "", "meters/second", "Deg", "Deg", "Deg C", "%", "W/m^2", "W/m^2", "mm", "Deg C"
        ]
    };

    useEffect(() => {
        const fetchURL = showRecent
            ? '/api/get_vasi_science_centre_aws_five_min_data?limit=365'
            : '/api/get_vasi_science_centre_aws_five_min_data';
        fetch(fetchURL)
            .then(response => response.json())
            .then(data => setData(data))
            .catch(error => console.error('Error fetching data:', error));
    }, [showRecent]);

    const fetchRowCount = () => {
        fetch('/api/get_vasi_science_centre_aws_getfivemincount')
            .then(response => response.json())
            .then(count => setTotalCount(count))
            .catch(error => console.error('Error fetching count:', error));
    };

    useEffect(() => {
        fetchRowCount();
    }, []);

    const displayedData = showRecent ? data.slice(0, 365) : data;

    const handleDownloadCSV = () => {
        window.location.href = '/api/download_vasi_science_centre_aws_five_mincsv';
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
                {displayedData.map(row => (
                    <tr key={row.id}>
                        <td>{row.time}</td>
                        <td>{row.ws_ms_s_wvt}</td>
                        <td>{row.winddir_d1_wvt}</td>
                        <td>{row.winddir_sd1_wvt}</td>
                        <td>{row.airtc_avg}</td>
                        <td>{row.rh}</td>
                        <td>{row.slrw_avg}</td>
                        <td>{row.cuv5_w_avg}</td>
                        <td>{row.rain_mm_tot}</td>
                        <td>{row.t107_c_avg}</td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}

export default VasiScienceCentreAWSFiveMin;
