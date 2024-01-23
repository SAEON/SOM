import React, { useEffect } from 'react';
import * as echarts from 'echarts/core';

const PieChart = ({ averageAvailability }) => {
    useEffect(() => {
        const pieChart = echarts.init(document.getElementById('pieChart'));
        const option = {
            // tooltip: {
            //     trigger: 'item',
            //     formatter: '{a} <br/>{b}: {c}% ({d}%)'
            // },
            series: [{
                name: 'Data Availability',
                type: 'pie',
                data: [
                    { value: Math.round(averageAvailability), name: 'Available', itemStyle: { color: '#1a9850' } }, // Green for available
                    { value: Math.round(100 - averageAvailability), name: 'Missing', itemStyle: { color: '#d73027' } } // Red for missing
                ],
                label: {
                    show: true,
                    formatter: '{b}: {d}%',
                    fontSize: 8, // Reducing font size
                    position: 'inside', // Positioning labels inside the pie sectors
                    textStyle: {
                        color: '#000' // Text color
                    },
                },
                emphasis: {
                    itemStyle: {
                        shadowBlur: 10,
                        shadowOffsetX: 0,
                        shadowColor: 'rgba(0, 0, 0, 0.5)'
                    }
                }
            }]
        };
        pieChart.setOption(option);
    }, [averageAvailability]);

    return <div id="pieChart" style={{ width: '200px', height: '200px' }}></div>;
};

export default PieChart;
