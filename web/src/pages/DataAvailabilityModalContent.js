import React, { useEffect, useMemo, useState, useCallback } from 'react';
import MyHeatMap from './MyHeatMap';
import Spinner from './Spinner';

/**
 * Embedded content for use inside an existing modal wrapper (e.g., react-modal).
 * - Does NOT render its own page overlay or lock body scroll.
 * - Renders a summary POPUP (backdrop + dialog) ABOVE the chart, within the same modal.
 *
 * Props:
 *  - data: array of rows { display_field_name, aggregated_timestamp, availability_percentage }
 *  - onClose: function to close the parent modal
 */
const DataAvailabilityModalContent = ({ data, onClose }) => {
    const [copyAlert, setCopyAlert] = useState(false);
    const [isSummaryOpen, setIsSummaryOpen] = useState(false);

    const safeData = useMemo(
        () => (Array.isArray(data) ? data : [])
            .filter(item =>
                item?.display_field_name &&
                item?.aggregated_timestamp &&
                Number.isFinite(Number(item.availability_percentage))
            )
            .map(item => ({
                ...item,
                aggregated_timestamp: new Date(item.aggregated_timestamp).toISOString().slice(0, 10),
                availability_percentage: Math.max(0, Math.min(100, Number(item.availability_percentage))),
            })),
        [data]
    );
    const loading = safeData.length === 0;

    const variables = useMemo(
        () => [...new Set(safeData.map(i => i.display_field_name))].sort((a, b) => a.localeCompare(b)),
        [safeData]
    );

    const dates = useMemo(
        () =>
            [...new Set(safeData.map(i => i.aggregated_timestamp))].sort(
                (a, b) => new Date(a) - new Date(b)
            ),
        [safeData]
    );

    const variableIndex = useMemo(
        () => new Map(variables.map((variable, index) => [variable, index])),
        [variables]
    );

    const dateIndex = useMemo(
        () => new Map(dates.map((date, index) => [date, index])),
        [dates]
    );

    const heatmapData = useMemo(
        () =>
            safeData.map(i => {
                const v = variableIndex.get(i.display_field_name);
                const d = dateIndex.get(i.aggregated_timestamp);
                const a = parseFloat(i.availability_percentage) || 0;
                return [d, v, isNaN(a) ? 0 : a];
            }),
        [safeData, variableIndex, dateIndex]
    );

    const variableAverages = useMemo(() => {
        const totals = new Map();

        safeData.forEach((item) => {
            const key = item.display_field_name;
            const current = totals.get(key) || {sum: 0, count: 0};
            current.sum += parseFloat(item.availability_percentage) || 0;
            current.count += 1;
            totals.set(key, current);
        });

        return new Map(
            variables.map((variable) => {
                const total = totals.get(variable) || {sum: 0, count: 0};
                return [variable, total.count ? total.sum / total.count : 0];
            })
        );
    }, [safeData, variables]);

    const avg = useMemo(() => {
        const total = safeData.reduce(
            (acc, i) => acc + (parseFloat(i.availability_percentage) || 0),
            0
        );
        return safeData.length ? total / safeData.length : 0;
    }, [safeData]);

    const title = `Data availability (${avg.toFixed(2)}% available)`;
    const dateLabel = dates.length ? `${new Date(dates[0]).toLocaleDateString('en-ZA')} - ${new Date(dates[dates.length - 1]).toLocaleDateString('en-ZA')}` : 'No dates';

    // Close summary with ESC (does not close parent)
    useEffect(() => {
        const onKey = e => {
            if (e.key === 'Escape') {
                if (isSummaryOpen) {
                    e.stopPropagation();
                    setIsSummaryOpen(false);
                }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isSummaryOpen]);

    const handleCopy = useCallback(() => {
        const summary =
            `Average Availability: ${avg.toFixed(2)}%\n` +
            variables
                .map(v => {
                    const m = variableAverages.get(v) || 0;
                    return `${v}: ${m.toFixed(1)}% available`;
                })
                .join('\n');

        navigator.clipboard?.writeText(summary).then(() => {
            setCopyAlert(true);
            setTimeout(() => setCopyAlert(false), 1500);
        });
    }, [avg, variables, variableAverages]);

    return (
        <div style={containerStyle}>
            {/* Header (inside parent modal) */}
            <div style={headerStyle}>
                <div style={headerTitleBlockStyle}>
                    <span style={titleStyle}>{title}</span>
                    <div style={metaRowStyle}>
                        <span style={chipStyle}>{variables.length} rows</span>
                        <span style={chipStyle}>{dates.length} periods</span>
                        <span style={chipStyle}>{dateLabel}</span>
                    </div>
                </div>
                <div style={headerActionsStyle}>
                    <button onClick={() => setIsSummaryOpen(true)} style={ghostBtn}>
                        Show text summary
                    </button>
                    <button onClick={handleCopy} style={primaryBtn}>Copy summary</button>
                    <button onClick={onClose} style={closeBtn} aria-label="Close">×</button>
                </div>
            </div>

            {/* Single scroll area */}
            <div style={bodyStyle}>
                {loading ? (
                    <Spinner />
                ) : (
                    <div style={chartShellStyle}>
                        <MyHeatMap
                            data={heatmapData}
                            dates={dates}
                            variables={variables}
                            rowHeight={24}
                            minHeight={620}
                            maxHeight={820}
                            useVerticalScroll
                        />
                    </div>
                )}
            </div>

            {/* Summary POPUP (backdrop + dialog) */}
            {isSummaryOpen && (
                <>
                    <div
                        style={summaryBackdropStyle}
                        onClick={() => setIsSummaryOpen(false)}
                        aria-hidden="true"
                    />
                    <div
                        style={summaryDialogStyle}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Data availability summary"
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={summaryHeaderStyle}>
                            <h3 style={{ margin: 0, fontSize: 18 }}>Summary</h3>
                            <button
                                type="button"
                                onClick={() => setIsSummaryOpen(false)}
                                style={summaryCloseBtnStyle}
                                aria-label="Close summary"
                                title="Close"
                            >
                                ×
                            </button>
                        </div>

                        <div style={summaryBodyStyle}>
                            <strong>Average Availability: {avg.toFixed(2)}%</strong>
                            <div style={{ marginTop: 10 }}>
                                {variables.map((v, idx) => {
                                    const m = variableAverages.get(v) || 0;
                                    return (
                                        <p key={idx} style={{ margin: '6px 0' }}>
                                            {`${v}: ${m.toFixed(1)}% available`}
                                        </p>
                                    );
                                })}
                            </div>

                            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                <button onClick={handleCopy} style={primaryBtn}>Copy to Clipboard</button>
                                <button onClick={() => setIsSummaryOpen(false)} style={ghostBtn}>Close</button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {copyAlert && <div style={toastStyle}>Copied to clipboard!</div>}
        </div>
    );
};

/* ===== Embedded styles (no page overlay) ===== */

const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    width: 'min(1480px, calc(100vw - 64px))',
    maxHeight: '88vh',
    background: '#fff',
    borderRadius: 10,
    border: '1px solid #dbe4ee',
    boxShadow: '0 18px 54px rgba(15, 23, 42, 0.18)',
    overflow: 'hidden',
};

const headerStyle = {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    background: '#ffffff',
    borderBottom: '1px solid #e5edf5',
    padding: '14px 18px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    overflow: 'hidden',
};

const headerTitleBlockStyle = {
    minWidth: 0,
    display: 'grid',
    gap: 8,
};

const titleStyle = {
    color: '#172033',
    fontSize: 19,
    fontWeight: 750,
    lineHeight: 1.2,
};

const metaRowStyle = {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
};

const chipStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 24,
    padding: '3px 9px',
    borderRadius: 999,
    border: '1px solid #dbe4ee',
    background: '#f7fafc',
    color: '#526579',
    fontSize: 12,
    fontWeight: 650,
};

const headerActionsStyle = {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'nowrap',
    justifyContent: 'flex-end',
    flex: '0 0 auto',
};

const bodyStyle = {
    flex: '1 1 auto',
    minHeight: 0,
    overflow: 'auto',
    padding: '14px 18px 18px',
    background: '#f6f9fc',
};

const chartShellStyle = {
    minWidth: 1120,
    maxHeight: 'calc(88vh - 180px)',
    overflow: 'auto',
    background: '#ffffff',
    border: '1px solid #e4ecf4',
    borderRadius: 8,
    padding: '8px 8px 4px',
};

const btnBase = {
    minHeight: 38,
    padding: '8px 13px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 650,
    lineHeight: 1,
    cursor: 'pointer',
    userSelect: 'none',
    boxShadow: '0 3px 8px rgba(15, 23, 42, 0.08)',
};

const primaryBtn = {
    ...btnBase,
    background: '#1d4ed8',
    color: '#fff',
    border: '1px solid #1e40af',
};

const ghostBtn = {
    ...btnBase,
    background: '#fff',
    color: '#172033',
    border: '1px solid #d6e1eb',
};

const closeBtn = {
    width: 38,
    height: 38,
    borderRadius: 19,
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    color: '#475569',
    fontSize: 20,
    lineHeight: '20px',
    textAlign: 'center',
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
};

/* ===== Summary popup styles (overlay within the same modal) ===== */

const summaryBackdropStyle = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.45)',
    zIndex: 100020, // above parent modal content
};

const summaryDialogStyle = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 'min(800px, 92vw)',
    maxHeight: '80vh',
    background: '#fff',
    borderRadius: 12,
    boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
    zIndex: 100030, // above the summary backdrop
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    border: '1px solid #e9e9e9',
};

const summaryHeaderStyle = {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '12px 16px',
    borderBottom: '1px solid #eee',
    background: '#fff',
};

const summaryCloseBtnStyle = {
    width: 32,
    height: 32,
    borderRadius: 16,
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    color: '#475569',
    cursor: 'pointer',
    fontSize: 20,
    lineHeight: '20px',
    textAlign: 'center',
    display: 'grid',
    placeItems: 'center',
};

const summaryBodyStyle = {
    flex: '1 1 auto',
    minHeight: 0,
    overflowY: 'auto',
    padding: '12px 16px',
    background: '#fff',
};

const toastStyle = {
    position: 'fixed',
    top: '10%',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#16a34a',
    color: '#fff',
    padding: '10px 16px',
    borderRadius: 8,
    zIndex: 100040,
    boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
};

export default DataAvailabilityModalContent;
