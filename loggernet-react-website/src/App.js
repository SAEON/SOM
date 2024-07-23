import React from 'react';
import './App.css';
import Modal from 'react-modal';
import Navbar from './components/Navbar';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/index';
import About from './pages/about';
import Map from './pages/Map';
import TestData from './pages/LiveData';
import OAuthCallback from './pages/OAuthCallback';
import UnifiedMappingTable from './pages/UnifiedMappingTable';
import MappingSummaryTable from './pages/MappingSummaryTable';
import DataAvailabilityModalContent from './pages/DataAvailabilityModalContent';
import Analytics from './pages/Analytics';
// import 'bootstrap/dist/css/bootstrap.min.css';

Modal.setAppElement('#root'); // Ensure this is called only once

function App() {
    return (
        <Router>
            <Navbar />
            <Routes>
                <Route path='/' element={<Home />} />
                <Route path='/Map' element={<Map />} />
                <Route path='/LiveData' element={<TestData />} />
                <Route path='/api/logged_in' element={<OAuthCallback />} />
                <Route path='/UnifiedMappingTable' element={<UnifiedMappingTable />} />
                <Route path='/MappingSummaryTable' element={<MappingSummaryTable />} />
                <Route path='/about' element={<About />} />
                <Route path='/data-availability' element={<DataAvailabilityModalContent />} />
                <Route path='/Analytics' element={<Analytics />} />
            </Routes>
        </Router>
    );
}

export default App;
