import React, { useEffect, useState } from 'react';
import Modal from 'react-modal';
import Navbar from './components/Navbar';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import TestData from './pages/LiveData';
import OAuthCallback from './pages/OAuthCallback';
import UnifiedMappingTable from './pages/UnifiedMappingTable';
import Data from './pages/Data';
import Analytics from './pages/Analytics';
import ApiReference from './pages/ApiReference';  // Import the API Reference page
import AdminPanel from './pages/AdminPanel';
import About from './pages/About';
import LoginRegisterPage from './pages/LoginRegisterPage';
import axios from 'axios';
import Footer from './components/Footer'; // Import the footer component
// import Metadata from './pages/MetadataDisplay';

Modal.setAppElement('#root');

function App() {
    const [user, setUser] = useState(JSON.parse(localStorage.getItem('user'))); // Load user from localStorage
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const response = await axios.get('/api/current_user');
                const userData = response.data;
                setUser(userData);
                localStorage.setItem('user', JSON.stringify(userData)); // Store user in localStorage
            } catch (error) {
                if (error.response && error.response.status === 401) {
                    console.log('No user is currently logged in.');
                    setUser(null);
                    localStorage.removeItem('user'); // Remove user from localStorage if not logged in
                } else {
                    console.error('Error fetching user:', error);
                }
            }
        };

        fetchUser();
    }, []);

    const openLoginModal = () => setIsLoginModalOpen(true);
    const closeLoginModal = () => setIsLoginModalOpen(false);

    const handleLogout = () => {
        setUser(null);
        localStorage.removeItem('user'); // Clear user from localStorage on logout
    };

    return (
        <Router>
            <Navbar openLoginModal={openLoginModal} user={user} onLogout={handleLogout} />
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
                                <Route path="/Analytics" element={<Analytics />} />
                            </>
                        )}
                        {/*{(user.role === 'Admin' || user.role === 'SU') && (*/}
                        {/*    <>*/}
                                <Route path="/api-reference" element={<ApiReference user={user}/>} /> {/* Add the API reference route */}

                        {/*    </>*/}
                        {/*)}*/}

                    </>
                )}
                <Route path="/api/logged_in" element={<OAuthCallback />} />
                {/*<Route path="/metadata" element={<Metadata user={user} />} />*/}
                <Route path="/about" element={<About user={user} />} />
            </Routes>
            <LoginRegisterPage
                isOpen={isLoginModalOpen}
                closeModal={closeLoginModal}
                setUser={(user) => {
                    setUser(user);
                    localStorage.setItem('user', JSON.stringify(user)); // Update user in localStorage on login
                }}
            />
            <Footer /> {/* Add the footer component here */}
        </Router>
    );
}

export default App;
