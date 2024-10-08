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
                <p>This is an example Python script demonstrating how to interact with the API to fetch server information, retrieve tables for a server, get the date range, and download data.</p>

                <h3>Download Script</h3>
                <pre>
        <code>
{`
import requests
from requests.auth import HTTPBasicAuth
import os
from datetime import datetime
import pytz

# API URLs
servers_url = "https://observationsmonitor.saeon.ac.za/api/public/servers"
tables_url = "https://observationsmonitor.saeon.ac.za/api/public/tables"
date_range_url = "https://observationsmonitor.saeon.ac.za/api/public/date-range"
download_url = "https://observationsmonitor.saeon.ac.za/api/public/download"

# User credentials
username = "your_username"
password = "your_password"

# Download directory
download_directory = "/path/to/your/download/directory"
os.makedirs(download_directory, exist_ok=True)

# Headers
headers = {
    "Accept": "application/json"
}

# SAST timezone definition
sast_tz = pytz.timezone("Africa/Johannesburg")

def convert_to_sast(utc_str):
    utc_dt = datetime.strptime(utc_str, "%Y-%m-%dT%H:%M:%S.%fZ")
    utc_dt = pytz.utc.localize(utc_dt)
    sast_dt = utc_dt.astimezone(sast_tz)
    return sast_dt.strftime("%Y-%m-%d %H:%M:%S")

try:
    # Get list of servers
    response = requests.get(servers_url, headers=headers, auth=HTTPBasicAuth(username, password), verify=False)
    if response.status_code == 200:
        servers_data = response.json()
        print("List of available sites:", [server["site_name"] for server in servers_data])
        chosen_site = servers_data[0]["site_name"]

        # Get tables for chosen site
        tables_response = requests.get(tables_url, headers=headers, params={"server": chosen_site}, auth=HTTPBasicAuth(username, password), verify=False)
        if tables_response.status_code == 200:
            tables_data = tables_response.json()
            chosen_table = tables_data[0]["display_table_name"]

            # Get date range for chosen server and table
            date_range_response = requests.get(date_range_url, headers=headers, params={"server": chosen_site, "table": chosen_table}, auth=HTTPBasicAuth(username, password), verify=False)
            if date_range_response.status_code == 200:
                date_range_data = date_range_response.json()
                print(f"Data Range: {convert_to_sast(date_range_data['start_date'])} to {convert_to_sast(date_range_data['end_date'])}")

                # Download data for the table
                download_params = {
                    "tableName": chosen_table,
                    "serverName": chosen_site,
                    "startDate": date_range_data["start_date"],
                    "endDate": date_range_data["end_date"],
                    "consent": "yes"
                }
                download_response = requests.get(download_url, headers=headers, params=download_params, auth=HTTPBasicAuth(username, password), verify=False, stream=True)

                # Save to file
                if download_response.status_code == 200:
                    file_path = os.path.join(download_directory, f"{chosen_table}_{chosen_site}_data.csv")
                    with open(file_path, "wb") as file:
                        for chunk in download_response.iter_content(chunk_size=8192):
                            file.write(chunk)
                    print(f"Downloaded data saved to {file_path}")
                else:
                    print("Failed to download data:", download_response.status_code)
            else:
                print("Failed to fetch date range:", date_range_response.status_code)
        else:
            print("Failed to fetch tables:", tables_response.status_code)
    else:
        print("Failed to fetch servers:", response.status_code)

except Exception as e:
    print(f"An error occurred: {e}")
`}
        </code>
    </pre>
            </section>
        </div>
    );
};

export default ApiReference;
