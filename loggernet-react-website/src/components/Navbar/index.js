import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './NavBar.css';
import logo from '../images/transparent-medium-white.png';
import { NavLink as Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import Modal from 'react-modal';
import { logInteraction } from '../../utils/logInteraction'; // Ensure this is the correct import path

const Navbar = ({ user, onLogout, openLoginModal }) => {
    const [totalValues, setTotalValues] = useState(null);
    const [lastUpdated, setLastUpdated] = useState('');
    const [lastDataAvailabilitySync, setLastDataAvailabilitySync] = useState('');
    const [totalDataValues, setTotalDataValues] = useState(null);
    const [totalRawValues, setTotalRawValues] = useState(null);
    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);


    useEffect(() => {
        const fetchTotalValues = async () => {
            try {
                const response = await axios.get('/api/total-field-values');
                setTotalDataValues(response.data.totalRawValues); // Set total data values first
                setTotalRawValues(response.data.totalDataValues); // Set total raw values second

                // Fetch the last synced dates
                const lastSyncedResponse = await axios.get('/api/last-synced');
                if (lastSyncedResponse.data) {
                    const { lastSynced, lastDataAvailabilitySyncTime } = lastSyncedResponse.data;

                    // Format the sync_time date and time for SAST
                    if (lastSynced) {
                        const lastSyncedDate = new Date(lastSynced);
                        setLastUpdated(lastSyncedDate.toLocaleString('en-ZA', {
                            timeZone: 'Africa/Johannesburg',
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                        }));
                    } else {
                        setLastUpdated('No sync date available');
                    }

                    // Format the last_data_availability_sync_time date and time for SAST
                    if (lastDataAvailabilitySyncTime) {
                        const lastAvailabilitySyncDate = new Date(lastDataAvailabilitySyncTime);
                        setLastDataAvailabilitySync(lastAvailabilitySyncDate.toLocaleString('en-ZA', {
                            timeZone: 'Africa/Johannesburg',
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                        }));
                    } else {
                        setLastDataAvailabilitySync('No data availability sync date available');
                    }
                }
            } catch (error) {
                console.error('Error fetching field values summary or last synced dates:', error);
            }
        };

        fetchTotalValues();
    }, []);


    const openInfoModal = () => {
        // Log the interaction when the info icon is clicked
        logInteraction('view_info_modal', { component: 'Navbar' }, user);
        setIsInfoModalOpen(true);
    };

    const closeInfoModal = () => setIsInfoModalOpen(false);

    return (
        <nav className="nav">
            <div className="nav-header">
                <div className="nav-logo">
                    <img src={logo} alt="SAEON Logo" />
                </div>
                <div className="nav-title-container">
                    <div className="title-and-status">
                        <h1 className="nav-title">SAEON terrestrial observations monitor</h1>
                        <div className="login-status">
                            {user ? (
                                <button className="logged-in-button" onClick={onLogout}>
                                    Logged in as: {user.username} (Logout)
                                </button>
                            ) : (
                                <p>Not logged in</p>
                            )}
                        </div>
                    </div>
                    {(totalDataValues !== null && totalRawValues !== null) && (
                        <div className="nav-subtitle">
                            <p>
                                Available data entries: {totalDataValues?.toLocaleString()} | Full dataset size: {totalRawValues?.toLocaleString()}
                                <FontAwesomeIcon icon={faInfoCircle} className="info-icon" onClick={openInfoModal} />
                            </p>
                            <p>
                                Data last synced: {lastUpdated}
                            </p>
                            <p>
                                Last data availability sync: {lastDataAvailabilitySync}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Info Modal */}
            <Modal
                isOpen={isInfoModalOpen}
                onRequestClose={closeInfoModal}
                contentLabel="Data Information"
                className="info-modal"
                overlayClassName="info-modal-overlay"
            >
                <div className="modal-content">
                    <h2>What do these numbers mean?</h2>
                    <p>
                        <strong>Available data entries:</strong> This represents the total number of data entries currently available in the Data tab.
                    </p>
                    <p>
                        <strong>Full dataset size:</strong> This represents the total number of raw data entries collected, including data from statistics, public tables, and other auxiliary sources that are not necessarily displayed in the Data tab.
                    </p>
                    <div className="macos-window-controls">
                        <div className="macos-button close"
                             onClick={() => closeInfoModal()}></div>

                    </div>
                    {/*<button onClick={closeInfoModal} className="close-modal-button">Close</button>*/}
                </div>

            </Modal>

            <div className="nav-menu">
                <Link to="/home" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    Home
                </Link>
                <Link to="/Data" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    Data
                </Link>
                {user ? (
                    <>


                        {user.role === 'SU' && (
                            <>
                                {/*<Link to="/LiveData" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>*/}
                                {/*    Raw Data*/}
                                {/*</Link>*/}
                                <Link to="/UnifiedMappingTable" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                                    Unified Mapping
                                </Link>
                                <Link to="/adminpanel" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                                    Admin Panel
                                </Link>
                            </>
                        )}
                        {/*{(user.role === 'Admin' || user.role === 'SU') && (*/}
                        {/*    <>*/}


                        {/*        /!*<Link to="/Analytics" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>*!/*/}
                        {/*        /!*    Analytics*!/*/}
                        {/*        /!*</Link>*!/*/}
                        {/*    </>*/}
                        {/*)}*/}
                        <Link to="/api-reference" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                            API Reference
                        </Link>
                        {(user.role === 'Admin' || user.role === 'SU') && (
                            <>
                                <Link to="/LiveData" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                                    Raw Data
                                </Link>
                        <Link to="/Analytics" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>

                            Analytics
                        </Link>
                            </>
                        )}
                        {/*<li><Link to="/api-reference">API Reference</Link></li> /!* Link to API Reference *!/*/}
                    </>
                ) : (
                    <button onClick={openLoginModal} className="nav-link styled-button2">Login</button>
                )}
                {/*<Link to="/metadata" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>*/}
                {/*    Field Metadata*/}
                {/*</Link>*/}

                <Link to="/about" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    About
                </Link>
            </div>
        </nav>
    );
};

export default Navbar;
