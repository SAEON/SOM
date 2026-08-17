// src/pages/About.js

import React, {useEffect} from 'react';
import './About.css';
import {logInteraction} from "../utils/logInteraction"; // Import the logging function

const About = ({user}) => {

    console.log(user);

    useEffect(() => {// Log the interaction whether the user is logged in or not
        logInteraction('page_view', {viewport: {width: window.innerWidth, height: window.innerHeight}}, user);
    }, [user]);
    return (
        <div className="about-container">
            <header className="about-header">
                <h1>About the SAEON observations monitor</h1>
                <div className="about-header-text">
                    <p>
                        The SAEON observations monitor is a platform developed to monitor environmental data
                        across multiple sites in South Africa. The platform collects and stores data from specific
                        monitoring sites.
                        It handles frequent site configuration changes by storing both active and inactive records. This
                        ensures that historical data remains archived while current data is maintained. It features data
                        availability calculations, provides download options, and supports site analytics.

                    </p>
                </div>
            </header>

            {/*<section className="mission-section">*/}
            {/*    <h2>Our Mission</h2>*/}
            {/*    <p>*/}
            {/*        To advance the understanding of environmental change by delivering comprehensive, real-time data that supports long-term ecological research and monitoring across South Africa.*/}
            {/*    </p>*/}
            {/*</section>*/}

            <section className="who-we-are-section">
                <h2>Who We Are</h2>
                <p>
                    SAEON (South African Environmental Observation Network) is dedicated to environmental research and
                    monitoring, working with diverse stakeholders to ensure data accessibility for researchers and
                    decision-makers.
                </p>
            </section>

            {/*<section className="platform-details-section">*/}
            {/*    <h2>Platform Details</h2>*/}
            {/*    <p>*/}
            {/*        The LoggerNet Explorer handles frequent site configuration changes and stores historical data. It features daily data availability calculations, a unified mapping table, and a React-based web interface that displays site-specific metrics, provides download options, and supports in-depth analytics.*/}
            {/*    </p>*/}
            {/*</section>*/}

            <section className="features-section">
                <h2>Key Features</h2>
                <ul>
                    <li>Near real-time data monitoring and visualisation</li>
                    <li>Data availability calculations</li>
                    <li>Responsive, user-friendly interface for researchers</li>
                    <li>Seamless integration</li>
                </ul>
            </section>

            {/*<section className="team-section">*/}
            {/*    <h2>Our Team</h2>*/}
            {/*    <div className="team-list">*/}
            {/*        <div className="team-member">*/}
            {/*            <h3>Dr. Marc Pienaar</h3>*/}
            {/*            <p>Data Scientist, Team Lead</p>*/}
            {/*        </div>*/}
            {/*        <div className="team-member">*/}
            {/*            <h3>Leo Chiloane</h3>*/}
            {/*            <p>Data Node Manager, International Liaison</p>*/}
            {/*        </div>*/}
            {/*        <div className="team-member">*/}
            {/*            <h3>Caroline Mfopa</h3>*/}
            {/*            <p>Climate and Remote Sensing Specialist</p>*/}
            {/*        </div>*/}
            {/*        <div className="team-member">*/}
            {/*            <h3>Paul Godjin</h3>*/}
            {/*            <p>Monitoring Systems Technician</p>*/}
            {/*        </div>*/}
            {/*    </div>*/}
            {/*</section>*/}

            {/*<section className="testimonials-section">*/}
            {/*    <h2>What People Are Saying</h2>*/}
            {/*    <blockquote>*/}
            {/*        "The SAEON LoggerNet Explorer has revolutionized our data monitoring processes, providing real-time insights and data availability metrics that are invaluable for our research."*/}
            {/*        <cite>- Dr. Jane Doe, Environmental Scientist</cite>*/}
            {/*    </blockquote>*/}
            {/*    <blockquote>*/}
            {/*        "This platform's intuitive design and robust features have made environmental data more accessible and actionable for our team."*/}
            {/*        <cite>- John Smith, Research Analyst</cite>*/}
            {/*    </blockquote>*/}
            {/*</section>*/}


            <section id="efteon" className="efteon-section">
                <h2>EFTEON Flux Observations</h2>
                <p>
                    EFTEON operates flux towers across South Africa to measure ecosystem–atmosphere
                    exchanges. Flux datasets are processed (QA/QC, corrections) and
                    <strong> gap-filled</strong> to produce high-quality, continuous time series.
                </p>
                <p>
                    Learn more on the&nbsp;
                    <a href="https://efteon.saeon.ac.za/resources/" target="_blank" rel="noopener noreferrer">
                        EFTEON Resources
                    </a>
                    &nbsp;page.
                </p>
            </section>

            <section className="contact-section">
                <h2>Get in Touch</h2>
                <p>
                    <strong>Location:</strong> 8th Floor, The Towers South, Hertzog Boulevard, Foreshore, Cape Town,
                    8001<br/>
                    <strong>Phone:</strong> +27 21 100 3998<br/>
                    {/*<strong>Enquiries:</strong>  <a href="mailto:m.pienaar@saeon.nrf.ac.za">m.pienaar@saeon.nrf.ac.za</a><br /> <a href="mailto:f.mooi@saeon.nrf.ac.za">f.mooi@saeon.nrf.ac.za</a><br />*/}
                    <strong>Data Queries:</strong> <a href="mailto:curation@saeon.ac.za">curation@saeon.ac.za</a><br/>
                    <strong>Product Queries:</strong> <a
                    href="mailto:datascience@saeon.ac.za">datascience@saeon.ac.za</a>
                </p>
            </section>

            <section className="links-section">
                <h2>Related Links</h2>
                <ul>
                    <li><a href="https://www.saeon.ac.za" target="_blank" rel="noopener noreferrer">SAEON Official
                        Website</a></li>
                    <li><a href="https://ulwazi.saeon.ac.za" target="_blank" rel="noopener noreferrer">SAEON Ulwazi
                        Node</a></li>

                    <li><a href="https://catalogue.saeon.ac.za" target="_blank" rel="noopener noreferrer">SAEON Data
                        Catalogue</a></li>
                    <li><a href="https://observations.saeon.ac.za" target="_blank" rel="noopener noreferrer">SAEON
                        Observations Database</a></li>
                    <li><a href="https://sarva.saeon.ac.za" target="_blank" rel="noopener noreferrer">The South African
                        Risk and Vulnerability Atlas​</a></li>
                </ul>
            </section>


            <a href="/home" className="cta-button">Explore the Platform</a>

        </div>
    );
};

export default About;
