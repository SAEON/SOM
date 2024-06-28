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
            const myChart = echarts.init(chartRef.current);

            const option = {
                title: {
                    text: `Data Availability for ${siteName}`,
                    left: 'center'
                },
                tooltip: {
                    position: 'top',
                    formatter: (params) => {
                        const value = params.value;
                        return `${variables[value[1]]} on ${dates[value[0]]}: ${value[2].toFixed(2)}% available`;
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
                    data: dates,
                    splitArea: { show: true },
                    name: 'Date',
                    nameLocation: 'middle',
                    nameGap: 30,
                    nameTextStyle: {
                        fontWeight: 'bold'
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
                },
                visualMap: {
                    min: 0,
                    max: 100,
                    calculable: true,
                    orient: 'horizontal',
                    left: 'center',
                    bottom: '3%',
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
        }
    }, [data, siteName, interval, dates, variables]);

    return <div ref={chartRef} style={{ height: "100%", width: "100%" }}></div>;
};

export default MyHeatMap;
