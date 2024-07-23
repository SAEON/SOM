import React, { useState } from 'react';
import './NavBar.css';
import logo from '../images/transparent-medium-white.png'; // Adjust the path as necessary
import { NavLink as Link } from 'react-router-dom';
import { FaBars } from 'react-icons/fa';
import LoginRegisterPage from '../../pages/LoginRegisterPage';

const Navbar = () => {
    const [modalIsOpen, setModalIsOpen] = useState(false);

    const openModal = () => {
        setModalIsOpen(true);
    };

    const closeModal = () => {
        setModalIsOpen(false);
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
                <Link to="/LiveData" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    Live Data
                </Link>
                <Link to="/UnifiedMappingTable" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    Unified Mapping
                </Link>
                <Link to="/MappingSummaryTable" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    Mapping Summary
                </Link>
                <Link to="/about" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    About
                </Link>
                <Link to="/Analytics" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    Analytics
                </Link>
                <button onClick={openModal} className="nav-link">
                    Login/Register
                </button>
            </div>
            <LoginRegisterPage isOpen={modalIsOpen} closeModal={closeModal} />
        </nav>
    );
};

export default Navbar;
