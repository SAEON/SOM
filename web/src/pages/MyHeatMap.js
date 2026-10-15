import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { GridComponent, TooltipComponent, VisualMapComponent, DataZoomComponent, ToolboxComponent, TitleComponent } from 'echarts/components';
import { HeatmapChart } from 'echarts/charts';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([TooltipComponent, GridComponent, HeatmapChart, CanvasRenderer, VisualMapComponent, DataZoomComponent, ToolboxComponent, TitleComponent]);

const MyHeatMap = ({
                       data,
                       dates,
                       variables,
                       rowHeight = 24,
                       minHeight = 400,
                       maxHeight = 820,
                       useVerticalScroll = false,
                       inverseRows = false,
                       overviewRows = false,
                       chartTitle = null,
                   }) => {
    const chartRef = useRef(null);
    const instanceRef = useRef(null);
    const variableCount = variables?.length || 1;
    const fullHeight = Math.max(minHeight, variableCount * rowHeight + 150);
    const heightPx = Math.min(maxHeight, fullHeight);
    const visibleRows = Math.max(1, Math.floor((heightPx - 150) / rowHeight));
    const needsVerticalNavigation = useVerticalScroll || variableCount > visibleRows;
    const initialVerticalEnd = Math.min(100, Math.max(8, Math.round((visibleRows / variableCount) * 100)));

    useEffect(() => {
        if (!chartRef.current) return;
        const inst = echarts.init(chartRef.current);
        instanceRef.current = inst;
        const resize = () => {if (!inst.isDisposed()) inst.resize();};
        window.addEventListener('resize', resize);
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
        observer?.observe(chartRef.current);
        return () => {observer?.disconnect(); window.removeEventListener('resize', resize); instanceRef.current = null; inst.dispose();};
    }, []);

    useEffect(() => {
        const inst = instanceRef.current;
        if (!inst || !data?.length) return;
        const labelDates = dates.map(d => new Date(d).toISOString().slice(0, 10));
        const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
        const option = {
            backgroundColor: '#ffffff',
            animation: false,
            title: chartTitle ? {text: chartTitle, top: 12, left: 16, textStyle: {fontSize: 13, fontWeight: 600, color: '#475569'}} : undefined,
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
                    return `<strong>${escapeHtml(variables[y])}</strong><br/>${date}<br/><span style="color:#0f766e">${val}% available</span>`;
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
                name: overviewRows ? '' : 'Date',
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
                inverse: inverseRows,
                splitArea: { show: false },
                splitLine: { show: false },
                axisLine: { lineStyle: { color: '#cbd5e1' } },
                axisTick: { show: false },
                axisLabel: {
                    interval: 0,
                    fontSize: overviewRows ? 11 : 12,
                    lineHeight: overviewRows ? 17 : 14,
                    color: '#64748b',
                    margin: 14,
                    width: 370,
                    overflow: 'truncate',
                    formatter: (value) => {
                        if (!overviewRows) return value;
                        const split = value.lastIndexOf(' - ');
                        const site = split >= 0 ? value.slice(0, split) : value;
                        const table = split >= 0 ? value.slice(split + 3) : '';
                        return (site.length > 43 ? site.slice(0, 40) + '…' : site) + '\n' + table;
                    },
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
                calculable: !overviewRows,
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
                progressive: overviewRows ? 0 : 6000,
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

        inst.setOption(option, {notMerge: true});
        inst.resize();
    }, [data, dates, variables, heightPx, initialVerticalEnd, needsVerticalNavigation, inverseRows, overviewRows, chartTitle]);

    return <div ref={chartRef} style={{ width: '100%', height: `${heightPx}px` }} />;
};

export default MyHeatMap;
