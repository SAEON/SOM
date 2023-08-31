import React, { useEffect, useState } from 'react';
import './data_table.css'; // Importing a CSS file for styling
import './ScrollableTable.css'; // Importing a CSS file for styling
function Vasi_science_centre_aws_daily() {
    const [data, setData] = useState([]);
    const [showRecent, setShowRecent] = useState(true);
    const [totalCount, setTotalCount] = useState(0);

    const metaData = {
        name: [
            "Time", "WS_ms_S_WVT", "WindDir_D1_WVT", "WindDir_SD1_WVT",
            "WS_ms_Max", "AirTC_Min", "AirTC_Max", "RH_Min", "RH_Max",
            "SlrW_Max", "SlrW_Std", "CUV5_W_Max", "CUV5_W_Std",
            "CUV5_MJ_Tot", "Rain_mm_Tot", "T107_C_Min", "T107_C_Avg", "VW_Avg"
        ],
        units: [
            "", "meters/second", "Deg", "Deg", "meters/second", "Deg C",
            "Deg C", "%", "%", "W/m^2", "W/m^2", "W/m^2", "W/m^2", "MJ/m^2",
            "mm", "Deg C", "Deg C", ""
        ]
    };




    useEffect(() => {
        const fetchURL = showRecent
            ? '/api/get_vasi_science_centre_aws_daily_data?limit=365'
            : '/api/get_vasi_science_centre_aws_daily_data';
        fetch(fetchURL)
            .then(response => response.json())
            .then(data => setData(data)) // The reverse might not be necessary anymore since you are ordering by DESC in the backend now
            .catch(error => console.error('Error fetching data:', error));
    }, [showRecent]);


    const fetchRowCount = () => {
        fetch('/api/get_vasi_science_centre_aws_getdailycount')
            .then(response => response.json())
            .then(count => setTotalCount(count))
            .catch(error => console.error('Error fetching count:', error));
    };

    useEffect(() => {
        // Fetch the row count immediately when the component mounts
        fetchRowCount();
    }, []);

    const displayedData = showRecent ? data.slice(0, 365) : data;

    const handleDownloadCSV = () => {
        window.location.href = '/api/download_vasi_science_centre_aws_dailycsv';
    };

    return (
        <div className="data-table-container">
            <div className="controls-container"> {/* This is the new container */}
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
                    <th style={{backgroundColor: "#c0c0c0","font-weight": "bold"}} rowSpan="3">Time</th>
                    {metaData.name.slice(1).map((header, idx) => (
                        <th style={{backgroundColor: "#c0c0c0","font-weight": "bold"}} key={idx}>{header}</th>

                    ))}
                </tr>
                <tr className="dark-header" style={{ backgroundColor: "#333" }}>
                    {metaData.units.slice(1).map((unit, idx) => (
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
                        <td>{row.ws_ms_max}</td>
                        <td>{row.airtc_min}</td>
                        <td>{row.airtc_max}</td>
                        <td>{row.rh_min}</td>
                        <td>{row.rh_max}</td>
                        <td>{row.slrw_max}</td>
                        <td>{row.slrw_std}</td>
                        <td>{row.cuv5_w_max}</td>
                        <td>{row.cuv5_w_std}</td>
                        <td>{row.cuv5_mj_tot}</td>
                        <td>{row.rain_mm_tot}</td>
                        <td>{row.t107_c_min}</td>
                        <td>{row.t107_c_avg}</td>
                        <td>{row.vw_avg}</td>

                        {/* ... Render other column values as needed ... */}
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}

export default Vasi_science_centre_aws_daily;
