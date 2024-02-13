import React from 'react';
import './App.css';
import Navbar from './components/Navbar';
import { BrowserRouter as Router, Routes, Route }
    from 'react-router-dom';
import Home from './pages/index';
import About from './pages/about';
import Map from './pages/Map';
// import Datatest from './pages/vasi_science_centre_aws_daily';
import Data from './pages/ScrollableTable';


function App() {
    return (
        <Router>
            <Navbar />
            <Routes>
                <Route path='/Map' element={<Map />} />
                <Route path='/ScrollableTable' element={<Data />} />
                <Route exact path='/index' element={<Home />} />
                {/*<Route path='/DataTable' element={<Datatest />} />*/}


                <Route path='/about' element={<About />} />
            </Routes>
        </Router>
    );
}

export default App;
