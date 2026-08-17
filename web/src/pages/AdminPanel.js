import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import './AdminPanel.css';

function tryParse(json) {
    try { return JSON.parse(json); } catch { return null; }
}

// Try to find a stored user in local/session storage under common keys
function readStoredUser() {
    const candidates = [
        localStorage.getItem('user'),
        localStorage.getItem('currentUser'),
        sessionStorage.getItem('user'),
        sessionStorage.getItem('currentUser'),
    ].filter(Boolean);

    for (const raw of candidates) {
        const parsed = tryParse(raw);
        if (parsed && (parsed.id || parsed.userId || parsed.username || parsed.role)) {
            return parsed;
        }
    }
    return null;
}

// Normalise any user shape to a consistent object
function normaliseUser(u) {
    if (!u) return null;
    const id = Number(u.id ?? u.userId ?? u.user_id);
    const roleName = String(u.role ?? u.role_name ?? '').trim();
    const roleId = u.role_id != null ? Number(u.role_id) : undefined;
    const isSuperFlag = Boolean(u.is_superuser ?? u.isSuperuser ?? u.is_admin);

    return {
        id: Number.isFinite(id) ? id : undefined,
        username: u.username ?? u.name ?? '',
        role_name: roleName,
        role_id: roleId,
        is_superuser: isSuperFlag,
        raw: u,
    };
}

const AdminPanel = ({ user: userProp, currentUser: currentUserProp }) => {
    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [interactions, setInteractions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMessage, setLoadingMessage] = useState('Loading…');
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('users');
    const [userSearch, setUserSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [notice, setNotice] = useState(null);
    const [siteStatus, setSiteStatus] = useState({
        active: false,
        status: 'online',
        message: 'SAEON observations monitor API is online.',
        details: '',
    });
    const [siteStatusLoading, setSiteStatusLoading] = useState(false);

    // Resolve current user from prop → /api/auth/me → storage (in that order)
    const [currentUser, setCurrentUser] = useState(() => normaliseUser(userProp || currentUserProp) || null);

    useEffect(() => {
        if (userProp || currentUserProp) setCurrentUser(normaliseUser(userProp || currentUserProp));
    }, [userProp, currentUserProp]);

    useEffect(() => {
        const resolveUser = async () => {
            if (currentUser) return;
            // Try API
            try {
                const me = await axios.get('/api/auth/me', { withCredentials: true });
                if (me?.data) {
                    setCurrentUser(normaliseUser(me.data));
                    return;
                }
            } catch {
                // ignore and fall back to storage
            }

            // Try storage
            const stored = readStoredUser();
            if (stored) setCurrentUser(normaliseUser(stored));
        };
        resolveUser();
    }, [currentUser]);

    useEffect(() => {
        const fetchAll = async () => {
            try {
                setLoading(true);
                setLoadingMessage('Loading users, roles, and interactions...');
                const [usersRes, rolesRes, intsRes] = await Promise.all([
                    axios.get('/api/users',        { withCredentials: true }),
                    axios.get('/api/roles',        { withCredentials: true }),
                    axios.get('/api/interactions', { withCredentials: true }),
                ]);

                const safeUsers = Array.isArray(usersRes.data) ? usersRes.data : [];
                const safeRoles = Array.isArray(rolesRes.data) ? rolesRes.data : [];
                const safeInts  = Array.isArray(intsRes.data)  ? intsRes.data  : [];

                // Sort users by join date: oldest first, newest at the bottom.
                // Uses created_at if present, falls back to id.
                safeUsers.sort((a, b) => {
                    const aDateRaw = a.created_at ?? a.createdAt ?? null;
                    const bDateRaw = b.created_at ?? b.createdAt ?? null;

                    if (aDateRaw && bDateRaw) {
                        const aDate = new Date(aDateRaw);
                        const bDate = new Date(bDateRaw);
                        if (!Number.isNaN(aDate.valueOf()) && !Number.isNaN(bDate.valueOf())) {
                            return aDate - bDate; // earlier date (older user) first
                        }
                    }

                    // Fallback: sort by numeric id
                    const aId = Number(a.id ?? a.user_id ?? a.userId ?? 0);
                    const bId = Number(b.id ?? b.user_id ?? b.userId ?? 0);
                    return aId - bId; // smaller id (older) first
                });

                // Keep roles alphabetical by name
                safeRoles.sort((a, b) => (a?.name ?? '').localeCompare(b?.name ?? ''));

                setUsers(safeUsers);
                setRoles(safeRoles);
                setInteractions(safeInts);
                setError(null);
            } catch (e) {
                console.error('Error fetching admin data:', e);
                setError('Failed to load admin data.');
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, []);

    // Detect the SU role id from roles (case-insensitive)
    const suRoleId = useMemo(() => {
        const su =
            roles.find(r => String(r?.name ?? '').toLowerCase() === 'su') ||
            roles.find(r => String(r?.name ?? '').toLowerCase() === 'superuser');
        return su?.id != null ? Number(su.id) : null;
    }, [roles]);

    // Decide if current user is SU (role name, flag, role_id, or id===14 fallback)
    const isSuperUser = useMemo(() => {
        if (!currentUser) return false;
        const byName = ['su', 'superuser'].includes(String(currentUser.role_name ?? '').toLowerCase());
        const byFlag = Boolean(currentUser.is_superuser);
        const byRoleId = suRoleId != null && Number(currentUser.role_id) === Number(suRoleId);
        const byHardcodedId14 = Number(currentUser.id) === 14; // <-- your override
        const result = byName || byFlag || byRoleId || byHardcodedId14;

        // Debug in console so you can verify
        // eslint-disable-next-line no-console
        return result;
    }, [currentUser, suRoleId]);

    // Self-protection: ensure we compare against normalised id
    const isSelf = (row) => {
        const rowId = Number(row?.id ?? row?.user_id ?? row?.userId);
        return Number(currentUser?.id) === rowId;
    };

    const canChangeRole = (row) => isSuperUser && !isSelf(row);
    const canDeleteUser = (row) => isSuperUser && !isSelf(row);

    const getRoleName = useCallback(
        (roleId) => roles.find(r => Number(r.id) === Number(roleId))?.name ?? '—',
        [roles]
    );

    const roleCounts = useMemo(() => {
        return users.reduce((acc, row) => {
            const name = getRoleName(row.role_id);
            acc[name] = (acc[name] || 0) + 1;
            return acc;
        }, {});
    }, [users, getRoleName]);

    const filteredUsers = useMemo(() => {
        const query = userSearch.trim().toLowerCase();
        return users.filter((row) => {
            const roleName = getRoleName(row.role_id);
            const matchesRole = !roleFilter || String(row.role_id) === roleFilter;
            const haystack = [
                row.username,
                row.email,
                row.first_name,
                row.last_name,
                row.country,
                roleName
            ].join(' ').toLowerCase();
            return matchesRole && (!query || haystack.includes(query));
        });
    }, [users, userSearch, roleFilter, getRoleName]);

    const latestInteraction = interactions[0]?.timestamp ? new Date(interactions[0].timestamp) : null;

    const showNotice = (type, message) => {
        setNotice({ type, message });
        window.setTimeout(() => setNotice(null), 4500);
    };

    const fetchSiteStatus = useCallback(async () => {
        if (!isSuperUser) return;
        setSiteStatusLoading(true);
        try {
            const { data } = await axios.get('/api/site-status', { withCredentials: true });
            setSiteStatus({
                active: data.active === true,
                status: data.status || data.type || 'online',
                message: data.message || '',
                details: data.details || '',
                updatedBy: data.updatedBy || null,
                updatedAt: data.updatedAt || null,
            });
        } catch (e) {
            console.error('Error fetching site banner status:', e);
            showNotice('error', e.response?.data?.message || 'Failed to load banner settings.');
        } finally {
            setSiteStatusLoading(false);
        }
    }, [isSuperUser]);

    useEffect(() => {
        if (isSuperUser) fetchSiteStatus();
    }, [isSuperUser, fetchSiteStatus]);

    const saveSiteStatus = async () => {
        if (!isSuperUser) return;
        setSiteStatusLoading(true);
        try {
            const { data } = await axios.put('/api/site-status', {
                active: siteStatus.active,
                status: siteStatus.status,
                message: siteStatus.message,
                details: siteStatus.details,
            }, { withCredentials: true });
            setSiteStatus({
                active: data.active === true,
                status: data.status || data.type || 'online',
                message: data.message || '',
                details: data.details || '',
                updatedBy: data.updatedBy || null,
                updatedAt: data.updatedAt || null,
            });
            showNotice('success', siteStatus.active ? 'Banner updated and active.' : 'Banner updated and hidden.');
        } catch (e) {
            console.error('Error saving site banner status:', e);
            showNotice('error', e.response?.data?.message || 'Failed to save banner settings.');
        } finally {
            setSiteStatusLoading(false);
        }
    };

    const handleRoleChange = async (targetUserIdRaw, roleIdRaw) => {
        const targetUserId = Number(targetUserIdRaw);
        const roleId = Number(roleIdRaw);
        try {
            await axios.post(
                '/api/user_roles',
                { userId: targetUserId, roleId },
                { withCredentials: true }
            );
            setUsers(prev =>
                prev.map(u =>
                    Number(u.id) === targetUserId ? { ...u, role_id: roleId } : u
                )
            );
            showNotice('success', 'Role updated successfully.');
        } catch (e) {
            console.error('Error updating role:', e);
            showNotice('error', e.response?.data?.error || 'Failed to update role.');
        }
    };

    const handleDeleteUser = async (targetUserIdRaw) => {
        const targetUserId = Number(targetUserIdRaw);
        if (Number(currentUser?.id) === targetUserId) {
            alert('You cannot delete the currently logged-in user.');
            return;
        }
        if (!window.confirm('Are you sure you want to delete this user?')) return;
        try {
            await axios.delete(`/api/users/${targetUserId}`, { withCredentials: true });
            setUsers(prev => prev.filter(u => Number(u.id) !== targetUserId));
            showNotice('success', 'User deleted successfully.');
        } catch (e) {
            console.error('Error deleting user:', e);
            showNotice('error', e.response?.data?.message || e.response?.data?.error || 'Failed to delete user.');
        }
    };

    if (loading) return <div className="admin-shell admin-state">{loadingMessage}</div>;
    if (error) return <div className="admin-shell admin-state admin-state--error">{error}</div>;

    return (
        <div className="admin-shell">
            <header className="admin-hero">
                <div>
                    <span className="admin-kicker">Operations console</span>
                    <h1>Admin Panel</h1>
                    <p>Manage users, roles, and recent activity for the SAEON observations monitor.</p>
                </div>
                <div className={`admin-access-chip ${isSuperUser ? 'admin-access-chip--su' : ''}`}>
                    {isSuperUser ? 'Superuser access' : 'Read-only access'}
                </div>
            </header>

            {notice && (
                <div className={`admin-notice admin-notice--${notice.type}`} role="status">
                    {notice.message}
                </div>
            )}

            {!isSuperUser && (
                <div className="admin-warning">
                    You are not a superuser; role changes and deletions are disabled.
                </div>
            )}

            <section className="admin-metrics">
                <div className="admin-metric-card">
                    <span>Total users</span>
                    <strong>{users.length}</strong>
                </div>
                <div className="admin-metric-card">
                    <span>Roles</span>
                    <strong>{roles.length}</strong>
                </div>
                <div className="admin-metric-card">
                    <span>Recent activity rows</span>
                    <strong>{interactions.length}</strong>
                </div>
                <div className="admin-metric-card">
                    <span>Latest activity</span>
                    <strong>{latestInteraction ? latestInteraction.toLocaleDateString() : '—'}</strong>
                </div>
            </section>

            <nav className="admin-tabs" aria-label="Admin sections">
                <button className={activeTab === 'users' ? 'active' : ''} onClick={() => setActiveTab('users')}>
                    Users
                </button>
                <button className={activeTab === 'activity' ? 'active' : ''} onClick={() => setActiveTab('activity')}>
                    Activity
                </button>
                <button className={activeTab === 'banner' ? 'active' : ''} onClick={() => setActiveTab('banner')}>
                    Banner
                </button>
            </nav>

            {activeTab === 'users' && (
                <section className="admin-panel-card">
                    <div className="admin-section-heading">
                        <div>
                            <h2>User Access</h2>
                            <p>Review registered users and manage role assignments.</p>
                        </div>
                        <div className="admin-role-summary">
                            {Object.entries(roleCounts).map(([name, count]) => (
                                <span key={name}>{name}: {count}</span>
                            ))}
                        </div>
                    </div>

                    <div className="admin-toolbar">
                        <label>
                            Search users
                            <input
                                type="search"
                                value={userSearch}
                                placeholder="Name, email, country, role"
                                onChange={(e) => setUserSearch(e.target.value)}
                            />
                        </label>
                        <label>
                            Role
                            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                                <option value="">All roles</option>
                                {roles.map(role => (
                                    <option key={role.id} value={role.id}>{role.name}</option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <div className="admin-table-wrap">
            <table className="admin-table">
                <thead>
                <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>First Name</th>
                    <th>Last Name</th>
                    <th>Country</th>
                    <th>Role</th>
                    <th>Change Role</th>
                    <th>Delete User</th>
                </tr>
                </thead>
                <tbody>
                {filteredUsers.map((row) => {
                    const rowId = Number(row?.id ?? row?.user_id ?? row?.userId);
                    const rowRoleId = Number(row?.role_id);
                    const displayRoleName = getRoleName(rowRoleId);
                    return (
                        <tr key={rowId} className={isSelf(row) ? 'admin-self-row' : ''}>
                            <td>{row.username}</td>
                            <td>{row.email}</td>
                            <td>{row.first_name}</td>
                            <td>{row.last_name}</td>
                            <td>{row.country}</td>
                            <td><span className="admin-role-pill">{displayRoleName}</span></td>
                            <td>
                                <select
                                    value={Number.isFinite(rowRoleId) ? rowRoleId : ''}
                                    onChange={e => handleRoleChange(rowId, e.target.value)}
                                    disabled={!canChangeRole(row)}
                                >
                                    {roles.map(role => (
                                        <option key={role.id} value={role.id}>
                                            {role.name}
                                        </option>
                                    ))}
                                </select>
                            </td>
                            <td>
                                <button
                                    className="admin-danger-button"
                                    onClick={() => handleDeleteUser(rowId)}
                                    disabled={!canDeleteUser(row)}
                                >
                                    Delete
                                </button>
                            </td>
                        </tr>
                    );
                })}
                {filteredUsers.length === 0 && (
                    <tr>
                        <td colSpan="8" className="admin-empty-cell">No users match the current filters.</td>
                    </tr>
                )}
                </tbody>
            </table>
                    </div>
                </section>
            )}

            {activeTab === 'activity' && (
                <section className="admin-panel-card">
                    <div className="admin-section-heading">
                        <div>
                            <h2>Latest Interactions</h2>
                            <p>Most recent activity per known user.</p>
                        </div>
                    </div>
                    <div className="admin-table-wrap">
            <table className="admin-table">
                <thead>
                <tr>
                    <th>User ID</th>
                    <th>First Name</th>
                    <th>Last Name</th>
                    <th>Interaction Type</th>
                    <th>Request Path</th>
                    <th>Timestamp</th>
                </tr>
                </thead>
                <tbody>
                {interactions.map((itx) => (
                    <tr key={itx.interaction_id}>
                        <td>{itx.user_id}</td>
                        <td>{itx.first_name}</td>
                        <td>{itx.last_name}</td>
                        <td>{itx.interaction_type}</td>
                        <td>{itx.request_path}</td>
                        <td>{new Date(itx.timestamp).toLocaleString()}</td>
                    </tr>
                ))}
                {interactions.length === 0 && (
                    <tr>
                        <td colSpan="6" className="admin-empty-cell">No recent interactions found.</td>
                    </tr>
                )}
                </tbody>
            </table>
                    </div>
                </section>
            )}

            {activeTab === 'banner' && (
                <section className="admin-panel-card">
                    <div className="admin-section-heading">
                        <div>
                            <h2>Public Banner</h2>
                            <p>Control the notice shown above the site header for testing, maintenance, warnings, and outages.</p>
                        </div>
                        <div className="admin-banner-actions">
                            <button className="admin-secondary-button" onClick={fetchSiteStatus} disabled={siteStatusLoading || !isSuperUser}>
                                Refresh
                            </button>
                            <button className="admin-primary-button" onClick={saveSiteStatus} disabled={siteStatusLoading || !isSuperUser}>
                                Save Banner
                            </button>
                        </div>
                    </div>

                    <div className={`admin-banner-preview admin-banner-preview--${siteStatus.status}`}>
                        <strong>{siteStatus.active ? siteStatus.message || 'Banner message will appear here.' : 'Banner hidden'}</strong>
                        {siteStatus.active && siteStatus.details && <span>{siteStatus.details}</span>}
                    </div>

                    <div className="admin-banner-form">
                        <label className="admin-toggle-row">
                            <input
                                type="checkbox"
                                checked={siteStatus.active}
                                disabled={!isSuperUser}
                                onChange={(e) => setSiteStatus(prev => ({...prev, active: e.target.checked}))}
                            />
                            Show banner on public site
                        </label>
                        <label>
                            Banner type
                            <select
                                value={siteStatus.status}
                                disabled={!isSuperUser}
                                onChange={(e) => setSiteStatus(prev => ({...prev, status: e.target.value}))}
                            >
                                <option value="testing">Testing</option>
                                <option value="maintenance">Maintenance</option>
                                <option value="warning">Warning</option>
                                <option value="degraded">Degraded</option>
                                <option value="offline">Offline</option>
                                <option value="online">Online</option>
                                <option value="done">Done</option>
                            </select>
                        </label>
                        <label className="admin-banner-form-wide">
                            Message
                            <input
                                type="text"
                                value={siteStatus.message}
                                disabled={!isSuperUser}
                                placeholder="SAEON observations monitor is in testing before live transfer."
                                onChange={(e) => setSiteStatus(prev => ({...prev, message: e.target.value}))}
                            />
                        </label>
                        <label className="admin-banner-form-wide">
                            Details
                            <textarea
                                rows="3"
                                value={siteStatus.details}
                                disabled={!isSuperUser}
                                placeholder="Optional second line, such as expected completion time or who to contact."
                                onChange={(e) => setSiteStatus(prev => ({...prev, details: e.target.value}))}
                            />
                        </label>
                    </div>

                    <p className="admin-banner-note">
                        Use Online or Done with the banner turned off for normal production. The public site polls this setting roughly every 30 seconds.
                        {siteStatus.updatedAt && <> Last updated by {siteStatus.updatedBy || 'unknown'} on {new Date(siteStatus.updatedAt).toLocaleString()}.</>}
                    </p>
                </section>
            )}
        </div>
    );
};

export default AdminPanel;
