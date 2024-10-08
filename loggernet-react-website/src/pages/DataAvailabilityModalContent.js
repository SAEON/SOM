import React, { useState, useEffect } from 'react';
import MyHeatMap from './MyHeatMap';
import Spinner from './Spinner';

const DataAvailabilityModalContent = ({ data, siteName, interval, startDate, endDate }) => {
    const [loading, setLoading] = useState(true);
    const [isSummaryOpen, setIsSummaryOpen] = useState(false);
    const [copyAlert, setCopyAlert] = useState(false);

    useEffect(() => {
        setLoading(true);
        if (data && data.length > 0) {
            setLoading(false);
            // console.log('Data loaded:', data); // Log loaded data
        } else {
            console.warn("No data available or empty data array.");
        }
    }, [data]);

    if (loading) {
        return <Spinner />;
    }

    if (!data || data.length === 0) {
        return <div>No data available</div>;
    }

    // Extract unique variables and dates
    const variables = [...new Set(data.map(item => item.display_field_name))].sort((a, b) => a.localeCompare(b));
    const dates = [...new Set(data.map(item => item.aggregated_timestamp))].sort((a, b) => new Date(a) - new Date(b));

    // console.log('Unique variables:', variables); // Log unique variables
    // console.log('Unique dates:', dates); // Log unique dates

    // Calculate heatmap data for visualization
    const heatmapData = data.map(item => {
        const variableIndex = variables.indexOf(item.display_field_name);
        const dateIndex = dates.indexOf(item.aggregated_timestamp);
        const availability = parseFloat(item.availability_percentage) || 0; // Treat null as 0
        // console.log(`Mapping data for ${item.display_field_name} on ${item.aggregated_timestamp}: ${availability}`);
        return [dateIndex, variableIndex, isNaN(availability) ? 0 : availability];
    });

    // Calculate the average availability, treating null as 0
    const totalAvailability = data.reduce((acc, item) => acc + (parseFloat(item.availability_percentage) || 0), 0);
    const entryCount = data.length; // Count all entries, treating null as 0

    const averageAvailability = entryCount > 0 ? totalAvailability / entryCount : 0;
    const displaySiteName = `Data availability (${averageAvailability.toFixed(2)}% available)`;

    const toggleSummaryModal = () => {
        setIsSummaryOpen(!isSummaryOpen);
    };

    const handleCopyToClipboard = () => {
        const summaryText = `Average Availability: ${averageAvailability.toFixed(2)}%\n` +
            variables.map(variable => {
                const filteredData = data.filter(item => item.display_field_name === variable);
                const avg = filteredData.reduce((acc, item) => acc + (parseFloat(item.availability_percentage) || 0), 0) /
                    (filteredData.length > 0 ? filteredData.length : 1); // Prevent division by zero
                return `${variable}: ${avg.toFixed(1)}% available`;
            }).join('\n');

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(summaryText).then(() => {
                setCopyAlert(true);
                setTimeout(() => setCopyAlert(false), 2000);
            }).catch(err => {
                console.error('Failed to copy: ', err);
            });
        } else {
            const textArea = document.createElement('textarea');
            textArea.value = summaryText;
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                setCopyAlert(true);
                setTimeout(() => setCopyAlert(false), 2000);
            } catch (err) {
                console.error('Failed to copy using fallback: ', err);
            }
            document.body.removeChild(textArea);
        }
    };

    // return (
    //     <div style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
    //         <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '10px' }}>
    //             <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#333' }}>
    //                 {displaySiteName}
    //             </span>
    //             <button onClick={toggleSummaryModal} style={{ marginLeft: '10px', padding: '5px 10px', cursor: 'pointer' }}>
    //                 Show text summary
    //             </button>
    //         </div>
    //         {/* Scrollable container for heatmap */}
    //         <div style={{ height: '600px', overflowY: 'auto', marginBottom: '20px' }}>
    //             <MyHeatMap
    //                 data={heatmapData}
    //                 siteName={displaySiteName}
    //                 interval={interval}
    //                 dates={dates}
    //                 variables={variables}
    //             />
    //         </div>
    //
    //         {isSummaryOpen && (
    //             <div style={{
    //                 position: 'fixed',
    //                 top: '50%',
    //                 left: '50%',
    //                 transform: 'translate(-50%, -50%)',
    //                 background: 'white',
    //                 padding: '20px',
    //                 boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
    //                 zIndex: 1000,
    //                 width: '600px',
    //                 maxHeight: '400px',
    //                 overflowY: 'auto'
    //             }}>
    //                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
    //                     <div className="macos-window-controls">
    //                         <div className="macos-button close" onClick={() => toggleSummaryModal()}></div>
    //                     </div>
    //
    //                     <button
    //                         onClick={handleCopyToClipboard}
    //                         style={{ padding: '5px 10px', cursor: 'pointer' }}
    //                     >
    //                         Copy to Clipboard
    //                     </button>
    //                 </div>
    //                 <h3>Summary</h3>
    //                 <strong>Average Availability: {averageAvailability.toFixed(2)}%</strong>
    //                 {variables.map((variable, index) => {
    //                     const filteredData = data.filter(item => item.display_field_name === variable);
    //                     const avg = filteredData.reduce((acc, item) => acc + (parseFloat(item.availability_percentage) || 0), 0) /
    //                         (filteredData.length > 0 ? filteredData.length : 1); // Prevent division by zero
    //                     return <p key={index}>{`${variable}: ${avg.toFixed(1)}% available`}</p>;
    //                 })}
    //             </div>
    //         )}
    //
    //         {isSummaryOpen && (
    //             <div style={{
    //                 position: 'fixed',
    //                 top: 0,
    //                 left: 0,
    //                 right: 0,
    //                 bottom: 0,
    //                 background: 'rgba(0, 0, 0, 0.5)',
    //                 zIndex: 999
    //             }} onClick={toggleSummaryModal}></div>
    //         )}
    //
    //         {copyAlert && (
    //             <div style={{
    //                 position: 'fixed',
    //                 top: '10%',
    //                 left: '50%',
    //                 transform: 'translateX(-50%)',
    //                 background: '#4CAF50',
    //                 color: 'white',
    //                 padding: '10px 20px',
    //                 borderRadius: '5px',
    //                 zIndex: 1100,
    //                 boxShadow: '0 2px 5px rgba(0, 0, 0, 0.2)',
    //                 textAlign: 'center'
    //             }}>
    //                 Copied to clipboard!
    //             </div>
    //         )}
    //     </div>
    // );
    return (
        <div style={{ height: '100vh', width: '100vw', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '2%', padding: '1%' }}>
            <span style={{ fontSize: '1vw', fontWeight: 'bold', color: '#333' }}>
                {displaySiteName}
            </span>
                <button onClick={toggleSummaryModal} style={{ marginLeft: '1%', padding: '0.5% 1%', cursor: 'pointer' }}>
                    Show text summary
                </button>
            </div>
            {/* Scrollable container for heatmap */}
            <div style={{ height: '90vh', overflowY: 'hidden', marginBottom: '3%', padding: '0' }}>
                <MyHeatMap
                    data={heatmapData}
                    siteName={displaySiteName}
                    interval={interval}
                    dates={dates}
                    variables={variables}
                />
            </div>

            {isSummaryOpen && (
                <div style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: 'white',
                    padding: '2%',
                    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
                    zIndex: 1000,
                    width: '50vw',
                    maxHeight: '50vh',
                    overflowY: 'auto'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2%' }}>
                        <div className="macos-window-controls">
                            <div className="macos-button close" onClick={() => toggleSummaryModal()}></div>
                        </div>

                        <button
                            onClick={handleCopyToClipboard}
                            style={{ padding: '0.5% 1%', cursor: 'pointer' }}
                        >
                            Copy to Clipboard
                        </button>
                    </div>
                    <h3>Summary</h3>
                    <strong>Average Availability: {averageAvailability.toFixed(2)}%</strong>
                    {variables.map((variable, index) => {
                        const filteredData = data.filter(item => item.display_field_name === variable);
                        const avg = filteredData.reduce((acc, item) => acc + (parseFloat(item.availability_percentage) || 0), 0) /
                            (filteredData.length > 0 ? filteredData.length : 1); // Prevent division by zero
                        return <p key={index}>{`${variable}: ${avg.toFixed(1)}% available`}</p>;
                    })}
                </div>
            )}

            {isSummaryOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.5)',
                    zIndex: 999
                }} onClick={toggleSummaryModal}></div>
            )}

            {copyAlert && (
                <div style={{
                    position: 'fixed',
                    top: '10%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#4CAF50',
                    color: 'white',
                    padding: '1%',
                    borderRadius: '5px',
                    zIndex: 1100,
                    boxShadow: '0 2px 5px rgba(0, 0, 0, 0.2)',
                    textAlign: 'center'
                }}>
                    Copied to clipboard!
                </div>
            )}
        </div>
    );
};

export default DataAvailabilityModalContent;
