import React, { useState, useEffect } from 'react';
 // import './Lognet_styles.css';
import '../universal.css'

const BASE_URL = "https://proxy.saeon.ac.za/lognet/?command=browsesymbols&uri=";


async function fetchTableData(uri) {
    const url = `${BASE_URL}${encodeURIComponent(uri)}&format=json`;
    try {
        const response = await fetch(url);
        const json_data = await response.json();
        return json_data.symbols;
    } catch (error) {
        console.error('Error fetching table data:', error);
        return [];
    }
}

const LoggerNetExplorer = () => {
    const [data, setData] = useState([]);
    const [uriStack, setUriStack] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            const newData = await fetchTableData(uriStack.length > 0 ? uriStack[uriStack.length - 1] : "Server");
            setData(newData);
        }
        fetchData();
    }, [uriStack]);

    const handleRowClick = (uri) => {
        setUriStack([...uriStack, uri]);
    };

    const handleBackClick = () => {
        if (uriStack.length > 0) {
            const newUriStack = [...uriStack];
            newUriStack.pop();
            setUriStack(newUriStack);
        }
    };

    return (
        <div>
            {uriStack.length > 0 && <button onClick={handleBackClick}>Back</button>}

            <table id="names-table">
                <thead>
                <tr>
                    <th>Site</th>
                    <th>Clock Check</th>
                    <th>Elapsed Time</th>
                    <th>Last Data Collection</th>
                    <th>Next Data Collection</th>
                </tr>
                </thead>
                <tbody>
                {data.map((item, index) => (
                    <tr key={index} onClick={() => item.can_expand && handleRowClick(item.uri)} className={item.can_expand ? 'table-row-clickable' : 'table-row-disabled'}>
                        <td>
                            {item.name}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();  // This prevents the row click handler from being triggered
                                    // Button action goes here
                                }}
                                className="view-data-button">
                                <i className="fa fa-eye" aria-hidden="true" style={{ marginRight: "5px" }}></i>
                                View Data
                            </button>


                        </td>
                        <td>{/* Clock Check data goes here */}</td>
                        <td>{/* Elapsed Time data goes here */}</td>
                        <td>{/* Last Data Collection data goes here */}</td>
                        <td>{/* Next Data Collection data goes here */}</td>
                    </tr>
                ))}
                </tbody>


            </table>
        </div>
    );
}

export default LoggerNetExplorer;
