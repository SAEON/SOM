import React, {useMemo, useState} from 'react';
import MyHeatMap from './MyHeatMap';
import './AllSitesAvailability.css';

export default function AllSitesAvailability({data, onClose}) {
    const [search, setSearch] = useState('');
    const [table, setTable] = useState('');
    const [sort, setSort] = useState('name');
    const [page, setPage] = useState(0);
    const pageSize = 12;
    const rows = useMemo(() => {
        const groups = new Map();
        for (const item of data) {
            const value = Number(item.availability_percentage);
            if (!item.display_field_name || !item.aggregated_timestamp || !Number.isFinite(value)) continue;
            const label = item.display_field_name;
            const split = label.lastIndexOf(' - ');
            const site = item.site_name || (split >= 0 ? label.slice(0, split) : label);
            const dataset = item.table_name || (split >= 0 ? label.slice(split + 3) : '');
            if (!groups.has(label)) groups.set(label, {label, site, table: dataset, sum: 0, count: 0, values: new Map()});
            const row = groups.get(label);
            row.values.set(item.aggregated_timestamp.slice(0, 10), Math.max(0, Math.min(100, value)));
        }
        return [...groups.values()].map(row => {
            const values = [...row.values.values()];
            return {...row, mean: values.reduce((a, b) => a + b, 0) / values.length};
        });
    }, [data]);
    const dates = useMemo(() => [...new Set(data.map(item => item.aggregated_timestamp?.slice(0, 10)).filter(Boolean))].sort(), [data]);
    const tables = useMemo(() => [...new Set(rows.map(row => row.table))].sort(), [rows]);
    const filtered = useMemo(() => rows.filter(row => (!table || row.table === table) && row.site.toLowerCase().includes(search.trim().toLowerCase()))
        .sort((a, b) => (sort === 'availability' ? a.mean - b.mean : 0) || a.site.localeCompare(b.site) || a.table.localeCompare(b.table)), [rows, table, search, sort]);
    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    const currentPage = Math.min(page, pageCount - 1);
    const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
    const variables = visible.map(row => row.label);
    const chartData = visible.flatMap((row, index) => dates.flatMap((date, dateIndex) => row.values.has(date) ? [[dateIndex, index, row.values.get(date)]] : []));
    const overall = filtered.length ? filtered.reduce((sum, row) => sum + row.mean, 0) / filtered.length : null;
    const sites = new Set(filtered.map(row => row.site)).size;
    const changeFilter = setter => event => {setter(event.target.value); setPage(0);};
    const copySummary = async () => {
        const text = ['Site\tTable\tMean availability (%)', ...filtered.map(row => `${row.site}\t${row.table}\t${row.mean.toFixed(1)}`)].join('\n');
        try {await navigator.clipboard.writeText(text); setCopyState('Copied');} catch {setCopyState('Clipboard unavailable');}
    };
    const [copyState, setCopyState] = useState('Copy summary');
    const granularity = data.find(item => item.availability_granularity)?.availability_granularity || 'daily';
    return <section className="availability-overview" aria-label="All-site availability overview">
        <header className="availability-overview__header">
            <div><div className="availability-overview__eyebrow">NETWORK COVERAGE</div>
                <h2>Availability across sites</h2>
                <p>{dates[0]} — {dates[dates.length - 1]} · {granularity} periods · SAST</p>
            </div>
            <button className="availability-overview__close" onClick={onClose} aria-label="Close availability overview">×</button>
        </header>
        <div className="availability-overview__stats">
            <div><strong>{sites}</strong><span>sites in view</span></div>
            <div><strong>{filtered.length}</strong><span>site / table rows</span></div>
            <div><strong>{overall === null ? '—' : `${overall.toFixed(1)}%`}</strong><span>mean availability</span></div>
            <p>Each row is one site and table. Colour shows the mean availability of its mapped variables for each period.</p>
        </div>
        <div className="availability-overview__filters">
            <label className="availability-overview__search">Find a site<input type="search" placeholder="Search site names…" value={search} onChange={changeFilter(setSearch)}/></label>
            <label>Table<select value={table} onChange={changeFilter(setTable)}><option value="">All tables</option>{tables.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
            <label>Order<select value={sort} onChange={changeFilter(setSort)}><option value="name">Site name A–Z</option><option value="availability">Lowest availability first</option></select></label>
            <button onClick={copySummary}>{copyState}</button>
        </div>
        <div className="availability-overview__pagebar">
            <span role="status">{filtered.length ? `Showing ${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, filtered.length)} of ${filtered.length} rows` : 'No matching sites'}</span>
            <div><button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>← Previous</button><span>Page {currentPage + 1} / {pageCount}</span><button disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>Next →</button></div>
        </div>
        {visible.length ? <div className="availability-overview__chart"><MyHeatMap data={chartData} dates={dates} variables={variables}
            rowHeight={44} minHeight={Math.max(340, visible.length * 44 + 170)} maxHeight={850} inverseRows
            overviewRows chartTitle={`All-site availability · rows ${currentPage * pageSize + 1}–${currentPage * pageSize + visible.length}`}/></div>
            : <p className="availability-overview__empty">Try another site name or choose All tables.</p>}
        <footer>Hover over a cell for the full site, table, date and percentage. Drag the date slider to explore a shorter period. Chart download saves the current page.</footer>
    </section>;
}
