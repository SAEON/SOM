import React, {useEffect} from 'react';
import {useNavigate} from 'react-router-dom';

const OAuthCallback = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');

        if (error) {
            console.error('OAuth error:', error);
            navigate('/error', {replace: true}); // Optionally, redirect to an error page
        } else if (code) {
            console.log('Authorization code:', code);
            // Here, you might want to exchange the code for a token
            navigate('/LiveData', {replace: true}); // Redirect to TestData component
        }
    }, [navigate]);

    return <div>Processing OAuth response...</div>;
};

export default OAuthCallback;
