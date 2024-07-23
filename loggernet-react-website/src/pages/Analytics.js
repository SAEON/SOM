import React, { useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import worldMap from '../../src/assets/world.json';
import './Analytics.css';

// Register the map
echarts.registerMap('world', worldMap);

const Analytics = () => {
    const [data, setData] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await fetch('/api/analytics');
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const jsonData = await response.json();
                console.log('Fetched analytics data:', jsonData);
                setData(jsonData);
            } catch (error) {
                console.error('Error fetching analytics data:', error);
            }
        };

        fetchData();
    }, []);

    if (!data) return <p>Loading analytics data...</p>;

    if (!data.countries || !data.referrers || !data.endpoints || !data.downloads || !data.monthlyDownloads) {
        console.error('Unexpected data structure:', data);
        return <p>Error: Unexpected data structure</p>;
    }

    const mapData = data.countries.map(country => ({
        name: country.country,
        value: country.visit_count
    }));

    const referrerData = data.referrers.map(ref => ({
        name: ref.referrer,
        value: ref.referrer_count
    }));

    const endpointData = data.endpoints.map(endpoint => ({
        name: endpoint.endpoint,
        value: endpoint.visit_count
    }));

    const downloadData = data.downloads.map(download => ({
        name: `${download.site_name} - ${download.table_name} (Unique Downloads Per Day by IP)`,
        value: download.download_count
    }));

    const monthlyDownloadData = data.monthlyDownloads.map(download => ({
        name: download.month,
        value: download.download_count
    }));

    const mapOptions = {
        tooltip: { trigger: 'item' },
        visualMap: { min: 0, max: 1000, left: 'left', top: 'bottom', text: ['High', 'Low'], inRange: { color: ['#e0ffff', '#006edd'] } },
        series: [
            {
                name: 'Visits',
                type: 'map',
                map: 'world',
                roam: true,
                itemStyle: { emphasis: { label: { show: true } } },
                data: mapData
            }
        ]
    };

    const barOptions = (data) => ({
        tooltip: { trigger: 'axis' },
        xAxis: {
            type: 'category',
            data: data.map(item => item.name),
            axisLabel: { rotate: 45, interval: 0 }
        },
        yAxis: { type: 'value' },
        series: [{ data: data.map(item => item.value), type: 'bar' }],
        grid: { bottom: '20%' }
    });

    const pieOptions = (data) => ({
        tooltip: { trigger: 'item' },
        series: [
            {
                name: 'Data',
                type: 'pie',
                radius: '50%',
                data: data.map(item => ({ name: item.name, value: item.value })),
                emphasis: {
                    itemStyle: {
                        shadowBlur: 10,
                        shadowOffsetX: 0,
                        shadowColor: 'rgba(0, 0, 0, 0.5)'
                    }
                }
            }
        ]
    });

    return (
        <div className="analytics-dashboard">
            <div className="analytics-card">
                <h3>Visits by Country</h3>
                <div className="echarts-container">
                    <ReactECharts option={mapOptions} />
                </div>
            </div>
            <div className="analytics-card">
                <h3>Top 25 User Locations</h3>
                <div className="echarts-container">
                    <ReactECharts option={barOptions(mapData)} />
                </div>
            </div>
            <div className="analytics-card">
                <h3>Monthly Downloads Annually</h3>
                <div className="echarts-container">
                    <ReactECharts option={barOptions(monthlyDownloadData)} />
                </div>
            </div>
            <div className="analytics-card">
                <h3>100 Most Downloads Per Month/Year (Unique Downloads Per Day by IP)</h3>
                <div className="echarts-container">
                    <ReactECharts option={barOptions(downloadData)} />
                </div>
            </div>
            <div className="analytics-card">
                <h3>100 Most Visited Sites</h3>
                <div className="echarts-container">
                    <ReactECharts option={barOptions(endpointData)} />
                </div>
            </div>
            <div className="analytics-card">
                <h3>Top 25 Referrers</h3>
                <div className="echarts-container">
                    <ReactECharts option={barOptions(referrerData)} />
                </div>
            </div>
        </div>
    );
};

export default Analytics;
