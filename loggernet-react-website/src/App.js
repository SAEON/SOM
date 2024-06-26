import React from 'react';
import './App.css';
import Navbar from './components/Navbar';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/index';
import About from './pages/about';
import Map from './pages/Map';
import Data from './pages/ScrollableTable';
import SummaryData from './pages/ScrollableTable2';
import TestData from './pages/ScrollableTable3';
import OAuthCallback from './pages/OAuthCallback';
import UnifiedMappingTable from './pages/UnifiedMappingTable'; // Import the new page component

function App() {
    return (
        <Router>
            <Navbar />
            <Routes>
                <Route path='/Map' element={<Map />} />
                <Route path='/ScrollableTable3' element={<TestData />} />
                <Route path='/ScrollableTable2' element={<SummaryData />} />
                <Route path='/ScrollableTable' element={<Data />} />
                <Route exact path='/' element={<Home />} />
                <Route path='/api/logged_in' element={<OAuthCallback />} />
                <Route path='/UnifiedMappingTable' element={<UnifiedMappingTable />} /> {/* Add the new route */}
                <Route path='/about' element={<About />} />
            </Routes>
        </Router>
    );
}

export default App;
