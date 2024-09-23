import React, { useEffect, useState } from "react";
import './ApiReference.css'; // Custom styling
import {logInteraction} from "../utils/logInteraction";


const ApiReference = ({ user }) => {

    useEffect(() => {// Log the interaction whether the user is logged in or not
        logInteraction('page_view', { viewport: { width: window.innerWidth, height: window.innerHeight } }, user);
    }, [user]);


    return (
        <div className="api-reference-container">
            <h1>API Reference</h1>

            {/* API Overview */}
            <section>
                <h2>Overview</h2>
                <p>
                    This public API provides access to server (site) and table data through several endpoints. Authentication is required via a username and password, and all responses are in JSON format.
                </p>
                <p>
                    Below is a list of available API endpoints, methods, and example requests.
                </p>
            </section>

            {/* Methods Overview */}
            <section className="method-overview">
                <h2>Methods Overview</h2>
                <table className="api-method-table">
                    <thead>
                    <tr>
                        <th>Endpoint</th>
                        <th>Method</th>
                        <th>Description</th>
                    </tr>
                    </thead>
                    <tbody>
                    <tr>
                        <td>/api/public/servers</td>
                        <td>GET</td>
                        <td>Retrieves a list of available servers (sites).</td>
                    </tr>
                    <tr>
                        <td>/api/public/tables</td>
                        <td>GET</td>
                        <td>Retrieves a list of available tables for a specific server.</td>
                    </tr>
                    <tr>
                        <td>/api/public/date-range</td>
                        <td>GET</td>
                        <td>Returns the start and end date of data for a specific table.</td>
                    </tr>
                    <tr>
                        <td>/api/public/download</td>
                        <td>GET</td>
                        <td>Downloads data from a specific table for a given date range.</td>
                    </tr>
                    </tbody>
                </table>
            </section>

            {/* Get Available Servers API */}
            <section>
                <h2>Get Available Servers (Sites)</h2>
                <p><strong>Base URL:</strong> <code>https://observationsmonitor.saeon.ac.za/api/public/servers</code></p>
                <p>This endpoint returns a list of available servers (sites) in the LoggerNet system.</p>
                <h3>Example Request</h3>
                <pre>
                    <code>
                        curl -k -X GET "https://observationsmonitor.saeon.ac.za/api/public/servers" \
                        -H "Accept: application/json" \
                        -u "username:password"
                    </code>
                </pre>
                <h3>Response</h3>
                <pre>
                    <code>
{`[
    { "site_name": "Bambanani AWS" },
    { "site_name": "Besemfontein AWS" },
    { "site_name": "Constantiaberg AWS" },
    ...
]`}
                    </code>
                </pre>
            </section>

            {/* Get Tables for a Selected Server */}
            <section>
                <h2>Get Tables for a Selected Server</h2>
                <p><strong>Base URL:</strong> <code>https://observationsmonitor.saeon.ac.za/api/public/tables</code></p>
                <p>Retrieve a list of available tables for a specific server.</p>
                <h3>Parameters</h3>
                <ul>
                    <li><strong>server</strong>: The server (site) name (e.g., <code>Bambanani AWS</code>).</li>
                </ul>
                <h3>Example Request</h3>
                <pre>
                    <code>
                        curl -k -X GET "https://observationsmonitor.saeon.ac.za/api/public/tables?server=Bambanani AWS" \
                        -H "Accept: application/json" \
                        -u "username:password"
                    </code>
                </pre>
                <h3>Response</h3>
                <pre>
                    <code>
{`[
    { "table_name": "weather_data" },
    { "table_name": "climate_data" },
    ...
]`}
                    </code>
                </pre>
            </section>

            {/* Get Data Range for a Table */}
            <section>
                <h2>Get Data Range for a Table</h2>
                <p><strong>Base URL:</strong> <code>https://observationsmonitor.saeon.ac.za/api/public/date-range</code></p>
                <p>Returns the start and end dates for the data in a specific table, as well as any missing dates.</p>
                <h3>Parameters</h3>
                <ul>
                    <li><strong>server</strong>: The server (site) name.</li>
                    <li><strong>table</strong>: The table name.</li>
                </ul>
                <h3>Example Request</h3>
                <pre>
                    <code>
                        curl -k -X GET "https://observationsmonitor.saeon.ac.za/api/public/date-range?server=Bambanani AWS&table=weather_data" \
                        -H "Accept: application/json" \
                        -u "username:password"
                    </code>
                </pre>
                <h3>Response</h3>
                <pre>
                    <code>
{`{
    "start_date": "2023-06-20",
    "end_date": "2024-09-18",
    "missing_dates": ["2023-08-15", "2023-08-16", ...]
}`}
                    </code>
                </pre>
            </section>

            {/* Download Data API */}
            <section>
                <h2>Download Data</h2>
                <p><strong>Base URL:</strong> <code>https://observationsmonitor.saeon.ac.za/api/public/download</code></p>
                <p>This endpoint allows you to download data for a specific table from a selected server.</p>
                <h3>Process</h3>
                <p>
                    The system will first attempt to stream a pre-generated CSV file for the requested table and server.
                    If the pre-generated CSV is unavailable, you will need to provide a date range, and the system will dynamically generate the CSV file on the fly.
                </p>
                <h3>Parameters</h3>
                <ul>
                    <li><strong>serverName</strong>: The name of the server.</li>
                    <li><strong>tableName</strong>: The name of the table.</li>
                    <li><strong>startDate</strong> (optional): The start date for the data range, required if the pre-generated file does not exist.</li>
                    <li><strong>endDate</strong> (optional): The end date for the data range, required if the pre-generated file does not exist.</li>
                    <li><strong>consent</strong>: The user’s consent to download the data. Must be set to <code>yes</code>.</li>
                </ul>
                <h3>Example Request</h3>
                <pre>
        <code>
            curl -k -X GET "https://observationsmonitor.saeon.ac.za/api/public/download?serverName=Bambanani AWS&tableName=weather_data&consent=yes" \
            -H "Accept: application/json" \
            -u "username:password"
        </code>
    </pre>
                <h3>Fallback with Date Range Example Request</h3>
                <p>If the pre-generated file does not exist, you will need to include the date range:</p>
                <pre>
        <code>
            curl -k -X GET "https://observationsmonitor.saeon.ac.za/api/public/download?serverName=Bambanani AWS&tableName=weather_data&startDate=2023-06-20&endDate=2024-09-18&consent=yes" \
            -H "Accept: application/json" \
            -u "username:password"
        </code>
    </pre>
                <h3>Response</h3>
                <p>The requested data is returned as a downloadable CSV file.</p>
            </section>

            {/* Python Example */}
            <section>
                <h2>Python Example</h2>
                <p>coming soon...</p>
            </section>
        </div>
    );
};

export default ApiReference;
