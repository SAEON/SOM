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
import OAuthCallback from './pages/OAuthCallback'; // Make sure to import your OAuth callback component


function App() {
    return (
        <Router>
            <Navbar />
            <Routes>
                <Route path='/Map' element={<Map />} />
                <Route path='/ScrollableTable3' element={<TestData />} />
                <Route path='/ScrollableTable2' element={<SummaryData />} />
                <Route path='/ScrollableTable' element={<Data />} />
                <Route exact path='/index' element={<Home />} />
                <Route path='/api/logged_in' element={<OAuthCallback />} /> {/* Add OAuth callback route */}
                {/*<Route path='/DataTable' element={<Datatest />} />*/}


                <Route path='/about' element={<About />} />
            </Routes>
        </Router>
    );
}

export default App;
