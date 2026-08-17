import React, {useEffect} from 'react';
import * as echarts from 'echarts/core';

const PieChart = ({averageAvailability}) => {
    useEffect(() => {
        const pieChart = echarts.init(document.getElementById('pieChart'));

        const roundedAvailable = parseFloat(averageAvailability.toFixed(1));
        const roundedMissing = parseFloat((100 - averageAvailability).toFixed(1));

        const option = {
            series: [{
                name: 'Data Availability',
                type: 'pie',
                data: [
                    {value: roundedAvailable, name: 'Available', itemStyle: {color: '#1a9850'}},
                    {value: roundedMissing, name: 'Missing', itemStyle: {color: '#d73027'}}
                ],
                label: {
                    show: true,
                    formatter: '{b}: {d}%',
                    fontSize: 8,
                    position: 'inside',
                    textStyle: {
                        color: '#000'
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

    return <div id="pieChart" style={{width: '200px', height: '200px'}}></div>;
};

export default PieChart;
