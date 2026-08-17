// src/pages/Issues.jsx
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import './Issues.css';

const STATUS_OPTIONS = [
    { value: '', label: 'All' },
    { value: 'open', label: 'Open' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'closed', label: 'Closed' },
];

const SEVERITY_OPTIONS = [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
];

const statusLabel = (status) => STATUS_OPTIONS.find((item) => item.value === status)?.label || status || 'Unknown';
const severityLabel = (severity) => SEVERITY_OPTIONS.find((item) => item.value === severity)?.label || 'Low';

const countBy = (items, key) =>
    items.reduce((acc, item) => {
        const value = item?.[key] || 'unknown';
        acc[value] = (acc[value] || 0) + 1;
        return acc;
    }, {});

const formatSastDate = (value) => {
    if (!value) return 'Unknown';
    return new Date(value).toLocaleString('en-ZA', {
        timeZone: 'Africa/Johannesburg',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
};

export default function Issues({ user }) {
    const username = (user?.username || '').trim();
    const role = user?.role || '';
    const userId = user?.userId ?? user?.id;
    const isAdmin = role === 'Admin' || role === 'SU';
    const isMarcSU14 =
        role === 'SU' &&
        username.toLowerCase() === 'marc' &&
        String(userId) === '14';

    const [summary, setSummary] = useState('');
    const [details, setDetails] = useState('');
    const [severity, setSeverity] = useState('low');
    const [contactEmail, setContactEmail] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitOk, setSubmitOk] = useState(null);
    const [submitErr, setSubmitErr] = useState(null);

    const [statusFilter, setStatusFilter] = useState('');
    const [loadingList, setLoadingList] = useState(false);
    const [loadErr, setLoadErr] = useState(null);
    const [myIssues, setMyIssues] = useState([]);

    const [editOpen, setEditOpen] = useState(false);
    const [editSaving, setEditSaving] = useState(false);
    const [editErr, setEditErr] = useState(null);
    const [editForm, setEditForm] = useState({
        id: null,
        summary: '',
        details: '',
        contact_email: '',
        severity: 'low',
        status: 'open',
        user_message: '',
    });

    const [rowErr, setRowErr] = useState({});
    const [deletingId, setDeletingId] = useState(null);

    const [allStatusFilter, setAllStatusFilter] = useState('');
    const [allQuery, setAllQuery] = useState('');
    const [loadingAll, setLoadingAll] = useState(false);
    const [loadAllErr, setLoadAllErr] = useState(null);
    const [allIssues, setAllIssues] = useState([]);
    const [rowErrAll, setRowErrAll] = useState({});
    const [deletingAllId, setDeletingAllId] = useState(null);
    const [quickSavingId, setQuickSavingId] = useState(null);

    const listParams = useMemo(() => {
        const params = { user: username };
        if (statusFilter) params.status = statusFilter;
        return params;
    }, [username, statusFilter]);

    const myCounts = useMemo(() => countBy(myIssues, 'status'), [myIssues]);
    const mySeverityCounts = useMemo(() => countBy(myIssues, 'severity'), [myIssues]);
    const allCounts = useMemo(() => countBy(allIssues, 'status'), [allIssues]);
    const allSeverityCounts = useMemo(() => countBy(allIssues, 'severity'), [allIssues]);

    const loadMyIssues = async () => {
        if (!username) {
            setMyIssues([]);
            return;
        }

        try {
            setLoadErr(null);
            setLoadingList(true);
            const { data } = await axios.get('/api/issues/mine', { params: listParams });
            setMyIssues(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error('Failed to load my issues', e);
            setLoadErr(e?.response?.data?.message || 'Failed to load issues.');
            setMyIssues([]);
        } finally {
            setLoadingList(false);
        }
    };

    const loadAllIssues = async () => {
        if (!isMarcSU14) return;

        try {
            setLoadAllErr(null);
            setLoadingAll(true);
            const params = {
                user: username,
                userId,
                role,
                pageSize: 200,
            };
            if (allStatusFilter) params.status = allStatusFilter;
            if (allQuery.trim()) params.q = allQuery.trim();

            const { data } = await axios.get('/api/issues/all-as-marc', { params });
            setAllIssues(Array.isArray(data?.items) ? data.items : []);
        } catch (e) {
            console.error('Failed to load all issues', e);
            setLoadAllErr(e?.response?.data?.message || 'Failed to load all issues.');
            setAllIssues([]);
        } finally {
            setLoadingAll(false);
        }
    };

    useEffect(() => {
        loadMyIssues();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [listParams]);

    useEffect(() => {
        loadAllIssues();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isMarcSU14, allStatusFilter, allQuery]);

    const submit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setSubmitOk(null);
        setSubmitErr(null);

        if (!summary || summary.trim().length < 4) {
            setSubmitErr('Summary must be at least 4 characters.');
            setSubmitting(false);
            return;
        }

        try {
            await axios.post('/api/issues', {
                summary: summary.trim(),
                details: details.trim() || null,
                severity,
                contactEmail: contactEmail.trim() || null,
                meta: {
                    ua: navigator.userAgent,
                    path: window.location.pathname,
                    timeZone: 'Africa/Johannesburg',
                },
                createdByUser: username,
                createdByRole: role,
            });
            setSubmitOk('Thanks, your issue has been logged.');
            setSummary('');
            setDetails('');
            setSeverity('low');
            setContactEmail('');
            loadMyIssues();
            loadAllIssues();
        } catch (err) {
            setSubmitErr(err?.response?.data?.message || 'Could not submit issue.');
        } finally {
            setSubmitting(false);
        }
    };

    const openEdit = (issue) => {
        setEditErr(null);
        setEditForm({
            id: issue.id,
            summary: issue.summary || '',
            details: issue.details || '',
            contact_email: issue.contact_email || '',
            severity: issue.severity || 'low',
            status: issue.status || 'open',
            user_message: issue.user_message || '',
        });
        setEditOpen(true);
    };

    const closeEdit = () => {
        setEditOpen(false);
        setEditSaving(false);
        setEditErr(null);
    };

    const patchIssue = async (id, payload) => {
        await axios.patch(`/api/issues/${id}`, payload, {
            params: { user: username, role },
        });
    };

    const saveEdit = async () => {
        if (!editForm.summary || editForm.summary.trim().length < 4) {
            setEditErr('Summary must be at least 4 characters.');
            return;
        }

        try {
            setEditSaving(true);
            const payload = {
                summary: editForm.summary.trim(),
                details: editForm.details.trim() || null,
                contactEmail: editForm.contact_email.trim() || null,
            };

            if (isAdmin) {
                payload.severity = editForm.severity;
                payload.status = editForm.status;
                payload.userMessage = editForm.user_message.trim() || null;
            }

            await patchIssue(editForm.id, payload);
            closeEdit();
            loadMyIssues();
            loadAllIssues();
        } catch (e) {
            const msg = e?.response?.data?.message || 'Failed to update issue.';
            setEditErr(msg);
            console.error('PATCH issue failed:', e);
        } finally {
            setEditSaving(false);
        }
    };

    const quickAdminUpdate = async (issue, field, value) => {
        setRowErrAll((prev) => ({ ...prev, [issue.id]: null }));
        setQuickSavingId(issue.id);

        try {
            await patchIssue(issue.id, { [field]: value });
            setAllIssues((items) =>
                items.map((item) => (item.id === issue.id ? { ...item, [field]: value } : item))
            );
            setMyIssues((items) =>
                items.map((item) => (item.id === issue.id ? { ...item, [field]: value } : item))
            );
        } catch (e) {
            setRowErrAll((prev) => ({
                ...prev,
                [issue.id]: e?.response?.data?.message || 'Failed to update issue.',
            }));
        } finally {
            setQuickSavingId(null);
        }
    };

    const deleteIssue = async (id, isAllList = false) => {
        if (!window.confirm('Delete this issue?')) return;

        const setErrMap = isAllList ? setRowErrAll : setRowErr;
        const setDelId = isAllList ? setDeletingAllId : setDeletingId;

        setErrMap((prev) => ({ ...prev, [id]: null }));
        try {
            setDelId(id);
            await axios.delete(`/api/issues/${id}`, {
                params: { user: username, role },
            });
            if (isAllList) {
                loadAllIssues();
            } else {
                loadMyIssues();
            }
        } catch (e) {
            const msg = e?.response?.data?.message || 'Failed to delete issue.';
            setErrMap((prev) => ({ ...prev, [id]: msg }));
            console.error('DELETE issue failed:', e);
        } finally {
            setDelId(null);
        }
    };

    const renderStatusFilter = (value, onChange, ariaLabel) => (
        <div className="issues-filter-chips" role="group" aria-label={ariaLabel}>
            {STATUS_OPTIONS.map((option) => (
                <button
                    key={option.value || 'all'}
                    type="button"
                    className={`issues-chip ${value === option.value ? 'is-active' : ''}`}
                    onClick={() => onChange(option.value)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );

    const renderIssueCard = (issue, { admin = false } = {}) => {
        const owner = (issue.created_by_user || '').trim().toLowerCase() === username.toLowerCase();
        const deleting = admin ? deletingAllId === issue.id : deletingId === issue.id;
        const err = admin ? rowErrAll[issue.id] : rowErr[issue.id];

        return (
            <article className="issues-card" key={issue.id}>
                <div className="issues-card-main">
                    <div className="issues-card-topline">
                        <span className={`issues-pill issues-pill--${issue.status || 'unknown'}`}>
                            {statusLabel(issue.status)}
                        </span>
                        <span className={`issues-pill issues-pill--severity-${issue.severity || 'low'}`}>
                            {severityLabel(issue.severity)}
                        </span>
                        <span className="issues-date">{formatSastDate(issue.created_at)} SAST</span>
                    </div>

                    <h3>{issue.summary}</h3>

                    {admin && (
                        <p className="issues-byline">
                            Reported by {issue.created_by_user || 'unknown'}
                            {issue.created_by_role ? ` (${issue.created_by_role})` : ''}
                        </p>
                    )}

                    {issue.details && <p className="issues-details">{issue.details}</p>}
                    {issue.user_message && (
                        <div className="issues-message">
                            <strong>Response:</strong> {issue.user_message}
                        </div>
                    )}
                    {err && <div className="issues-alert issues-alert--error">{err}</div>}
                </div>

                <div className="issues-card-actions">
                    {admin && (
                        <div className="issues-admin-controls">
                            <label>
                                <span>Status</span>
                                <select
                                    value={issue.status || 'open'}
                                    disabled={quickSavingId === issue.id}
                                    onChange={(e) => quickAdminUpdate(issue, 'status', e.target.value)}
                                >
                                    {STATUS_OPTIONS.filter((option) => option.value).map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                <span>Severity</span>
                                <select
                                    value={issue.severity || 'low'}
                                    disabled={quickSavingId === issue.id}
                                    onChange={(e) => quickAdminUpdate(issue, 'severity', e.target.value)}
                                >
                                    {SEVERITY_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                    )}

                    <button type="button" className="issues-button issues-button--secondary" onClick={() => openEdit(issue)}>
                        Edit
                    </button>
                    {(owner || isAdmin) && (
                        <button
                            type="button"
                            className="issues-button issues-button--danger"
                            onClick={() => deleteIssue(issue.id, admin)}
                            disabled={deleting}
                        >
                            {deleting ? 'Deleting...' : 'Delete'}
                        </button>
                    )}
                </div>
            </article>
        );
    };

    return (
        <main className="issues-page">
            <section className="issues-hero">
                <div>
                    <p className="issues-eyebrow">Support and site feedback</p>
                    <h1>Issues</h1>
                    <p>
                        Report problems, track your own requests, and triage platform work from one place.
                        Times are shown in SAST.
                    </p>
                </div>
                {user && (
                    <div className="issues-identity-card">
                        <span>Logged in as</span>
                        <strong>{username || 'Unknown user'}</strong>
                        <small>{role || 'No role'}</small>
                    </div>
                )}
            </section>

            {!user ? (
                <section className="issues-empty-state">
                    <h2>Login required</h2>
                    <p>You need to be logged in to report issues or view existing reports.</p>
                </section>
            ) : (
                <>
                    <section className="issues-stat-grid" aria-label="My issue summary">
                        <div className="issues-stat-card">
                            <span>Open</span>
                            <strong>{myCounts.open || 0}</strong>
                        </div>
                        <div className="issues-stat-card">
                            <span>In progress</span>
                            <strong>{myCounts.in_progress || 0}</strong>
                        </div>
                        <div className="issues-stat-card">
                            <span>Resolved or closed</span>
                            <strong>{(myCounts.resolved || 0) + (myCounts.closed || 0)}</strong>
                        </div>
                        <div className="issues-stat-card issues-stat-card--warn">
                            <span>High priority</span>
                            <strong>{mySeverityCounts.high || 0}</strong>
                        </div>
                    </section>

                    <section className="issues-layout">
                        <form className="issues-panel issues-report-panel" onSubmit={submit}>
                            <div className="issues-section-heading">
                                <div>
                                    <p className="issues-eyebrow">New report</p>
                                    <h2>Report an issue</h2>
                                </div>
                                <span className="issues-required-note">Summary is required</span>
                            </div>

                            <label className="issues-field">
                                <span>Summary</span>
                                <input
                                    value={summary}
                                    onChange={(e) => setSummary(e.target.value)}
                                    required
                                    minLength={4}
                                    placeholder="Example: Data page download returned HTML"
                                />
                            </label>

                            <label className="issues-field">
                                <span>Details</span>
                                <textarea
                                    value={details}
                                    onChange={(e) => setDetails(e.target.value)}
                                    rows={6}
                                    placeholder="What happened, what you expected, and steps to reproduce it."
                                />
                            </label>

                            <div className="issues-form-row">
                                <label className="issues-field">
                                    <span>Severity</span>
                                    <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
                                        {SEVERITY_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className="issues-field">
                                    <span>Contact email</span>
                                    <input
                                        type="email"
                                        value={contactEmail}
                                        onChange={(e) => setContactEmail(e.target.value)}
                                        placeholder="Optional"
                                    />
                                </label>
                            </div>

                            <button type="submit" disabled={submitting} className="issues-button issues-button--primary">
                                {submitting ? 'Submitting...' : 'Submit issue'}
                            </button>

                            {submitOk && <div className="issues-alert issues-alert--success">{submitOk}</div>}
                            {submitErr && <div className="issues-alert issues-alert--error">{submitErr}</div>}
                        </form>

                        <section className="issues-panel issues-help-panel">
                            <p className="issues-eyebrow">What makes a good report</p>
                            <h2>Quick checklist</h2>
                            <ul>
                                <li>Name the page or workflow that failed.</li>
                                <li>Add the site, table, variable, or date range if relevant.</li>
                                <li>Paste the error text or describe what looked wrong.</li>
                                <li>Use high severity for broken publishing, downloads, or login blockers.</li>
                            </ul>
                        </section>
                    </section>

                    <section className="issues-panel">
                        <div className="issues-section-heading">
                            <div>
                                <p className="issues-eyebrow">Your reports</p>
                                <h2>My issues</h2>
                            </div>
                            <button
                                type="button"
                                className="issues-button issues-button--secondary"
                                onClick={loadMyIssues}
                                disabled={loadingList}
                            >
                                {loadingList ? 'Refreshing...' : 'Refresh'}
                            </button>
                        </div>

                        {renderStatusFilter(statusFilter, setStatusFilter, 'Filter my issues by status')}
                        {loadErr && <div className="issues-alert issues-alert--error">{loadErr}</div>}

                        <div className="issues-list">
                            {myIssues.length === 0 ? (
                                <div className="issues-empty-state issues-empty-state--compact">
                                    {loadingList ? 'Loading issues...' : 'No issues found for this filter.'}
                                </div>
                            ) : (
                                myIssues.map((issue) => renderIssueCard(issue))
                            )}
                        </div>
                    </section>

                    {isMarcSU14 && (
                        <section className="issues-panel issues-admin-panel">
                            <div className="issues-section-heading">
                                <div>
                                    <p className="issues-eyebrow">Admin triage</p>
                                    <h2>All issues</h2>
                                </div>
                                <button
                                    type="button"
                                    className="issues-button issues-button--secondary"
                                    onClick={loadAllIssues}
                                    disabled={loadingAll}
                                >
                                    {loadingAll ? 'Refreshing...' : 'Refresh'}
                                </button>
                            </div>

                            <div className="issues-stat-grid issues-stat-grid--admin">
                                <div className="issues-stat-card">
                                    <span>Open</span>
                                    <strong>{allCounts.open || 0}</strong>
                                </div>
                                <div className="issues-stat-card">
                                    <span>In progress</span>
                                    <strong>{allCounts.in_progress || 0}</strong>
                                </div>
                                <div className="issues-stat-card">
                                    <span>Resolved</span>
                                    <strong>{allCounts.resolved || 0}</strong>
                                </div>
                                <div className="issues-stat-card issues-stat-card--warn">
                                    <span>High priority</span>
                                    <strong>{allSeverityCounts.high || 0}</strong>
                                </div>
                            </div>

                            <div className="issues-admin-toolbar">
                                {renderStatusFilter(allStatusFilter, setAllStatusFilter, 'Filter all issues by status')}
                                <label className="issues-search">
                                    <span>Search</span>
                                    <input
                                        value={allQuery}
                                        onChange={(e) => setAllQuery(e.target.value)}
                                        placeholder="Summary or details"
                                    />
                                </label>
                            </div>

                            {loadAllErr && <div className="issues-alert issues-alert--error">{loadAllErr}</div>}

                            <div className="issues-list">
                                {allIssues.length === 0 ? (
                                    <div className="issues-empty-state issues-empty-state--compact">
                                        {loadingAll ? 'Loading issues...' : 'No issues found for this filter.'}
                                    </div>
                                ) : (
                                    allIssues.map((issue) => renderIssueCard(issue, { admin: true }))
                                )}
                            </div>
                        </section>
                    )}

                    {editOpen && (
                        <div
                            className="issues-modal-overlay"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="issue-edit-title"
                            onClick={closeEdit}
                        >
                            <div className="issues-modal" onClick={(e) => e.stopPropagation()}>
                                <div className="issues-modal-header">
                                    <div>
                                        <p className="issues-eyebrow">Issue editor</p>
                                        <h2 id="issue-edit-title">Edit issue</h2>
                                    </div>
                                    <button type="button" onClick={closeEdit} className="issues-close-button" aria-label="Close">
                                        x
                                    </button>
                                </div>

                                <div className="issues-modal-body">
                                    <label className="issues-field">
                                        <span>Summary</span>
                                        <input
                                            value={editForm.summary}
                                            onChange={(e) => setEditForm({ ...editForm, summary: e.target.value })}
                                            minLength={4}
                                            required
                                        />
                                    </label>

                                    <label className="issues-field">
                                        <span>Details</span>
                                        <textarea
                                            value={editForm.details}
                                            onChange={(e) => setEditForm({ ...editForm, details: e.target.value })}
                                            rows={6}
                                        />
                                    </label>

                                    <label className="issues-field">
                                        <span>Contact email</span>
                                        <input
                                            type="email"
                                            value={editForm.contact_email}
                                            onChange={(e) => setEditForm({ ...editForm, contact_email: e.target.value })}
                                        />
                                    </label>

                                    {isAdmin && (
                                        <>
                                            <div className="issues-form-row">
                                                <label className="issues-field">
                                                    <span>Status</span>
                                                    <select
                                                        value={editForm.status}
                                                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                                                    >
                                                        {STATUS_OPTIONS.filter((option) => option.value).map((option) => (
                                                            <option key={option.value} value={option.value}>
                                                                {option.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                                <label className="issues-field">
                                                    <span>Severity</span>
                                                    <select
                                                        value={editForm.severity}
                                                        onChange={(e) => setEditForm({ ...editForm, severity: e.target.value })}
                                                    >
                                                        {SEVERITY_OPTIONS.map((option) => (
                                                            <option key={option.value} value={option.value}>
                                                                {option.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </label>
                                            </div>

                                            <label className="issues-field">
                                                <span>Response message</span>
                                                <textarea
                                                    value={editForm.user_message}
                                                    onChange={(e) => setEditForm({ ...editForm, user_message: e.target.value })}
                                                    rows={4}
                                                    placeholder="Optional message shown to the reporter."
                                                />
                                            </label>
                                        </>
                                    )}

                                    {editErr && <div className="issues-alert issues-alert--error">{editErr}</div>}
                                </div>

                                <div className="issues-modal-actions">
                                    <button type="button" onClick={closeEdit} className="issues-button issues-button--secondary">
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={saveEdit}
                                        disabled={editSaving}
                                        className="issues-button issues-button--primary"
                                    >
                                        {editSaving ? 'Saving...' : 'Save changes'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </main>
    );
}
