import React, {useEffect, useMemo, useState} from "react";
import axios from "axios";
import './ApiReference.css';
import {logInteraction} from "../utils/logInteraction";

const BASE_URL = "https://observationsmonitor.saeon.ac.za";
const CURL_UA = '-A "Mozilla/5.0"';
const AUTH = '-u "$SAEON_API_USER:$SAEON_API_PASSWORD"';

const curl = (path, {auth = false, output = null} = {}) => {
    const parts = ['curl', CURL_UA, '-L'];
    if (auth) parts.push(AUTH);
    if (output) parts.push(`-o ${output}`);
    parts.push(`"${BASE_URL}${path}"`);
    return parts.join(' ');
};

const endpoints = [
    {
        method: "GET",
        path: "/api/v1/status",
        title: "API status",
        description: "Lightweight health check for uptime checks and scripts.",
        params: [],
        access: "Public",
        href: "/api/v1/status",
        example: curl("/api/v1/status"),
    },
    {
        method: "GET",
        path: "/api/v1/sites",
        title: "List public sites",
        description: "Returns public site names that have mapped data in the Data tab.",
        params: [],
        access: "Login required",
        href: "/api/v1/sites",
        example: curl("/api/v1/sites", {auth: true}),
    },
    {
        method: "GET",
        path: "/api/v1/tables",
        title: "List tables for a site",
        description: "Returns public tables, archive dates, row counts, and the next date-range URL.",
        params: ["serverName"],
        access: "Login required",
        href: "/api/v1/tables?serverName=Benfontein%20AWS",
        example: curl("/api/v1/tables?serverName=Benfontein%20AWS", {auth: true}),
    },
    {
        method: "GET",
        path: "/api/v1/date-range",
        title: "Get table date range",
        description: "Returns the available archive window for one site-table dataset.",
        params: ["serverName", "tableName"],
        access: "Login required",
        href: "/api/v1/date-range?serverName=Benfontein%20AWS&tableName=5%20minute",
        example: curl("/api/v1/date-range?serverName=Benfontein%20AWS&tableName=5%20minute", {auth: true}),
    },
    {
        method: "GET",
        path: "/api/v1/data",
        title: "Read data as JSON",
        description: "Returns paginated JSON rows for a bounded date window. Follow next for later pages.",
        params: ["serverName", "tableName", "startDate", "endDate", "limit", "after"],
        access: "Login required",
        href: "/api/v1/data?serverName=Benfontein%20AWS&tableName=5%20minute&startDate=2026-08-13&endDate=2026-08-13&limit=1000",
        example: curl("/api/v1/data?serverName=Benfontein%20AWS&tableName=5%20minute&startDate=2026-08-13&endDate=2026-08-13&limit=1000", {auth: true}),
    },
    {
        method: "GET",
        path: "/api/v1/download",
        title: "Download CSV",
        description: "Downloads one bounded CSV file. Scripts should usually prefer /api/v1/data JSON.",
        params: ["serverName", "tableName", "startDate", "endDate"],
        access: "Login required",
        href: "/api/v1/download?serverName=Benfontein%20AWS&tableName=5%20minute&startDate=2026-08-01&endDate=2026-08-13",
        example: curl("/api/v1/download?serverName=Benfontein%20AWS&tableName=5%20minute&startDate=2026-08-01&endDate=2026-08-13", {auth: true, output: "benfontein-2026-08.csv"}),
    },
    {
        method: "GET",
        path: "/api/public/monitoring/highlights",
        title: "Monitoring highlights",
        description: "Aggregate public counts for archive size, live sites, dataset coverage, and sync timestamps.",
        params: [],
        access: "Public aggregate",
        href: "/api/public/monitoring/highlights",
        example: curl("/api/public/monitoring/highlights"),
    },
    {
        method: "GET",
        path: "/api/public/analytics/highlights",
        title: "Usage highlights",
        description: "Aggregate usage counts for public display. No person-level analytics are returned.",
        params: ["year"],
        access: "Public aggregate",
        href: "/api/public/analytics/highlights?year=2026",
        example: curl("/api/public/analytics/highlights?year=2026"),
    },
];

const curlLoginExample = `BASE_URL="${BASE_URL}"
SAEON_API_USER="your-username"
SAEON_API_PASSWORD="your-password"

# Option 1: log in once and reuse a cookie.
curl ${CURL_UA} -c saeon-api.cookies \\
  -H "Content-Type: application/json" \\
  -d "{\\"username\\":\\"$SAEON_API_USER\\",\\"password\\":\\"$SAEON_API_PASSWORD\\"}" \\
  "$BASE_URL/api/login"

curl ${CURL_UA} -b saeon-api.cookies "$BASE_URL/api/v1/sites"

# Option 2: use HTTP Basic Auth for one-off HTTPS calls.
curl ${CURL_UA} -u "$SAEON_API_USER:$SAEON_API_PASSWORD" \\
  "$BASE_URL/api/v1/sites"`;

const pythonExample = `import requests

BASE_URL = "${BASE_URL}"
USERNAME = "your-username"
PASSWORD = "your-password"

session = requests.Session()
session.auth = (USERNAME, PASSWORD)
session.headers.update({"User-Agent": "Mozilla/5.0"})

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

BASE_URL = "${BASE_URL}"
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
session.headers.update({"User-Agent": "Mozilla/5.0"})

date_range = session.get(
    f"{BASE_URL}/api/v1/date-range",
    params={"serverName": SITE, "tableName": TABLE},
    timeout=30,
).json()

start_day = parse_day(date_range["startDate"])
end_day = parse_day(date_range["endDate"])

for window_start, window_end in month_windows(start_day, end_day):
    next_url = f"{BASE_URL}/api/v1/data"
    params = {
        "serverName": SITE,
        "tableName": TABLE,
        "startDate": window_start.isoformat(),
        "endDate": window_end.isoformat(),
        "limit": 5000,
    }
    while next_url:
        page = session.get(next_url, params=params, timeout=60).json()
        print(window_start, window_end, "rows", page["count"])
        for row in page["items"]:
            # Store/process row["timestampSast"] and row["values"] here.
            pass
        next_url = f"{BASE_URL}{page['next']}" if page.get("next") else None
        params = None
`;

const ApiReference = ({user}) => {
    const [status, setStatus] = useState(null);
    const [statusError, setStatusError] = useState(null);

    const generatedAt = useMemo(() => new Intl.DateTimeFormat('en-ZA', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Africa/Johannesburg',
    }).format(new Date()), []);

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
                        Script access for public site lists, table metadata, date ranges, paginated JSON data,
                        bounded CSV downloads, and aggregate monitoring summaries.
                    </p>
                    <div className="api-reference-pill-row">
                        <span>Production API</span>
                        <span>Generated {generatedAt} SAST</span>
                    </div>
                </div>
                <div className={`api-status-card ${status?.active ? 'api-status-card--ok' : ''}`}>
                    <span>Current status</span>
                    <strong>{status?.active ? 'Online' : statusError ? 'Unavailable' : 'Checking...'}</strong>
                    <small>{status?.message || statusError || 'Testing the public API endpoint.'}</small>
                </div>
            </section>

            <section className="api-reference-grid">
                <article className="api-reference-panel">
                    <h2>Access Rules</h2>
                    <ul>
                        <li>Dataset discovery, JSON data, and CSV downloads require a username and password.</li>
                        <li>Scripts can use either a session cookie from <code>/api/login</code> or HTTP Basic Auth.</li>
                        <li>Status and aggregate monitoring endpoints remain public because they do not expose row-level data.</li>
                        <li>JSON and CSV requests are limited to 31 days per request; loop over monthly windows for full histories.</li>
                        <li>API usage is recorded for analytics and capacity planning.</li>
                    </ul>
                </article>

                <article className="api-reference-panel">
                    <h2>Rate Limits</h2>
                    <dl className="api-rate-list">
                        <div><dt>General API</dt><dd>240 requests per minute</dd></div>
                        <div><dt>JSON data</dt><dd>60 requests per minute</dd></div>
                        <div><dt>CSV downloads</dt><dd>3 starts per 10 minutes</dd></div>
                    </dl>
                    <p className="api-reference-note api-reference-note--compact">
                        Admin, SU, and Collaborators accounts are exempt from these throttles. All API calls are still logged.
                    </p>
                </article>
            </section>

            <section className="api-reference-panel">
                <div className="api-reference-section-heading">
                    <div>
                        <p className="api-reference-kicker">Login</p>
                        <h2>Use your website account from scripts</h2>
                    </div>
                </div>
                <p className="api-reference-note">
                    Use placeholders below, not a shared password in saved scripts. The <code>Mozilla/5.0</code> user agent keeps
                    command-line calls compatible with the public web firewall.
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
                        <a className="api-example-link" href={endpoint.href} target="_blank" rel="noreferrer">
                            Open example
                        </a>
                        <pre><code>{endpoint.example}</code></pre>
                    </article>
                ))}
            </section>

            <section className="api-reference-panel">
                <div className="api-reference-section-heading">
                    <div><p className="api-reference-kicker">Python</p><h2>Read data as JSON</h2></div>
                </div>
                <p className="api-reference-note">
                    This reads one site-table dataset for one date window. Responses use SAST display timestamps,
                    UTC cursor timestamps for pagination, and a field-value object for each row.
                </p>
                <pre><code>{pythonExample}</code></pre>
            </section>

            <section className="api-reference-panel">
                <div className="api-reference-section-heading">
                    <div><p className="api-reference-kicker">Full Time Series</p><h2>Read a complete site-table history in monthly chunks</h2></div>
                </div>
                <p className="api-reference-note">
                    Discover the full archive window from the date-range endpoint, then loop through bounded JSON
                    requests. This gives the full time series without one huge response.
                </p>
                <pre><code>{pythonFullSeriesExample}</code></pre>
            </section>
        </main>
    );
};

export default ApiReference;
