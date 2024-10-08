import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import {
    GridComponent,
    TooltipComponent,
    VisualMapComponent
} from 'echarts/components';
import { HeatmapChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
    TooltipComponent,
    GridComponent,
    HeatmapChart,
    CanvasRenderer,
    VisualMapComponent
]);

const MyHeatMap = ({ data, siteName, interval, dates, variables }) => {
    const chartRef = useRef(null);

    useEffect(() => {
        if (chartRef.current && data && data.length > 0) {
            // Dispose of any previous chart instance to fully reset
            echarts.dispose(chartRef.current);

            const myChart = echarts.init(chartRef.current);

            const option = {
                tooltip: {
                    position: 'top',
                    formatter: (params) => {
                        const value = params.value;

                        // Extract and format the date to remove the time portion
                        const rawDate = dates[value[0]];
                        const formattedDate = new Date(rawDate).toLocaleDateString('en-ZA'); // Format date to 'YYYY-MM-DD'

                        const formattedValue = value[2] ? value[2].toFixed(2) : '0.00';

                        // Use the formatted date in the tooltip
                        return `${variables[value[1]]} on ${formattedDate}: ${formattedValue}% available`;
                    }
                },
                animation: false,
                grid: {
                    left: '2%',
                    right: '2%',
                    top: '0%',
                    bottom: '15%%',
                    containLabel: true
                },
                xAxis: {
                    type: 'category',
                    data: dates.map(date => new Date(date).toISOString().split('T')[0]), // Keep date format as yyyy-mm-dd
                    splitArea: { show: true },
                    name: 'Date',
                    nameLocation: 'middle',
                    nameGap: 30,
                    nameTextStyle: {
                        fontWeight: 'bold'
                    },
                    axisLabel: {
                        rotate: 0
                    }
                },
                yAxis: {
                    type: 'category',
                    data: variables,
                    splitArea: { show: true },
                    nameTextStyle: {
                        fontSize: 10
                    },
                    axisLabel: {
                        interval: 0,
                        fontSize: 10,
                        margin: 8 // Increase margin between axis and labels
                    }
                },
                visualMap: {
                    min: 0,
                    max: 100,
                    calculable: true,
                    orient: 'horizontal',
                    right: '5%',
                    bottom: '4%',
                    text: ['High Availability', 'Low Availability'],
                    textStyle: {
                        color: '#000'
                    },
                    inRange: {
                        color: ['#d73027', '#fc8d59', '#fee08b', '#d9ef8b', '#1a9850']
                    }
                },
                series: [{
                    name: 'Data Availability',
                    type: 'heatmap',
                    data: data,
                    emphasis: {
                        itemStyle: {
                            shadowBlur: 10,
                            shadowColor: 'rgba(0, 0, 0, 0.5)'
                        }
                    }
                }]
            };

            myChart.setOption(option);

            // Handle window resize for responsive charts
            window.addEventListener('resize', myChart.resize);

            return () => {
                // Dispose of the chart instance on cleanup
                myChart.dispose();
                window.removeEventListener('resize', myChart.resize);
            };
        }
    }, [data, dates, variables]);

    return (
        <div style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
            <div ref={chartRef} style={{ height: "100%", width: "90%" }}></div>
        </div>
    );
};

export default MyHeatMap;
