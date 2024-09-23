import React from 'react';

const Footer = () => {
    return (
        <footer style={{ textAlign: 'center', padding: '10px 0', background: '#f1f1f1', fontSize: '12px' }}>
            <p>&copy; {new Date().getFullYear()} SAEON. All rights reserved.</p>
            <p>
                DISCLAIMER: This site is currently in testing, with ongoing updates and additions. Data presented here
                is collected and stored from live loggernet feeds and is therefore raw and unprocessed. While SAEON strives to ensure
                accuracy, we are not responsible for errors or any damages arising from the use or reliance on the
                information provided.
            </p>
        </footer>
    );
};

export default Footer;
