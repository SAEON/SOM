import React, { useState } from 'react';
import './ScrollableTable.css';
import GenericData from './GenericData';
import BattVPlot from './BattVPlot';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons'
import { faTable, faChartLine } from '@fortawesome/free-solid-svg-icons';


const ScrollableTable = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState(null);
    const [activeSite, setActiveSite] = useState(null);

    const sites = [
        {
            name: "CR1000 Besemfontein",
            intervals: ["Public","Daily", "Hourly", "30 mins", "5 mins"]
        },
        {
            name: "CR1000 Cath Peak High Alt AWS",
            intervals: ["Public","Daily", "Hourly", "5 mins"]
        },
        {
            name: "CR1000 Cath Peak Mikes Pass AWS",
            intervals: ["Public","Daily", "Hourly", "5 mins"]
        },
        {
            name: "CR1000 Constantiaberg",
            intervals: ["Public","Table 1", "Table 2", "Table 3", "Table 4"]
        },
        {
            name: "CR1000 Dwarsberg Jonkershoek",
            intervals: ["Public","Table 1", "Table 2", "Table 3", "Table 4"]
        },
        {
            name: "CR1000 Vasi Science Centre AWS",
            intervals: ["Public","Daily", "Hourly", "5 mins"]
        }
    ];

    const generateEndpoints = (baseURL, intervals) => {
        const obj = {};

        for (let interval of intervals) {
            let lowercaseInterval = interval.toLowerCase().replace(' ', '-');
            let capitalizedInterval;

            switch (interval) {
                case "five_min":
                    capitalizedInterval = "5 mins";
                    break;
                case "thirty_min":
                    capitalizedInterval = "30 mins";
                    break;
                case "table1":
                    capitalizedInterval = "Table 1";
                    break;
                case "table2":
                    capitalizedInterval = "Table 2";
                    break;
                case "table3":
                    capitalizedInterval = "Table 3";
                    break;
                case "table4":
                    capitalizedInterval = "Table 4";
                    break;
                default:
                    capitalizedInterval = interval.charAt(0).toUpperCase() + interval.slice(1);
            }

            obj[capitalizedInterval] = {
                data: `${baseURL}/${lowercaseInterval}-data`,
                metadata: `${baseURL}/${lowercaseInterval}-metadata`,
                count: `${baseURL}/${lowercaseInterval}-count`,
                csv: `${baseURL}/download-${lowercaseInterval}-csv`
            }

            if (interval === "public") {
                obj[capitalizedInterval]['battv'] = `${baseURL}/latest-day-battv`;
            }
// new endpoint
            if (interval === "table2") {
                obj[capitalizedInterval]['battv'] = `${baseURL}/table2-battv`;
            }


        }

        return obj;
    }

    const intervals = ["public", "daily", "hourly", "five_min"];
    const intervals2 = ["public","daily", "hourly", "thirty_min", "five_min"];
    const constantiabergintervals = ["public","table1", "table2", "table3", "table4"];
    const siteEndpoints = {

        "CR1000 Besemfontein": generateEndpoints('/api/besemfontein', intervals2),
        "CR1000 Cath Peak High Alt AWS": generateEndpoints('/api/cr1000-cath-peak-high-alt-aws', intervals),
        "CR1000 Vasi Science Centre AWS": generateEndpoints('/api/vasi-science-centre-aws', intervals),
        "CR1000 Cath Peak Mikes Pass AWS": generateEndpoints('/api/cr1000-cath-peak-mikes-pass-aws', intervals),
        "CR1000 Constantiaberg": generateEndpoints('/api/constantiaberg', constantiabergintervals),
        "CR1000 Dwarsberg Jonkershoek": generateEndpoints('/api/cr1000-dwarsberg-jonkershoek', constantiabergintervals),

    };

    const handleModalOpen = (siteName, interval, contentType) => {
        setIsModalOpen(true);
        const endpoints = siteEndpoints[siteName][interval];
        let contentComponent;
        if (contentType === 'battv' || contentType === 'constantiaberg_table2_battv') {
            contentComponent = (
                <BattVPlot dataEndpoint={endpoints.battv} />
            );
        }



        else {
            contentComponent = (
                <GenericData
                    dataEndpoint={endpoints.data}
                    metadataEndpoint={endpoints.metadata}
                    countEndpoint={endpoints.count}
                    csvDownloadEndpoint={endpoints.csv}
                />
            );
        }
        setModalContent(contentComponent);
    };

    const handleModalClose = () => {
        setIsModalOpen(false);
        setModalContent(null);
    };

    return (
        <div className="scrollable-table-container">
            {isModalOpen && (
                <div className="modal-background">
                    <div className="modal-content">
                        <button className="close-button" onClick={handleModalClose}>
                            <i className="fa fa-times" aria-hidden="true"></i>
                        </button>
                        {modalContent}
                    </div>
                </div>
            )}

            <table>
                <tbody>
                {sites.map((site) => (
                    <React.Fragment key={site.name}>
                        <tr>
                            <td colSpan={6}>
                                <button className="site-name-button" onClick={() => setActiveSite(activeSite === site.name ? null : site.name)}>
                                    {site.name}
                                    <FontAwesomeIcon icon={activeSite === site.name ? faChevronUp : faChevronDown} />
                                </button>

                            </td>
                        </tr>
                        {activeSite === site.name && site.intervals.map(interval => (
                            <tr key={interval}>
                                <td colSpan={6}>
                                    <button className="view-data-button" onClick={() => handleModalOpen(site.name, interval, 'view')}>
                                        <FontAwesomeIcon icon={faTable} /> {interval} Data
                                    </button>


                                    {interval === "Public" && (
                                        <button className="view-data-button" onClick={() => handleModalOpen(site.name, interval, 'battv')}>
                                            <FontAwesomeIcon icon={faChartLine} /> Battv
                                        </button>

                                    )}
                                    {((site.name === "CR1000 Constantiaberg" && interval === "Table 2")) && (
                                        <button className="view-data-button" onClick={() => handleModalOpen(site.name, interval, 'constantiaberg_table2_battv')}>
                                            <FontAwesomeIcon icon={faChartLine} /> Battv
                                        </button>

                                    )}
                                </td>
                            </tr>
                        ))}
                    </React.Fragment>
                ))}
                </tbody>
            </table>
        </div>
    );
}

export default ScrollableTable;
