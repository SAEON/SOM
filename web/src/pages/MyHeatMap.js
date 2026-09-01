import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { GridComponent, TooltipComponent, VisualMapComponent, DataZoomComponent, ToolboxComponent } from 'echarts/components';
import { HeatmapChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([TooltipComponent, GridComponent, HeatmapChart, CanvasRenderer, VisualMapComponent, DataZoomComponent, ToolboxComponent]);

const MyHeatMap = ({
                       data,
                       dates,
                       variables,
                       rowHeight = 24,
                       minHeight = 400,
                       maxHeight = 820,
                       useVerticalScroll = false,
                   }) => {
    const chartRef = useRef(null);
    const variableCount = variables?.length || 1;
    const fullHeight = Math.max(minHeight, variableCount * rowHeight + 150);
    const heightPx = Math.min(maxHeight, fullHeight);
    const visibleRows = Math.max(1, Math.floor((heightPx - 150) / rowHeight));
    const needsVerticalNavigation = useVerticalScroll || variableCount > visibleRows;
    const initialVerticalEnd = Math.min(100, Math.max(8, Math.round((visibleRows / variableCount) * 100)));

    useEffect(() => {
        if (!chartRef.current || !data?.length) return;

        const inst = echarts.init(chartRef.current);
        const labelDates = dates.map(d => new Date(d).toISOString().slice(0, 10));
        const option = {
            backgroundColor: '#ffffff',
            animation: false,
            tooltip: {
                confine: true,
                borderWidth: 1,
                borderColor: '#cbd5e1',
                backgroundColor: 'rgba(255,255,255,0.98)',
                textStyle: { color: '#172033', fontSize: 13 },
                extraCssText: 'box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18); border-radius: 8px;',
                formatter: (p) => {
                    const [x, y, v] = p.value || [];
                    const date = new Date(dates[x]).toLocaleDateString('en-ZA');
                    const val = typeof v === 'number' ? v.toFixed(2) : '0.00';
                    return `<strong>${variables[y]}</strong><br/>${date}<br/><span style="color:#0f766e">${val}% available</span>`;
                },
            },
            toolbox: {
                right: 24,
                top: 6,
                itemSize: 15,
                feature: {
                    restore: { title: 'Reset zoom' },
                    saveAsImage: { title: 'Save chart' },
                },
            },
            grid: { left: 390, right: needsVerticalNavigation ? 74 : 28, top: 44, bottom: 86, containLabel: false },
            xAxis: {
                type: 'category',
                data: labelDates,
                name: 'Date',
                nameLocation: 'middle',
                nameGap: 46,
                nameTextStyle: { color: '#475569', fontWeight: 600 },
                splitArea: { show: false },
                splitLine: { show: false },
                axisLine: { lineStyle: { color: '#cbd5e1' } },
                axisTick: { lineStyle: { color: '#cbd5e1' } },
                axisLabel: { rotate: 0, hideOverlap: true, color: '#64748b', fontSize: 11 },
            },
            yAxis: {
                type: 'category',
                data: variables,
                splitArea: { show: false },
                splitLine: { show: false },
                axisLine: { lineStyle: { color: '#cbd5e1' } },
                axisTick: { show: false },
                axisLabel: {
                    interval: 0,
                    fontSize: 12,
                    color: '#64748b',
                    margin: 14,
                    width: 370,
                    overflow: 'truncate',
                    formatter: (value) => value,
                },
            },
            dataZoom: [
                { type: 'inside', xAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: true, moveOnMouseMove: true },
                { type: 'slider', xAxisIndex: 0, height: 18, bottom: 38, borderColor: '#d7e0ea', fillerColor: 'rgba(46, 107, 154, 0.18)', handleStyle: { color: '#2e6b9a' } },
                ...(needsVerticalNavigation ? [
                    { type: 'inside', yAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: false, moveOnMouseWheel: true },
                    { type: 'slider', yAxisIndex: 0, right: 14, width: 16, top: 46, bottom: 90, start: 0, end: initialVerticalEnd, zoomLock: false, borderColor: '#d7e0ea', fillerColor: 'rgba(46, 107, 154, 0.18)', handleStyle: { color: '#2e6b9a' } },
                ] : []),
            ],
            visualMap: {
                min: 0,
                max: 100,
                calculable: true,
                orient: 'horizontal',
                left: 'center',
                bottom: 6,
                itemHeight: 280,
                itemWidth: 14,
                inRange: { color: ['#d73027', '#f46d43', '#fee08b', '#a6d96a', '#1a9850'] },
                text: ['100%', '0%'],
                textStyle: { color: '#475569', fontSize: 12 },
            },
            series: [{
                type: 'heatmap',
                data,
                progressive: 6000,
                itemStyle: {
                    borderWidth: 0,
                },
                emphasis: {
                    itemStyle: {
                        borderColor: '#0f172a',
                        borderWidth: 1,
                    },
                },
            }],
        };

        inst.setOption(option);
        const resize = () => inst.resize();
        window.addEventListener('resize', resize);
        return () => { inst.dispose(); window.removeEventListener('resize', resize); };
    }, [data, dates, variables, heightPx, initialVerticalEnd, needsVerticalNavigation]);

    return <div ref={chartRef} style={{ width: '100%', height: `${heightPx}px` }} />;
};

export default MyHeatMap;
