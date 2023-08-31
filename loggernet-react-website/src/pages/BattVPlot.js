import React, { useState, useEffect } from 'react';
import moment from 'moment-timezone';
import { Line } from 'react-chartjs-2';
import { Chart, CategoryScale, LinearScale, LineController, PointElement,LineElement,Tooltip } from 'chart.js';
Chart.register(CategoryScale, LinearScale, LineController,PointElement,LineElement,Tooltip);

const BattVPlot = ({ dataEndpoint }) => {
    const [data, setData] = useState([]);

    useEffect(() => {
        fetch(dataEndpoint)
            .then(response => response.json())
            .then(data => {
                setData(data);
            });
    }, [dataEndpoint]);

    // Extract the labels and battery voltage values from the data
    // const labels = data.map(entry => new Date(entry.time).toLocaleString());  // Convert time to a readable format
    const labels = data.map(entry => moment(entry.time).tz('UTC').format('YYYY-MM-DD HH:mm:ss'));

    const battvValues = data.map(entry => entry.battv || entry.battv_min);

    // Prepare the chart data and options
    const chartData = {
        labels: labels,
        datasets: [{
            label: 'Voltage over Time',
            data: battvValues,
            borderColor: 'rgba(75,192,192,1)',
            borderWidth: 2,
            fill: false
        }]
    };

    // Chart.js options (You can customize this further based on your requirements)
    const chartOptions = {
        scales: {
            x: {
                type: 'category',
                ticks: {
                    autoSkip: true,
                    maxTicksLimit: 10,
                    maxRotation: 45,    // Add this line to set the maximum rotation
                    minRotation: 45     // Add this line to set the minimum rotation to the same angle
                },
                title: {
                    display: true,
                    text: 'Time'
                }
            },
            y: {
                type: 'linear',
                ticks: {
                    beginAtZero: true
                },
                title: {
                    display: true,
                    text: 'Voltage'
                }
            }
        },
        tooltips: {
            enabled: true,
            mode: 'index',
            intersect: false
        }
    };

    return (
        <div>
            <Line data={chartData} options={chartOptions} />
        </div>
    );
}

export default BattVPlot;
