import React, {useEffect, useMemo, useState} from "react";
import axios from "axios";
import './ApiReference.css';
import {logInteraction} from "../utils/logInteraction";

const BASE_URL = "https://observationsmonitor.saeon.ac.za";
const LOCAL_URL = "http://localhost:3081";

const authCurl = (baseUrl, path) => `curl -u "your-username:your-password" "${baseUrl}${path}"`;
const publicCurl = (baseUrl, path) => `curl "${baseUrl}${path}"`;
const downloadCurl = (baseUrl, path) => `curl -L -u "your-username:your-password" -o saeon-data.csv "${baseUrl}${path}"`;

const endpoints = [
    {
        method: "GET",
        path: "/api/v1/status",
        title: "API status",
        description: "Lightweight health check used by the site and external monitors.",
        params: [],
        access: "Public",
        localExample: publicCurl(LOCAL_URL, "/api/v1/status"),
        liveExample: publicCurl(BASE_URL, "/api/v1/status"),
    },
    {
        method: "GET",
        path: "/api/v1/sites",
        title: "List public sites",
        description: "Returns public site names that have mapped data in the Data tab, plus a next link for table lookup.",
        params: [],
        access: "Login required",
        localExample: authCurl(LOCAL_URL, "/api/v1/sites"),
        liveExample: authCurl(BASE_URL, "/api/v1/sites"),
    },
    {
        method: "GET",
        path: "/api/v1/tables",
        title: "List tables for a site",
        description: "Returns public tables and date-range metadata for one site, plus a next link for the first date-range lookup.",
        params: ["serverName"],
        access: "Login required",
        localExample: authCurl(LOCAL_URL, "/api/v1/tables?serverName=Benfontein%20AWS"),
        liveExample: authCurl(BASE_URL, "/api/v1/tables?serverName=Benfontein%20AWS"),
    },
    {
        method: "GET",
        path: "/api/v1/date-range",
        title: "Get table date range",
        description: "Returns the available date range and public row count for one site-table dataset, plus example JSON and CSV links.",
        params: ["serverName", "tableName"],
        access: "Login required",
        localExample: authCurl(LOCAL_URL, "/api/v1/date-range?serverName=Benfontein%20AWS&tableName=5%20minute"),
        liveExample: authCurl(BASE_URL, "/api/v1/date-range?serverName=Benfontein%20AWS&tableName=5%20minute"),
    },
    {
        method: "GET",
        path: "/api/v1/data",
        title: "Read data as JSON",
        description: "Returns paginated JSON rows for one site-table dataset and bounded date window. Use next for the following page.",
        params: ["serverName", "tableName", "startDate", "endDate", "limit", "after"],
        access: "Login required",
        localExample: authCurl(LOCAL_URL, "/api/v1/data?serverName=Benfontein%20AWS&tableName=5%20minute&startDate=2026-08-13&endDate=2026-08-13&limit=1000"),
        liveExample: authCurl(BASE_URL, "/api/v1/data?serverName=Benfontein%20AWS&tableName=5%20minute&startDate=2026-08-13&endDate=2026-08-13&limit=1000"),
    },
    {
        method: "GET",
        path: "/api/v1/download",
        title: "Download CSV",
        description: "Streams CSV export data for one site-table dataset. Use this for files; use /api/v1/data for script-friendly JSON.",
        params: ["serverName", "tableName", "startDate", "endDate"],
        access: "Login required",
        localExample: downloadCurl(LOCAL_URL, "/api/v1/download?serverName=Benfontein%20AWS&tableName=5%20minute&startDate=2026-08-01&endDate=2026-08-13"),
        liveExample: downloadCurl(BASE_URL, "/api/v1/download?serverName=Benfontein%20AWS&tableName=5%20minute&startDate=2026-08-01&endDate=2026-08-13"),
    },
    {
        method: "GET",
        path: "/api/public/monitoring/highlights",
        title: "Monitoring highlights",
        description: "Aggregate public counts for archive size, live sites, dataset coverage, and sync timestamps.",
        params: [],
        access: "Public aggregate",
        localExample: publicCurl(LOCAL_URL, "/api/public/monitoring/highlights"),
        liveExample: publicCurl(BASE_URL, "/api/public/monitoring/highlights"),
    },
    {
        method: "GET",
        path: "/api/public/analytics/highlights",
        title: "Usage highlights",
        description: "Aggregate usage counts for public display. No person-level analytics are returned.",
        params: ["year"],
        access: "Public aggregate",
        localExample: publicCurl(LOCAL_URL, "/api/public/analytics/highlights?year=2026"),
        liveExample: publicCurl(BASE_URL, "/api/public/analytics/highlights?year=2026"),
    },
];

const pythonExample = `import requests

BASE_URL = "https://observationsmonitor.saeon.ac.za"
USERNAME = "your-username"
PASSWORD = "your-password"

session = requests.Session()
login = session.post(
    f"{BASE_URL}/api/login",
    json={"username": USERNAME, "password": PASSWORD},
    timeout=30,
)
login.raise_for_status()

sites = session.get(f"{BASE_URL}/api/v1/sites", timeout=30).json()["items"]
site = sites[0]["site_name"]

tables = session.get(
    f"{BASE_URL}/api/v1/tables",
    params={"serverName": site},
    timeout=30,
).json()["items"]
table = tables[0]["table_name"]

date_range = session.get(
    f"{BASE_URL}/api/v1/date-range",
    params={"serverName": site, "tableName": table},
    timeout=30,
).json()

params = {
    "serverName": site,
    "tableName": table,
    "startDate": date_range["endDate"],
    "endDate": date_range["endDate"],
    "limit": 1000,
}

page = session.get(f"{BASE_URL}/api/v1/data", params=params, timeout=60).json()
for row in page["items"]:
    print(row["timestampSast"], row["values"])

while page.get("next"):
    page = session.get(f"{BASE_URL}{page['next']}", timeout=60).json()
    for row in page["items"]:
        print(row["timestampSast"], row["values"])
`;

const pythonFullSeriesExample = `import requests
from datetime import date, timedelta
from calendar import monthrange

BASE_URL = "https://observationsmonitor.saeon.ac.za"
USERNAME = "your-username"
PASSWORD = "your-password"
SITE = "Benfontein AWS"
TABLE = "5 minute"

def parse_day(value):
    return date.fromisoformat(value[:10])

def month_windows(start_day, end_day):
    current = date(start_day.year, start_day.month, 1)
    while current <= end_day:
        last_day = date(current.year, current.month, monthrange(current.year, current.month)[1])
        yield max(current, start_day), min(last_day, end_day)
        current = last_day + timedelta(days=1)

session = requests.Session()
session.auth = (USERNAME, PASSWORD)

date_range = session.get(
    f"{BASE_URL}/api/v1/date-range",
    params={"serverName": SITE, "tableName": TABLE},
    timeout=30,
).json()

start_day = parse_day(date_range["startDate"])
end_day = parse_day(date_range["endDate"])

for window_start, window_end in month_windows(start_day, end_day):
    params = {
        "serverName": SITE,
        "tableName": TABLE,
        "startDate": window_start.isoformat(),
        "endDate": window_end.isoformat(),
        "limit": 5000,
    }
    next_url = f"{BASE_URL}/api/v1/data"
    page_number = 1
    while next_url:
        page = session.get(next_url, params=params, timeout=60).json()
        print(window_start, window_end, "page", page_number, "rows", page["count"])
        for row in page["items"]:
            # Store/process row["timestampSast"] and row["values"] here.
            pass
        next_url = f"{BASE_URL}{page['next']}" if page.get("next") else None
        params = None
        page_number += 1
`;

const curlLoginExample = `# Local cookie login
curl -c saeon-api.local.cookies \\
  -H "Content-Type: application/json" \\
  -d '{"username":"your-username","password":"your-password"}' \\
  "${LOCAL_URL}/api/login"

curl -b saeon-api.local.cookies "${LOCAL_URL}/api/v1/sites"

# Live cookie login
curl -c saeon-api.live.cookies \\
  -H "Content-Type: application/json" \\
  -d '{"username":"your-username","password":"your-password"}' \\
  "${BASE_URL}/api/login"

curl -b saeon-api.live.cookies "${BASE_URL}/api/v1/sites"

# Or, for one-off script calls over HTTPS:
curl -u "your-username:your-password" "${BASE_URL}/api/v1/sites"`;

const ApiReference = ({user}) => {
    const [status, setStatus] = useState(null);
    const [statusError, setStatusError] = useState(null);

    const localBaseUrl = useMemo(() => window.location.origin, []);

    useEffect(() => {
        logInteraction('page_view', {viewport: {width: window.innerWidth, height: window.innerHeight}}, user);
    }, [user]);

    useEffect(() => {
        axios.get('/api/public/site-status', {timeout: 8000})
            .then((res) => {
                setStatus(res.data);
                setStatusError(null);
            })
            .catch((error) => {
                setStatus(null);
                setStatusError(error?.message || 'Unable to reach the public API.');
            });
    }, []);

    return (
        <main className="api-reference-page">
            <section className="api-reference-hero">
                <div>
                    <p className="api-reference-kicker">Public API</p>
                    <h1>SAEON observations monitor API</h1>
                    <p>
                        Programmatic access to public site lists, table metadata, date ranges, monitoring summaries,
                        and paginated JSON data. CSV remains available for explicit export/download workflows.
                    </p>
                </div>
                <div className={`api-status-card ${status?.active ? 'api-status-card--ok' : ''}`}>
                    <span>Current status</span>
                    <strong>{status?.active ? 'Online' : statusError ? 'Unavailable' : 'Checking...'}</strong>
                    <small>{status?.message || statusError || 'Testing the public API endpoint.'}</small>
                </div>
            </section>

            <section className="api-reference-grid">
                <article className="api-reference-panel">
                    <h2>Access rules</h2>
                    <ul>
                        <li>Dataset API endpoints require login so usage can be linked to a known account.</li>
                        <li>Status and aggregate homepage summary endpoints remain public because they do not expose dataset rows.</li>
                        <li>List and metadata endpoints are cached for short periods to protect the server.</li>
                        <li>JSON data pages and CSV exports are limited to 31 days per request.</li>
                        <li>Full site-table time series should be read as monthly JSON windows using the date range endpoint.</li>
                        <li>The website keeps CSV downloads for people who need spreadsheet files; scripts should usually use JSON.</li>
                        <li>Usage is rate-limited and recorded with account, endpoint, status, and session metadata for reporting.</li>
                    </ul>
                </article>

                <article className="api-reference-panel">
                    <h2>Rate limits</h2>
                    <dl className="api-rate-list">
                        <div>
                            <dt>General public API</dt>
                            <dd>240 requests per minute per account or IP</dd>
                        </div>
                        <div>
                            <dt>JSON data pages</dt>
                            <dd>60 requests per minute per account or IP</dd>
                        </div>
                        <div>
                            <dt>CSV downloads</dt>
                            <dd>3 download starts per 10 minutes per account or IP</dd>
                        </div>
                    </dl>
                    <p className="api-reference-note api-reference-note--compact">
                        The metadata limit allows several researchers behind one institutional gateway. Download starts
                        are deliberately tight because some CSV exports are 80-200 MB.
                    </p>
                </article>
            </section>

            <section className="api-reference-panel">
                <div className="api-reference-section-heading">
                    <div>
                        <p className="api-reference-kicker">Base URLs</p>
                        <h2>Use production or local development</h2>
                    </div>
                </div>
                <div className="api-base-grid">
                    <code>{BASE_URL}</code>
                    <code>{localBaseUrl}</code>
                </div>
            </section>

            <section className="api-reference-panel">
                <div className="api-reference-section-heading">
                    <div>
                        <p className="api-reference-kicker">Login</p>
                        <h2>Authenticate once, then reuse the session cookie</h2>
                    </div>
                </div>
                <p className="api-reference-note">
                    Browser links work when you are already logged in. Scripts should log in first and send the saved
                    session cookie on later API requests.
                </p>
                <pre><code>{curlLoginExample}</code></pre>
            </section>

            <section className="api-endpoint-list" aria-label="Public API endpoints">
                {endpoints.map((endpoint) => (
                    <article className="api-endpoint-card" key={endpoint.path}>
                        <div className="api-endpoint-header">
                            <span className="api-method">{endpoint.method}</span>
                            <span className="api-access-badge">{endpoint.access}</span>
                            <code>{endpoint.path}</code>
                        </div>
                        <h2>{endpoint.title}</h2>
                        <p>{endpoint.description}</p>
                        {endpoint.params.length > 0 && (
                            <div className="api-param-list">
                                <span>Parameters</span>
                                {endpoint.params.map((param) => <code key={param}>{param}</code>)}
                            </div>
                        )}
                        <div className="api-example-pair">
                            <div>
                                <span>Local test</span>
                                <pre><code>{endpoint.localExample}</code></pre>
                            </div>
                            <div>
                                <span>Live test</span>
                                <pre><code>{endpoint.liveExample}</code></pre>
                            </div>
                        </div>
                    </article>
                ))}
            </section>

            <section className="api-reference-panel">
                <div className="api-reference-section-heading">
                    <div>
                        <p className="api-reference-kicker">Python</p>
                        <h2>Read data as JSON</h2>
                    </div>
                </div>
                <p className="api-reference-note">
                    This reads one site-table dataset for one date window. The API returns JSON rows with SAST
                    timestamps, field values, and a next link for pagination.
                </p>
                <pre><code>{pythonExample}</code></pre>
            </section>

            <section className="api-reference-panel">
                <div className="api-reference-section-heading">
                    <div>
                        <p className="api-reference-kicker">Full Time Series</p>
                        <h2>Read a complete site-table history in monthly JSON chunks</h2>
                    </div>
                </div>
                <p className="api-reference-note">
                    Use the date range endpoint to discover the full archive window, then loop through month-sized
                    JSON requests. This avoids a single very large response while still giving users the complete time series.
                </p>
                <pre><code>{pythonFullSeriesExample}</code></pre>
            </section>
        </main>
    );
};

export default ApiReference;
