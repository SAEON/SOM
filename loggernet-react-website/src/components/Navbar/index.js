import React from "react";
import './NavBar.css';
import logo from '../images/transparent-medium-white.png'; // Adjust the path as necessary
import { NavLink as Link } from "react-router-dom";
import { FaBars } from "react-icons/fa";

const Navbar = () => {
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
                <Link className="nav-link" to="/Map"
                      className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    Monitoring Locations
                </Link>
                <Link className="nav-link" to="/ScrollableTable"
                      className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    Data Explorer
                </Link>
                {/*<Link className="nav-link" to="/index"*/}
                {/*      className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>*/}
                {/*    Loggernet site details*/}
                {/*</Link>*/}
                <Link className="nav-link" to="/about"
                      className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    About
                </Link>
            </div>
        </nav>
    );
};

export default Navbar;

