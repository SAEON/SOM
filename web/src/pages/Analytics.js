import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { MapContainer, TileLayer } from 'react-leaflet';
import HeatmapLayer from './HeatmapLayer';
import 'leaflet/dist/leaflet.css';
import { Bar } from 'react-chartjs-2';
import './Analytics.css';

import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

import {
    ArcElement,
    BarElement,
    CategoryScale,
    Chart as ChartJS,
    Legend,
    LinearScale,
    Title,
    Tooltip
} from 'chart.js';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement
);

// Display names
const interactionTypeMapping = {
    toggle_server: 'Site toggles',
    page_view: 'Page views',
    view_data_availability: 'Data availability',
    view_aggregated_data_availability: 'Aggregated data availability',
    view_table: 'Table views',
    generate_sankey_data_tab: 'View site variable mapping',
    view_info_modal: 'View information',
    view_metadata: 'View metadata',
    download_data: 'Download data',
    consent_given: 'Consent given',
    get_table_list: 'API table list',
    get_site_list: 'API site list',
    get_date_range: 'API date range',
};

// -------- helpers

const normalize = (s) => (s || '').trim().toLowerCase();

const SENSITIVE_KEYS = new Set([
    'race',
    'id_number',
    'passport_number',
    'passport_country',
    'email',
    'phone',
    'student_number',
    'supervisor',
    'co_supervisors',
]);

const redactMerged = (merged) => {
    const copy = { ...(merged || {}) };
    for (const k of Object.keys(copy)) {
        if (SENSITIVE_KEYS.has(k)) copy[k] = 'REDACTED — POPIA not accepted';
    }
    return copy;
};

const findProfileForDetail = (profiles, detail) => {
    if (!profiles?.length) return null;
    if (detail.userId != null) {
        const p = profiles.find(x => String(x.userId) === String(detail.userId));
        if (p) return p;
    }
    const fn = normalize(detail.firstName);
    const ln = normalize(detail.lastName);
    if (fn || ln) {
        const p = profiles.find(x => normalize(x.firstName) === fn && normalize(x.lastName) === ln);
        if (p) return p;
    }
    return null;
};

const formatIdBlock = (m) => {
    if (m.id_kind === 'sa_id' && m.id_number) return `ID:${m.id_number}`;
    if (m.id_kind === 'passport') {
        const num = m.passport_number || '—';
        const ctry = m.passport_country ? ` (${m.passport_country})` : '';
        return `Passport:${num}${ctry}`;
    }
    return '—';
};

const buildUserLinePrefix = (detail, profile) => {
    // base interaction fields
    const name  = (profile?.merged?.full_name) || `${detail.firstName || 'Anonymous'} ${detail.lastName || ''}`.trim();
    const sector = detail.sector || profile?.sector || 'Unknown';
    const locCountry = detail.location?.country || 'Unknown';
    const locCity    = detail.location?.city || 'Unknown';

    const merged0 = profile?.merged || {};
    const merged  = (profile?.redacted || !profile?.popiaConsentAny) ? redactMerged(merged0) : merged0;

    // non-sensitive org OK to show in either case
    const org = merged.organisation || merged.organization || merged.institution || '—';

    // optional extras (POPIA-aware)
    const race   = merged.race || '—';
    const gender = merged.gender || '—';
    const idText = formatIdBlock(merged);
    const degree = merged.registered_degree || '—';
    const studNo = merged.student_number || '—';
    const sup    = merged.supervisor || '';
    const cosup  = merged.co_supervisors || '';
    const supBlock = (sup || cosup) ? `${sup}${cosup ? ` | ${cosup}` : ''}` : '—';

    // Compact prefix. The rest (table/server) is added where needed.
    // We keep org near the front so the row reads well.
    return {
        prefixText: `${name}, ${sector}, ${locCountry}, ${locCity}`,
        org,
        extrasInline: `Race:${race}, Gender:${gender}, ${idText}, Degree:${degree}, Student#:${studNo}, Supervisors:${supBlock}`,
    };
};

const toSAST = (utc) => {
    if (!utc) return null;
    const d = new Date(utc);
    return new Date(d.getTime() + 2 * 60 * 60 * 1000);
};
const fmtDate = (d) => String(d || '').slice(0, 10);

// ------------- component

const Analytics = () => {
    const [range, setRange] = useState('monthly');
    const [year, setYear]   = useState(new Date().getFullYear());
    const [month, setMonth] = useState(new Date().getMonth() + 1);

    const [overview, setOverview] = useState({});
    const [profiles, setProfiles] = useState([]);

    const [servers, setServers] = useState([]);
    const [selectedServer, setSelectedServer] = useState('');

    const [showChartModal, setShowChartModal] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [showChartForType, setShowChartForType] = useState(null);
    const [showWhoTop20ForType, setShowWhoTop20ForType] = useState(null);
    const [stackBy, setStackBy] = useState('sector');
    const [detailsContent, setDetailsContent] = useState('');

    // fetch overview
    useEffect(() => {
        axios
            .get(`/api/analytics/overview?range=${range}&year=${year}&month=${month}`)
            .then((res) => {
                const o = res.data?.overview || {};
                if (o.detailedInteractions) {
                    o.detailedInteractions = o.detailedInteractions.map(it => ({
                        ...it,
                        interactionDate: toSAST(it.interactionDate)?.toISOString(),
                        interactionHour: toSAST(it.interactionHour)?.toISOString(),
                    }));
                }
                setOverview(o);
            })
            .catch(err => console.error('Error fetching analytics data:', err));
    }, [range, year, month]);

    // site list
    useEffect(() => {
        const di = overview.detailedInteractions || [];
        const set = new Set();
        di.forEach(i => {
            const s1 = i?.additionalData?.serverName;
            const s2 = i?.additionalData?.server;
            if (s1) set.add(s1);
            if (s2) set.add(s2);
        });
        setServers(Array.from(set).sort());
    }, [overview.detailedInteractions]);

    // filtered interactions
    const filteredInteractions = useMemo(() => {
        const all = overview.detailedInteractions || [];
        if (!selectedServer) return all;
        return all.filter(i => {
            const s1 = i?.additionalData?.serverName;
            const s2 = i?.additionalData?.server;
            return s1 === selectedServer || s2 === selectedServer;
        });
    }, [overview.detailedInteractions, selectedServer]);

    // derive date range for profile query
    const profileDates = useMemo(() => {
        if (range === 'monthly') {
            const start = new Date(Date.UTC(year, month - 1, 1));
            const end   = new Date(Date.UTC(year, month, 1));
            return { startDate: start.toISOString(), endDate: end.toISOString() };
        } else {
            const start = new Date(Date.UTC(year, 0, 1));
            const end   = new Date(Date.UTC(year + 1, 0, 1));
            return { startDate: start.toISOString(), endDate: end.toISOString() };
        }
    }, [range, year, month]);

    // fetch merged user profiles for visible users
    useEffect(() => {
        const params = new URLSearchParams();
        if (selectedServer) params.set('serverName', selectedServer);
        params.set('startDate', profileDates.startDate);
        params.set('endDate', profileDates.endDate);
        axios
            .get(`/api/public/user_profiles_for_analytics?${params.toString()}`)
            .then(res => setProfiles(res.data || []))
            .catch(() => setProfiles([]));
    }, [selectedServer, profileDates.startDate, profileDates.endDate]);

    // maps
    const heatMapPoints = useMemo(() => {
        if (!selectedServer) {
            return overview.locations
                ? overview.locations.map(l => [l.lat, l.lon, l.visits])
                : [];
        }
        const grid = new Map();
        filteredInteractions.forEach(i => {
            const lat = i?.location?.lat ?? i?.location?.latitude;
            const lon = i?.location?.lon ?? i?.location?.longitude;
            if (typeof lat !== 'number' || typeof lon !== 'number') return;
            const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
            grid.set(key, (grid.get(key) || 0) + 1);
        });
        return Array.from(grid.entries()).map(([k, v]) => {
            const [lat, lon] = k.split(',').map(Number);
            return [lat, lon, v];
        });
    }, [overview.locations, selectedServer, filteredInteractions]);

    // simple top lists (site aware)
    const displayedTopPages = useMemo(() => {
        if (!selectedServer) return overview.topPages || [];
        const counts = {};
        filteredInteractions.forEach(i => {
            const p = i.requestPath || 'Unknown';
            counts[p] = (counts[p] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([path, interactions]) => ({ path, interactions }))
            .sort((a, b) => b.interactions - a.interactions);
    }, [selectedServer, filteredInteractions, overview.topPages]);

    const displayedTopInteractionTypes = useMemo(() => {
        if (!selectedServer) return overview.topInteractionTypes || [];
        const counts = {};
        filteredInteractions.forEach(i => {
            counts[i.interactionType] = (counts[i.interactionType] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([type, count]) => ({ type, count }))
            .sort((a, b) => b.count - a.count);
    }, [selectedServer, filteredInteractions, overview.topInteractionTypes]);

    // charts (unchanged)
    const getChartData = (interactionType) => {
        const data = filteredInteractions.filter(i => i.interactionType === interactionType);
        const grouped = {};
        data.forEach(i => {
            const date = fmtDate(i.interactionDate);
            const cat  = i.additionalData?.serverName || i.requestPath || 'Unknown';
            const key  = `${date}-${cat}`;
            if (!grouped[key]) grouped[key] = { count: 0, date, category: cat };
            grouped[key].count += 1;
        });
        const labels = [...new Set(Object.values(grouped).map(x => x.date))].sort();
        const cats   = [...new Set(Object.values(grouped).map(x => x.category))];
        const map = {};
        cats.forEach(c => map[c] = labels.map(d => grouped[`${d}-${c}`]?.count || 0));
        const datasets = Object.keys(map).map((c, idx) => ({
            label: c,
            data: map[c],
            backgroundColor: `rgba(${(idx * 70) % 255}, ${(idx * 100) % 255}, ${(idx * 150) % 255}, 0.6)`,
            borderColor:    `rgba(${(idx * 70) % 255}, ${(idx * 100) % 255}, ${(idx * 150) % 255}, 1)`,
            borderWidth: 1,
        }));
        return { labels, datasets };
    };

    const getTop20ChartData = (interactionType) => {
        const data = filteredInteractions.filter(i => i.interactionType === interactionType);
        const grouped = {};
        data.forEach(i => {
            const cat =
                interactionType === 'toggle_server' ? i.additionalData?.serverName :
                    interactionType === 'page_view' ? i.requestPath :
                        (interactionType === 'view_data_availability' || interactionType === 'download_data')
                            ? `${i.additionalData?.tableName || 'Unknown'} - ${i.additionalData?.serverName || 'Unknown'}`
                            : i.requestPath || 'Unknown';

            const stackVal =
                stackBy === 'sector'      ? (i.sector || 'Unknown') :
                    stackBy === 'userId'      ? `${i.firstName || 'Anonymous'} ${i.lastName || ''}`.trim() :
                        stackBy === 'discipline'  ? (i.discipline || 'Unknown') :
                            /* country */               (i.userCountry || 'Unknown');

            const key = `${cat}-${stackVal}`;
            if (!grouped[key]) grouped[key] = { count: 0, category: cat, stackBy: stackVal };
            grouped[key].count += 1;
        });

        const sorted = Object.values(grouped).sort((a,b) => b.count - a.count).slice(0,20);
        const labels = [...new Set(sorted.map(x => x.category))];
        const groups = [...new Set(sorted.map(x => x.stackBy))];
        const map = {};
        groups.forEach(g => map[g] = labels.map(l => sorted.find(x => x.category === l && x.stackBy === g)?.count || 0));
        const datasets = Object.keys(map).map((g, idx) => ({
            label: g,
            data: map[g],
            backgroundColor: `rgba(${(idx * 70) % 255}, ${(idx * 100) % 255}, ${(idx * 150) % 255}, 0.6)`,
            borderColor:    `rgba(${(idx * 70) % 255}, ${(idx * 100) % 255}, ${(idx * 150) % 255}, 1)`,
            borderWidth: 1,
        }));
        return { labels, datasets };
    };

    // -------- Details modal (ONE ROW PER OCCURRENCE)
    const openDetailsModal = (interactionType) => {
        const html = filteredInteractions
            .filter(i => i.interactionType === interactionType)
            .map((detail) => {
                const prof = findProfileForDetail(profiles, detail);
                const merged0 = prof?.merged || {};
                const merged  = (prof?.redacted || !prof?.popiaConsentAny) ? redactMerged(merged0) : merged0;

                const { prefixText, org, extrasInline } = buildUserLinePrefix(detail, prof);
                const table  = detail.additionalData?.tableName || 'Unknown';
                const server = detail.additionalData?.serverName || detail.additionalData?.server || 'Unknown';
                const date   = fmtDate(detail.interactionDate);

                const whoLine = `${prefixText}, ${table}, ${server}: 1 (date: ${date})`;

                const extraBlock = [
                    `Organisation: ${org}`,
                    `Study status: ${merged.study_status || '—'}`,
                    `Email: ${merged.email || '—'}`,
                    `Phone: ${merged.phone || '—'}`,
                    extrasInline
                ].join(' • ');

                return `
          <strong>${interactionTypeMapping[detail.interactionType] || detail.interactionType}</strong><br/>
          ${whoLine}<br/>
          <em>${extraBlock}</em><br/>
          Additional Data: ${JSON.stringify(detail.additionalData || {})}<br/>
        `;
            })
            .join('<hr/>');

        setDetailsContent(html);
        setShowDetailsModal(true);
    };

    // -------- Report generator (EVERY OCCURRENCE)
    const stripHtml = (html) =>
        html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').trim();

    const generateReportText = () => {
        const DI = selectedServer ? filteredInteractions : (overview.detailedInteractions || []);

        let report = `<strong>Analytics Report (unique hourly interactions)</strong><br/>`;
        report += `Range: ${range === 'yearly' ? year : `${month}/${year}`}${selectedServer ? ` — Site: ${selectedServer}` : ''}<br/><br/>`;
        report += `<strong>Totals</strong><br/>`;
        report += `Total website interactions (hourly): ${overview.totalVisits}<br/>`;
        report += `New Users: ${overview.newUsers}<br/>`;
        report += `Anonymous Users: ${overview.anonymousUsers}<br/>`;
        report += `API Requests: ${overview.apiRequests}<br/>`;
        const totalDownloads = (overview.apiDownloads ?? 0) + (overview.webDownloads ?? 0);
        report += `Total Downloads: ${totalDownloads} (API: ${overview.apiDownloads ?? 0}; Web: ${overview.webDownloads ?? 0})<br/><br/>`;

        // Print every occurrence grouped by interaction type, but no aggregation
        const byType = {};
        DI.forEach(d => {
            const key = interactionTypeMapping[d.interactionType] || d.interactionType;
            if (!byType[key]) byType[key] = [];
            byType[key].push(d);
        });

        Object.keys(byType).sort().forEach(type => {
            report += `<br/><strong>${type}</strong><br/>`;
            byType[type].forEach((detail) => {
                const prof = findProfileForDetail(profiles, detail);
                const merged0 = prof?.merged || {};
                const merged  = (prof?.redacted || !prof?.popiaConsentAny) ? redactMerged(merged0) : merged0;

                const { prefixText, org, extrasInline } = buildUserLinePrefix(detail, prof);
                const table  = detail.additionalData?.tableName || 'Unknown';
                const server = detail.additionalData?.serverName || detail.additionalData?.server || 'Unknown';
                const date   = fmtDate(detail.interactionDate);

                const whoLine   = `${prefixText}, ${table}, ${server}: 1 (date: ${date})`;
                const extraLine = [
                    `Organisation: ${org}`,
                    `Study status: ${merged.study_status || '—'}`,
                    `Email: ${merged.email || '—'}`,
                    `Phone: ${merged.phone || '—'}`,
                    extrasInline
                ].join(' • ');

                report += `- ${whoLine}<br/>  Additional Data: ${JSON.stringify({ table, server })}<br/>  <em>${extraLine}</em><br/>`;
            });
        });

        return report;
    };

    const copyReportToClipboard = () => {
        const html = generateReportText();
        const txt  = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').trim();
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(txt).then(() => alert('Report copied!')).catch(() => alert('Failed to copy.'));
        } else {
            const ta = document.createElement('textarea');
            ta.value = txt;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); alert('Report copied!'); } catch { alert('Failed to copy.'); }
            document.body.removeChild(ta);
        }
    };

    // referrals
    const top100Referrals = useMemo(() => {
        if (!filteredInteractions.length) return [];
        const map = {};
        filteredInteractions.forEach(i => {
            const r = i.referrer || 'Direct';
            map[r] = (map[r] || 0) + 1;
        });
        return Object.entries(map).sort((a,b) => b[1]-a[1]).slice(0,100);
    }, [filteredInteractions]);

    const formatNumber = (value) => Number(value || 0).toLocaleString();
    const totalDownloads = (overview.apiDownloads || 0) + (overview.webDownloads || 0);
    const uniquePeople = useMemo(() => {
        const users = new Set();
        filteredInteractions.forEach((item) => {
            if (item.userId) users.add(`user:${item.userId}`);
            else users.add(`anon:${item.firstName || 'Anonymous'}:${item.lastName || ''}:${item.userAgent || ''}`);
        });
        return users.size;
    }, [filteredInteractions]);

    const topDatasets = useMemo(() => {
        const map = new Map();
        filteredInteractions
            .filter((item) => ['download_data', 'view_table', 'view_data_availability'].includes(item.interactionType))
            .forEach((item) => {
                const server = item.additionalData?.serverName || item.additionalData?.server || 'Unknown site';
                const table = item.additionalData?.tableName || 'Unknown table';
                const key = `${server}::${table}`;
                const current = map.get(key) || {server, table, downloads: 0, views: 0, availabilityChecks: 0, total: 0};
                if (item.interactionType === 'download_data') current.downloads += 1;
                if (item.interactionType === 'view_table') current.views += 1;
                if (item.interactionType === 'view_data_availability') current.availabilityChecks += 1;
                current.total += 1;
                map.set(key, current);
            });
        return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 12);
    }, [filteredInteractions]);

    const topSites = useMemo(() => {
        const map = new Map();
        filteredInteractions.forEach((item) => {
            const server = item.additionalData?.serverName || item.additionalData?.server;
            if (!server) return;
            map.set(server, (map.get(server) || 0) + 1);
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    }, [filteredInteractions]);

    const topCountries = useMemo(() => {
        const map = new Map();
        filteredInteractions.forEach((item) => {
            const country = item.location?.country || item.userCountry || 'Unknown';
            map.set(country, (map.get(country) || 0) + 1);
        });
        return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
    }, [filteredInteractions]);

    const websitePages = displayedTopPages.filter(p => !p.path.startsWith('/api/')).slice(0, 8);
    const apiEndpoints = displayedTopPages.filter(p => p.path.startsWith('/api/')).slice(0, 8);
    const usefulInteractionTypes = displayedTopInteractionTypes.slice(0, 8);

    return (
        <div className="analytics-dashboard analytics-dashboard-v2">
            <header className="analytics-hero">
                <div>
                    <span className="analytics-kicker">People and dataset use</span>
                    <h1>Analytics</h1>
                    <p>
                        Understand who is using the observation monitor, which datasets matter most,
                        and where people need support.
                    </p>
                </div>
                <button className="analytics-report-button" onClick={() => setShowReportModal(true)}>
                    Generate report
                </button>
            </header>

            <section className="analytics-controls" aria-label="Analytics filters">
                <label>
                    Period
                    <select value={range} onChange={(e) => setRange(e.target.value)}>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                    </select>
                </label>
                <label>
                    Month
                    <select value={month} onChange={(e) => setMonth(Number(e.target.value))} disabled={range === 'yearly'}>
                        {[...Array(12)].map((_, i) => (
                            <option key={i + 1} value={i + 1}>
                                {new Date(0, i).toLocaleString('default', {month: 'long'})}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Year
                    <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
                        {[...Array(5)].map((_, i) => {
                            const y = new Date().getFullYear() - i;
                            return <option key={y} value={y}>{y}</option>;
                        })}
                    </select>
                </label>
                <label>
                    Site
                    <select value={selectedServer} onChange={(e) => setSelectedServer(e.target.value)}>
                        <option value="">All sites</option>
                        {servers.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </label>
                <label>
                    Segment charts by
                    <select value={stackBy} onChange={(e) => setStackBy(e.target.value)}>
                        <option value="sector">Sector</option>
                        <option value="userId">User</option>
                        <option value="discipline">Discipline</option>
                        <option value="userCountry">Country</option>
                    </select>
                </label>
            </section>

            {selectedServer && (
                <div className="analytics-active-filter">
                    Showing activity for <strong>{selectedServer}</strong>
                    <button type="button" onClick={() => setSelectedServer('')}>Clear site filter</button>
                </div>
            )}

            <section className="analytics-kpi-grid">
                <article className="analytics-kpi-card">
                    <span>Total interactions</span>
                    <strong>{formatNumber(overview.totalVisits)}</strong>
                    <p>Unique hourly website interactions in the selected period.</p>
                </article>
                <article className="analytics-kpi-card">
                    <span>People represented</span>
                    <strong>{formatNumber(uniquePeople)}</strong>
                    <p>Logged-in users plus anonymous sessions represented in activity.</p>
                </article>
                <article className="analytics-kpi-card">
                    <span>Downloads</span>
                    <strong>{formatNumber(totalDownloads)}</strong>
                    <p>{formatNumber(overview.webDownloads)} web downloads, {formatNumber(overview.apiDownloads)} API downloads.</p>
                </article>
                <article className="analytics-kpi-card">
                    <span>API requests</span>
                    <strong>{formatNumber(overview.apiRequests)}</strong>
                    <p>Public API calls in this reporting window.</p>
                </article>
            </section>

            <section className="analytics-grid-two">
                <article className="analytics-panel analytics-panel-large">
                    <div className="analytics-panel-header">
                        <div>
                            <h2>Datasets People Are Using</h2>
                            <p>Downloads, table previews, and availability checks grouped by site and table.</p>
                        </div>
                    </div>
                    <div className="analytics-table-wrap">
                        <table className="analytics-table">
                            <thead>
                            <tr>
                                <th>Dataset</th>
                                <th>Downloads</th>
                                <th>Views</th>
                                <th>Availability</th>
                                <th>Total</th>
                            </tr>
                            </thead>
                            <tbody>
                            {topDatasets.length ? topDatasets.map((row) => (
                                <tr key={`${row.server}-${row.table}`}>
                                    <td>
                                        <strong>{row.table}</strong>
                                        <span>{row.server}</span>
                                    </td>
                                    <td>{formatNumber(row.downloads)}</td>
                                    <td>{formatNumber(row.views)}</td>
                                    <td>{formatNumber(row.availabilityChecks)}</td>
                                    <td>{formatNumber(row.total)}</td>
                                </tr>
                            )) : (
                                <tr><td colSpan="5">No dataset activity for this selection.</td></tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                </article>

                <article className="analytics-panel">
                    <div className="analytics-panel-header">
                        <div>
                            <h2>Top Sites</h2>
                            <p>Sites appearing most often in user actions.</p>
                        </div>
                    </div>
                    <ol className="analytics-ranked-list">
                        {topSites.length ? topSites.map(([site, count]) => (
                            <li key={site}>
                                <button type="button" onClick={() => setSelectedServer(site)}>{site}</button>
                                <span>{formatNumber(count)}</span>
                            </li>
                        )) : <li>No site-specific activity yet.</li>}
                    </ol>
                </article>
            </section>

            <section className="analytics-grid-two analytics-grid-balanced">
                <article className="analytics-panel">
                    <div className="analytics-panel-header">
                        <div>
                            <h2>What People Did</h2>
                            <p>Key action types with quick drilldowns.</p>
                        </div>
                    </div>
                    <div className="analytics-action-list">
                        {usefulInteractionTypes.map((it) => (
                            <div className="analytics-action-row" key={it.type}>
                                <div>
                                    <strong>{interactionTypeMapping[it.type] || it.type}</strong>
                                    <span>{formatNumber(it.count)} occurrences</span>
                                </div>
                                <div className="analytics-row-actions">
                                    <button type="button" onClick={() => { setShowChartForType(it.type); setShowChartModal(true); }}>Chart</button>
                                    <button type="button" onClick={() => { setShowWhoTop20ForType(it.type); setShowChartModal(true); }}>Top 20</button>
                                    <button type="button" onClick={() => openDetailsModal(it.type)}>Details</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </article>

                <article className="analytics-panel">
                    <div className="analytics-panel-header">
                        <div>
                            <h2>People And Places</h2>
                            <p>Where usage appears to come from.</p>
                        </div>
                    </div>
                    <ol className="analytics-ranked-list">
                        {topCountries.map(([country, count]) => (
                            <li key={country}><span>{country}</span><strong>{formatNumber(count)}</strong></li>
                        ))}
                    </ol>
                    <div className="analytics-map-card">
                        <MapContainer center={[0, 20]} zoom={2} style={{height: '100%', width: '100%'}}>
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                            <HeatmapLayer points={heatMapPoints} options={{radius: 24, blur: 18, maxZoom: 10, max: 1.0}} />
                        </MapContainer>
                    </div>
                </article>
            </section>

            <section className="analytics-grid-two analytics-grid-balanced">
                <article className="analytics-panel">
                    <div className="analytics-panel-header">
                        <div>
                            <h2>Pages People Use</h2>
                            <p>Top web pages in the selected period.</p>
                        </div>
                    </div>
                    <ol className="analytics-ranked-list analytics-ranked-list-paths">
                        {websitePages.map((page) => (
                            <li key={page.path}><span>{page.path}</span><strong>{formatNumber(page.interactions)}</strong></li>
                        ))}
                    </ol>
                </article>

                <article className="analytics-panel">
                    <div className="analytics-panel-header">
                        <div>
                            <h2>API Use</h2>
                            <p>Endpoints receiving the most activity.</p>
                        </div>
                    </div>
                    <ol className="analytics-ranked-list analytics-ranked-list-paths">
                        {apiEndpoints.map((page) => (
                            <li key={page.path}><span>{page.path}</span><strong>{formatNumber(page.interactions)}</strong></li>
                        ))}
                    </ol>
                </article>
            </section>

            <section className="analytics-panel">
                <div className="analytics-panel-header">
                    <div>
                        <h2>Referral Sources</h2>
                        <p>How people arrived at the monitor.</p>
                    </div>
                </div>
                <div className="analytics-referral-grid">
                    {top100Referrals.slice(0, 16).map(([ref, count]) => (
                        <div key={ref} className="analytics-referral-item">
                            <span>{ref}</span>
                            <strong>{formatNumber(count)}</strong>
                        </div>
                    ))}
                </div>
            </section>

            {showDetailsModal && (
                <div className="modal-analytics">
                    <div className="modal-analytics-content analytics-modal-v2">
                        <div className="analytics-modal-header">
                            <h2>Interaction Details</h2>
                            <div>
                                <button type="button" onClick={() => {
                                    const txt = stripHtml(detailsContent);
                                    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(() => alert('Details copied!'));
                                }}>
                                    Copy
                                </button>
                                <button type="button" onClick={() => setShowDetailsModal(false)}>Close</button>
                            </div>
                        </div>
                        <div className="modal-analytics-details" dangerouslySetInnerHTML={{__html: detailsContent}} />
                    </div>
                </div>
            )}

            {showChartModal && (
                <div className="modal-analytics">
                    <div className="modal-analytics-content analytics-modal-v2">
                        <div className="analytics-modal-header">
                            <h2>{showWhoTop20ForType ? 'Top 20 Breakdown' : 'Activity Over Time'}</h2>
                            <button type="button" onClick={() => { setShowChartModal(false); setShowChartForType(null); setShowWhoTop20ForType(null); }}>Close</button>
                        </div>
                        {showWhoTop20ForType ? (
                            <Bar data={getTop20ChartData(showWhoTop20ForType)} />
                        ) : (
                            <Bar data={getChartData(showChartForType)} />
                        )}
                    </div>
                </div>
            )}

            {showReportModal && (
                <div className="modal-analytics">
                    <div className="modal-analytics-content analytics-modal-v2">
                        <div className="analytics-modal-header">
                            <h2>Summary Report</h2>
                            <div>
                                <button type="button" onClick={copyReportToClipboard}>Copy</button>
                                <button type="button" onClick={() => setShowReportModal(false)}>Close</button>
                            </div>
                        </div>
                        <div dangerouslySetInnerHTML={{__html: generateReportText()}} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default Analytics;
