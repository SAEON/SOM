import React from 'react';
import './LoginStatus.css';

const LoginStatus = ({ user }) => {
    return (
        <div className="login-status">
            {user ? (
                <p>Logged in as: {user.username}</p>
            ) : (
                <p>Not logged in</p>
            )}
        </div>
    );
};

export default LoginStatus;
