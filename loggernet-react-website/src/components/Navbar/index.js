import React, { useState } from "react";
import './NavBar.css';
import logo from '../images/transparent-medium-white.png'; // Adjust the path as necessary
import { NavLink as Link } from "react-router-dom";
import { FaBars } from "react-icons/fa";

const Navbar = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = () => {
        // Directly redirect the user to the OAuth login URL
        // This assumes that the server-side '/api/login' endpoint will redirect to the OAuth provider
        window.location = '/api/login';
    };



    return (
        <nav className="nav">
            <div className="nav-header">
                <div className="nav-logo">
                    <img src={logo} alt="SAEON Logo" />
                </div>
                <h1 className="nav-title">SAEON Loggernet Monitor</h1>
                <FaBars className="nav-bars" />
            </div>
            <div className="nav-menu">
                <Link to="/Map" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    Monitoring Locations
                </Link>
                <Link to="/ScrollableTable3" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    Test
                </Link>
                <Link to="/ScrollableTable2" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    Summary
                </Link>
                <Link to="/ScrollableTable" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    Raw Data
                </Link>
                <Link to="/about" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    About
                </Link>
                <button onClick={handleLogin} className="nav-link" disabled={isLoading}>
                    {isLoading ? 'Logging In...' : 'Login'}
                </button> {/* Enhanced login button with loading state */}
            </div>
            {error && <div className="nav-error">{error}</div>} {/* Display error message if any */}
        </nav>
    );
};

export default Navbar;
