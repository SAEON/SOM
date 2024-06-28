import React, { useState, useEffect } from 'react';
import MyHeatMap from './MyHeatMap';
import PieChart from './PieChart';
import Spinner from './Spinner';

const DataAvailabilityModalContent = ({ data, siteName, interval, startDate, endDate }) => {
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        if (data && data.length > 0) {
            setLoading(false);
        }
    }, [data]);

    if (loading) {
        return <Spinner />;
    }

    if (!data || data.length === 0) {
        return <div>No data available</div>;
    }

    const variables = [...new Set(data.map(item => item.display_field_name))].sort((a, b) => a.localeCompare(b));
    const dates = [...new Set(data.map(item => item.aggregated_timestamp))].sort((a, b) => new Date(a) - new Date(b));

    const heatmapData = data.map(item => {
        const variableIndex = variables.indexOf(item.display_field_name);
        const dateIndex = dates.indexOf(item.aggregated_timestamp);
        return [dateIndex, variableIndex, item.availability_percentage];
    });

    const totalAvailability = data.reduce((acc, item) => acc + item.availability_percentage, 0);
    const averageAvailability = totalAvailability / data.length;

    return (
        <div style={{ display: 'flex', height: '100%', width: '100%' }}>
            <div style={{ flex: 1, height: '100%' }}>
                <MyHeatMap data={heatmapData} siteName={siteName} interval={interval} dates={dates} variables={variables} />
            </div>
            <div style={{ width: '300px', fontSize: '10px', overflowY: 'auto', height: '100%' }}>
                <h3>Summary</h3>
                <PieChart averageAvailability={averageAvailability} />
                <strong>Average Availability: {averageAvailability.toFixed(2)}%</strong>
                {variables.map((variable, index) => {
                    const avg = data.filter(item => item.display_field_name === variable)
                            .reduce((acc, item) => acc + item.availability_percentage, 0) /
                        data.filter(item => item.display_field_name === variable).length;
                    return <p key={index}>{`${variable}: ${avg.toFixed(3)}% available`}</p>;
                })}
            </div>
        </div>
    );
};

export default DataAvailabilityModalContent;
