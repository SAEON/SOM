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

const MyHeatMap = ({ data, siteName, interval }) => {
    const chartRef = useRef(null);

    useEffect(() => {
        if (chartRef.current && data && data.length > 0) {
            const myChart = echarts.init(chartRef.current);

            const variables = Object.keys(data[0].variables).sort((a, b) => a.localeCompare(b));
            const heatmapData = data.map((dayData, index) => {
                return variables.map(variable => {
                    // Calculate percentage available (100 - percentage missing)
                    const percentAvailable = 100 - dayData.variables[variable].percentageMissing;
                    return [index, variable, percentAvailable];
                });
            }).flat();

            const option = {
                title: {
                    text: `Data Availability for ${siteName} - ${interval}`,
                    left: 'center'
                },
                tooltip: {
                    position: 'top',
                    formatter: (params) => {
                        const value = params.value;
                        // Show percentage available in tooltip
                        return `${value[1]} on ${data[value[0]].date}: ${value[2]}% available`;
                    }
                },
                animation: false,
                grid: {
                    left: '10%',
                    right: '10%',
                    top: 30,
                    bottom: 80,
                    containLabel: true
                },
                xAxis: {
                    type: 'category',
                    data: data.map(dayData => dayData.date),
                    splitArea: { show: true },
                    name: 'Date', // X-axis label
                    nameLocation: 'middle', // Position of the label
                    nameGap: 30, // Gap between the label and the axis
                    nameTextStyle: {
                        fontWeight: 'bold' // Optional styling for the label
                    }
                },
                yAxis: {
                    type: 'category',
                    data: variables,
                    axisLabel: {
                        interval: 0,
                        rotate: 45,
                        fontSize: 10
                    },
                    splitArea: { show: true }
                    // name: 'Variables', // Y-axis label
                    // nameLocation: 'middle', // Position of the label
                    // nameGap: 50, // Gap between the label and the axis
                    // nameTextStyle: {
                    //     fontWeight: 'bold' // Optional styling for the label
                    // }
                },
                visualMap: {
                    min: 0,
                    max: 100,
                    calculable: true,
                    orient: 'horizontal',
                    left: 'center',
                    bottom: '3%',
                    text: ['High Availability', 'Low Availability'], // Text labels for the two ends of the scale
                    textStyle: {
                        color: '#000' // Text color
                    },
                    inRange: {
                        color: ['#d73027', '#fc8d59', '#fee08b', '#d9ef8b', '#1a9850'] // Gradient from red to green
                        
                    }
                },


                series: [{
                    name: 'Data Availability',
                    type: 'heatmap',
                    data: heatmapData,
                    emphasis: {
                        itemStyle: {
                            shadowBlur: 10,
                            shadowColor: 'rgba(0, 0, 0, 0.5)'
                        }
                    }
                }]
            };

            myChart.setOption(option);
        }
    }, [data, siteName, interval]);

    return <div ref={chartRef} style={{ height: "100%", width: "100%" }}></div>;
};

export default MyHeatMap;
