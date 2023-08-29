import React, { useState } from 'react';
import './ScrollableTable.css';
import Vasi_science_centre_aws_daily from './vasi_science_centre_aws_daily';
import Vasi_science_centre_aws_hourly from './VasiScienceCentreAWSHourly';
import Vasi_science_centre_aws_five_minute from './VasiScienceCentreAWSFiveMin';

const ScrollableTable = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState(null);

    const sites = [
        {
            name: "CR1000 Besemfontein",
            intervals: ["Daily", "Hourly", "30 mins", "5 mins"]
        },
        {
            name: "CR1000 Cath Peak High Alt AWS",
            intervals: ["Daily", "Hourly", "5 mins"]
        },
        {
            name: "CR1000 Vasi Science Centre AWS",
            intervals: ["Daily", "Hourly", "5 mins"]
        }
    ];

    const getModalContentComponent = (siteName, interval) => {
        if (siteName === "CR1000 Vasi Science Centre AWS") {
            if (interval === "Daily") return <Vasi_science_centre_aws_daily />;
            if (interval === "Hourly") return <Vasi_science_centre_aws_hourly />;
            if (interval === "5 mins") return <Vasi_science_centre_aws_five_minute />;
        }

        if (siteName === "CR1000 Besemfontein") {
            //if (interval === "Daily") return <Vasi_science_centre_aws_daily />;
            // Add other intervals for this site as needed
        }
        if (siteName === " CR1000 Cath Peak_High Alt AWS") {
            //if (interval === "Daily") return <Vasi_science_centre_aws_daily />;
            // Add other intervals for this site as needed
        }



        return null;
    };

    const handleModalOpen = (siteName, interval) => {
        setIsModalOpen(true);
        const contentComponent = getModalContentComponent(siteName, interval);
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
                <thead>
                <tr>
                    <th>Site</th>
                    <th>Daily</th>
                    <th>Hourly</th>
                    <th>30 mins</th>
                    <th>5 mins</th>
                </tr>
                </thead>
                <tbody>
                {sites.map((site) => (
                    <tr key={site.name}>
                        <td>{site.name}</td>
                        {["Daily", "Hourly", "30 mins", "5 mins"].map(interval => (
                            site.intervals.includes(interval) ? (
                                <td key={interval}>
                                    <button className="view-data-button" onClick={() => handleModalOpen(site.name, interval)}>
                                        <i className="fa fa-eye" aria-hidden="true" style={{ marginRight: "5px" }}></i>
                                        View data
                                    </button>
                                </td>
                            ) : (
                                <td key={interval}></td>  // Render empty cell if interval not present for the site
                            )
                        ))}
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}

export default ScrollableTable;
