import React, { useState, useEffect } from 'react';
import MyHeatMap from './MyHeatMap';
import PieChart from './PieChart';
import axios from 'axios';

const ModalContent = ({ siteName, interval, startDate, endDate }) => {
    const [data, setData] = useState(null);
    const [averageAvailability, setAverageAvailability] = useState(0);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Log the parameters being sent to the backend
                console.log('Fetching data availability with parameters:');
                console.log('startDate:', startDate);
                console.log('endDate:', endDate);
                console.log('siteName:', siteName);
                console.log('interval:', interval);

                const response = await axios.get('/api/data-availability', {
                    params: {
                        startDate,
                        endDate,
                        siteName,
                        interval
                    }
                });
                const availabilityData = response.data;

                // Log the data received from the backend
                console.log('Data received:', availabilityData);

                // Calculate average availability
                const totalAvailability = availabilityData.reduce((acc, item) => acc + item.availability_percentage, 0);
                const average = totalAvailability / availabilityData.length;

                setData(availabilityData);
                setAverageAvailability(average);
            } catch (error) {
                console.error('Error fetching data availability:', error);
            }
        };

        fetchData();
    }, [startDate, endDate, siteName, interval]);

    if (!data) return <div>Loading...</div>;

    return (
        <div style={{ display: 'flex', height: '100%', width: '100%' }}>
            <MyHeatMap data={data} siteName={siteName} interval={interval} />
            <div style={{ width: '300px', fontSize: '10px', overflowY: 'auto', maxHeight: '400px' }}>
                <h3>Summary</h3>
                <PieChart averageAvailability={averageAvailability} />
                <strong>Average Availability: {averageAvailability.toFixed(2)}%</strong>
                {data.map((item, index) => (
                    <p key={index}>{`${item.display_field_name}: ${item.availability_percentage.toFixed(3)}% available`}</p>
                ))}
            </div>
        </div>
    );
};

export default ModalContent;
