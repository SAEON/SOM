import React, { useEffect, useState } from 'react';
import './data_table.css'; // Importing a CSS file for styling

function DataTable() {
    const [data, setData] = useState([]);
    const [showRecent, setShowRecent] = useState(true);
    const [totalCount, setTotalCount] = useState(0);

    useEffect(() => {
        const fetchURL = showRecent
            ? 'http://165.227.106.72:3001/gethourly?limit=24'
            : 'http://165.227.106.72:3001/gethourly';

        fetch(fetchURL)
            .then(response => response.json())
            .then(data => setData(data)) // The reverse might not be necessary anymore since you are ordering by DESC in the backend now
            .catch(error => console.error('Error fetching data:', error));
    }, [showRecent]);


    const fetchRowCount = () => {
        fetch('http://165.227.106.72:3001/gethourlycount')
            .then(response => response.json())
            .then(count => setTotalCount(count))
            .catch(error => console.error('Error fetching count:', error));
    };
    useEffect(() => {
        // Fetch the row count immediately when the component mounts
        fetchRowCount();

        // // Set up an interval to refresh the row count every 10 seconds
        // const timer = setInterval(fetchRowCount, 10000);
        //
        // // Clear the interval when the component is unmounted
        // return () => clearInterval(timer);
    }, []);


    const displayedData = showRecent ? data.slice(0, 24) : data;

    const handleDownloadCSV = () => {
        window.location.href = 'http://165.227.106.72:3001/downloadhourlycsv';
    };

    return (
        <div className="data-table-container">
            <div>
                <label>
                    <input
                        type="checkbox"
                        checked={showRecent}
                        onChange={() => setShowRecent(!showRecent)}
                    />
                    Show last 24 entries only (Total rows: {totalCount})
                </label>
            </div>
            <button onClick={handleDownloadCSV}>Download CSV</button>
            <table className="data-table">
                <thead>
                <tr>
                    <th>Time</th>
                    <th>BattV_Min</th>
                    <th>BP_kPa</th>
                    <th>WS_ms_S_WVT</th>
                    <th>WindDir_D1_WVT</th>
                    <th>WindDir_SD1_WVT</th>
                    <th>AirTC_Avg</th>
                    <th>RH</th>
                    <th>SlrW_Avg</th>
                    <th>CUV5_W_Avg</th>
                    <th>Rain_mm_Tot</th>
                    <th>T107_C_Min</th>
                    <th>T107_C_Avg</th>
                    <th>VW_Avg</th>
                    {/* ... Add other columns as needed ... */}
                </tr>
                </thead>
                <tbody>
                {displayedData.map(row => (
                    <tr key={row.id}>
                        <td>{row.time}</td>
                        <td>{row.battv_min}</td>
                        <td>{row.bp_kpa}</td>
                        <td>{row.ws_ms_s_wvt}</td>
                        <td>{row.winddir_d1_wvt}</td>
                        <td>{row.winddir_sd1_wvt}</td>
                        <td>{row.airtc_avg}</td>
                        <td>{row.rh}</td>
                        <td>{row.slrw_avg}</td>
                        <td>{row.cuv5_w_avg}</td>
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

export default DataTable;
