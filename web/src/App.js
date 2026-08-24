// src/App.js
import React, { useEffect, useState } from 'react';
import Modal from 'react-modal';
import Navbar from './components/Navbar';
import './App.css';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import TestData from './pages/LiveData';
import OAuthCallback from './pages/OAuthCallback';
import UnifiedMappingTable from './pages/UnifiedMappingTable';
import Data from './pages/Data';
import Analytics from './pages/Analytics';
import ApiReference from './pages/ApiReference';
import AdminPanel from './pages/AdminPanel';
import About from './pages/About';
import LoginRegisterPage from './pages/LoginRegisterPage';
import axios from 'axios';
import Footer from './components/Footer';
import MetadataPortal from './pages/MetadataPortal';
import PhentabSTS from './pages/PhentabSTS';
import Issues from './pages/Issues';

Modal.setAppElement('#root');

const technicianRoles = new Set(['Admin', 'SU']);

function formatStatusTime(value) {
    if (!value) return 'Not recorded';
    try {
        return new Intl.DateTimeFormat('en-ZA', {
            timeZone: 'Africa/Johannesburg',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(value));
    } catch {
        return value;
    }
}

function BackgroundSyncStatus({ user }) {
    const [status, setStatus] = useState(null);
    const [error, setError] = useState(null);
    const canView = technicianRoles.has(user?.role);

    useEffect(() => {
        if (!canView) {
            setStatus(null);
            setError(null);
            return undefined;
        }

        let mounted = true;
        let intervalId;

        const fetchStatus = async () => {
            try {
                const { data } = await axios.get('/api/background-status', { timeout: 12000 });
                if (mounted) {
                    setStatus(data);
                    setError(null);
                }
            } catch (err) {
                if (mounted) setError(err?.response?.data?.message || err?.message || 'Status unavailable');
            }
        };

        fetchStatus();
        intervalId = setInterval(fetchStatus, 15000);

        return () => {
            mounted = false;
            clearInterval(intervalId);
        };
    }, [canView]);

    if (!canView) return null;

    const readerRunning = Boolean(status?.reader?.running);
    const writerRunning = Boolean(status?.writer?.running);
    const isRunning = readerRunning || writerRunning;
    const isDisabled = status && status.enabled === false;
    const hasJobError = status?.reader?.lastError || status?.writer?.lastError;
    const activeLane = writerRunning ? status?.writer : readerRunning ? status?.reader : null;
    const progressTotal = Number(activeLane?.totalSteps || 0);
    const progressIndex = Number(activeLane?.currentStepIndex || 0);
    const subStepTotal = Number(activeLane?.subStepTotal || 0);
    const subStepIndex = Number(activeLane?.subStepIndex || 0);
    const subStepFraction = subStepTotal > 0 ? Math.min(1, Math.max(0, subStepIndex / subStepTotal)) : 0;
    const progressPercent = progressTotal > 0
        ? Math.max(4, Math.min(100, Math.round(((Math.max(0, progressIndex - 1) + subStepFraction) / progressTotal) * 100)))
        : null;

    let tone = 'idle';
    let title = 'Sync status loading';
    let detail = 'Checking background data jobs...';

    if (error) {
        tone = 'error';
        title = 'Sync status unavailable';
        detail = error;
    } else if (isDisabled) {
        tone = 'disabled';
        title = 'Background sync jobs disabled';
        detail = 'Set ENABLE_BACKGROUND_JOBS=true before live deployment so data, availability, summaries, and CSV exports update automatically.';
    } else if (isRunning) {
        tone = 'running';
        const laneName = writerRunning ? 'Writer' : 'Reader';
        title = `${laneName} pipeline running`;
        const stepLabel = progressTotal > 0 ? `Step ${progressIndex} of ${progressTotal}` : 'Working';
        const stepDetail = activeLane?.detail ? ` (${activeLane.detail})` : '';
        const liveSyncStats = [];
        if (Number.isFinite(Number(activeLane?.rowsTouchedThisRun)) && Number(activeLane?.rowsTouchedThisRun) > 0) {
            liveSyncStats.push(`${Number(activeLane.rowsTouchedThisRun).toLocaleString()} raw rows touched`);
        }
        if (Number.isFinite(Number(activeLane?.tablesWithDataThisRun)) && Number(activeLane?.tablesWithDataThisRun) > 0) {
            liveSyncStats.push(`${Number(activeLane.tablesWithDataThisRun).toLocaleString()} tables with new data`);
        }
        if (Number.isFinite(Number(activeLane?.tablesFailedThisRun)) && Number(activeLane?.tablesFailedThisRun) > 0) {
            liveSyncStats.push(`${Number(activeLane.tablesFailedThisRun).toLocaleString()} failed`);
        }
        const liveSyncDetail = liveSyncStats.length ? ` | ${liveSyncStats.join(' | ')}` : '';
        detail = `${stepLabel}: ${activeLane?.currentStep || activeLane?.lastCompletedStep || 'Working through scheduled tasks'}${stepDetail}${liveSyncDetail}`;
    } else if (status) {
        tone = hasJobError ? 'warning' : 'idle';
        title = hasJobError ? 'Last sync job needs attention' : 'Background sync jobs enabled';
        const nextWriter = formatStatusTime(status.writer?.nextRunAt);
        detail = hasJobError || `Idle now. Next writer check: ${nextWriter}. Last data sync: ${formatStatusTime(status.lastSynced)} SAST.`;
    }

    return (
        <section className={`background-sync-status background-sync-status--${tone}`} aria-live="polite">
            <div className="background-sync-status__copy">
                <strong>{title}</strong>
                <span>{detail}</span>
            </div>
            <div className="background-sync-status__meta">
                <span>Data sync: {formatStatusTime(status?.lastSynced)}</span>
                <span>Availability: {formatStatusTime(status?.lastDataAvailabilitySyncTime)}</span>
            </div>
            <div className="background-sync-status__track" aria-hidden="true">
                <div
                    className={`background-sync-status__bar ${isRunning ? 'is-running' : ''}`}
                    style={progressPercent ? { transform: `scaleX(${progressPercent / 100})` } : undefined}
                />
            </div>
        </section>
    );
}

function App() {
    const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')));
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

    // --- Site status banner state ---
    const [siteStatus, setSiteStatus] = useState({ active: true, message: '' });

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const response = await axios.get('/api/current_user');
                const userData = response.data;
                setUser(userData);
                localStorage.setItem('user', JSON.stringify(userData));
            } catch (error) {
                if (error.response && error.response.status === 401) {
                    console.log('No user is currently logged in.');
                    setUser(null);
                    localStorage.removeItem('user');
                } else {
                    console.error('Error fetching user:', error);
                }
            }
        };

        fetchUser();
    }, []);

    // --- Site status state at top of App()
    // const [siteStatus, setSiteStatus] = useState({ active: false, message: '' });

// Frontend-only refresh: poll + focus refresh + cache-busting
    useEffect(() => {
        let mounted = true;
        let intervalId;

        const fetchSiteStatus = async () => {
            try {
                const { data } = await axios.get('/api/public/site-status', { // ← changed path
                    params: { _t: Date.now() },               // cache buster
                    headers: { 'Cache-Control': 'no-cache' }, // hint the browser
                    timeout: 8000,
                });
                if (mounted) setSiteStatus(data || { active: false, message: '' });
            } catch (err) {
                console.warn('Site status fetch failed (frontend-only):', err?.message || err);
                if (mounted) {
                    setSiteStatus({
                        active: true,
                        showBanner: true,
                        type: 'offline',
                        status: 'offline',
                        severity: 'danger',
                        message: 'SAEON observations monitor API is temporarily unreachable.',
                    });
                }
            }
        };

        // initial load
        fetchSiteStatus();

        // poll every 30 seconds
        intervalId = setInterval(fetchSiteStatus, 30 * 1000);

        // refresh on tab focus/visibility
        const onFocus = () => fetchSiteStatus();
        const onVis = () => { if (document.visibilityState === 'visible') fetchSiteStatus(); };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVis);

        return () => {
            mounted = false;
            clearInterval(intervalId);
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVis);
        };
    }, []);

    const openLoginModal = () => setIsLoginModalOpen(true);
    const closeLoginModal = () => setIsLoginModalOpen(false);

    const handleLogout = () => {
        setUser(null);
        localStorage.removeItem('user');
    };

    return (
        <Router>
            {/* Global status banner: admins control visibility and type from the Admin Panel. */}
            {(siteStatus.showBanner === true || siteStatus.active === true) && (
                <div
                    className={`site-status-banner site-status-banner--${siteStatus.type || siteStatus.status || 'warning'}`}
                    role="status"
                    aria-live="polite"
                >
                    <strong>{siteStatus.message || 'SAEON observations monitor notice.'}</strong>
                    {siteStatus.details && <span>{siteStatus.details}</span>}
                </div>
            )}

            <Navbar openLoginModal={openLoginModal} user={user} onLogout={handleLogout} />
            <BackgroundSyncStatus user={user} />

            <Routes>
                <Route path="/" element={<Navigate to="/home" />} />
                <Route path="/home" element={<Home user={user} />} />
                <Route path="/Data" element={<Data user={user} />} />
                {user && (
                    <>
                        {(user.role === 'Admin' || user.role === 'SU') && (
                            <>
                                <Route path="/LiveData" element={<TestData user={user} />} />
                            </>
                        )}
                        {user.role === 'SU' && (
                            <>
                                <Route path="/UnifiedMappingTable" element={<UnifiedMappingTable />} />
                                <Route path="/adminpanel" element={<AdminPanel currentUser={user} />} />
                            </>
                        )}
                        {(user.role === 'Admin' || user.role === 'SU') && (
                            <>
                                <Route path="/metadata-portal" element={<MetadataPortal user={user} />} />
                                <Route path="/Analytics" element={<Analytics />} />
                                <Route path="/metadata/phentab-sts" element={<PhentabSTS />} />
                            </>
                        )}
                        <Route path="/api-reference" element={<ApiReference user={user} />} />
                        <Route path="/issues" element={<Issues user={user} />} />
                    </>
                )}
                <Route path="/api/logged_in" element={<OAuthCallback />} />
                <Route path="/about" element={<About user={user} />} />
            </Routes>

            <LoginRegisterPage
                isOpen={isLoginModalOpen}
                closeModal={closeLoginModal}
                setUser={(user) => {
                    setUser(user);
                    localStorage.setItem('user', JSON.stringify(user));
                }}
            />
            <Footer />
        </Router>
    );
}

export default App;
