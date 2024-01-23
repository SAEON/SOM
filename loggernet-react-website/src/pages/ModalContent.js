import React from 'react';
import MyHeatMap from './MyHeatMap'; // Adjust the import path as necessary
import PieChart from './PieChart'; // Make sure this component exists and is implemented correctly

const ModalContent = ({ data, siteName, interval, averageAvailability }) => {
    // Ensure data and data.summary are available
    const summaryEntries = data && data.summary ? Object.entries(data.summary) : [];

    return (
        <div style={{ display: 'flex', height: '100%', width: '100%' }}>
            <MyHeatMap data={data.availabilityData} siteName={siteName} interval={interval} />
            <div style={{ width: '300px', fontSize: '10px', overflowY: 'auto', maxHeight: '400px' }}>
                <h3>Summary</h3>
                <PieChart averageAvailability={averageAvailability} />
                <strong>Average Availability: {averageAvailability.toFixed(2)}%</strong>
                {summaryEntries
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([key, value]) => (
                        <p key={key}>{`${key}: ${value.percentageMissing.toFixed(2)}% missing`}</p>
                    ))
                }
            </div>
        </div>
    );
};

export default ModalContent;
