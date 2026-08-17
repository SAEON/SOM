import React, { useState, useEffect } from 'react';
import Modal from 'react-modal';
import axios from 'axios';
import { sectors } from './sectors';
import { disciplines } from './disciplines';
import { countries } from './countries'; // Use the static list
import './LoginRegisterPage.css';

const LoginRegisterPage = ({ isOpen, closeModal, setUser }) => {
    const [isRegistering, setIsRegistering] = useState(false);
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        username: '',
        password: '',
        sector: '',
        discipline: '',
        country: ''
    });
    const [error, setError] = useState('');

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({
            ...formData,
            [name]: value
        });
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        const { username, password } = formData;
        try {
            const response = await axios.post('/api/login', { username, password });
            console.log('Login successful:', response.data);
            setUser(response.data); // Set the user state after login
            localStorage.setItem('user', JSON.stringify(response.data)); // Store the user in localStorage
            setError(''); // Clear any previous error
            closeModal();
        } catch (error) {
            setError('Invalid username or password. Please try again.');
            console.error('Error logging in:', error);
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        try {
            const response = await axios.post('/api/register', formData);
            console.log('Register successful:', response.data);
            setUser(response.data); // Set the user state after registration
            localStorage.setItem('user', JSON.stringify(response.data)); // Store the user in localStorage
            setError(''); // Clear any previous error
            closeModal();
        } catch (error) {
            setError('Error registering. Please try again.');
            console.error('Error registering:', error);
        }
    };

    // Reset scroll position when modal opens/closes
    useEffect(() => {
        if (isOpen) {
            window.scrollTo(0, 0);
        }
    }, [isOpen]);

    return (
        <Modal
            isOpen={isOpen}
            onRequestClose={closeModal}
            contentLabel="Login/Register Modal"
            className="login-register-modal-content"
            overlayClassName="login-register-modal-overlay"
        >
            <div className="macos-window-controls">
                <div className="macos-button close" onClick={() => closeModal()}></div>
            </div>
            <div className="login-register-modal-header">
                <h2 className="login-register-title">{isRegistering ? 'Register' : 'Login'}</h2>
            </div>
            <div className="login-register-modal-body">
                {error && <div className="error-message">{error}</div>}
                {isRegistering ? (
                    <form onSubmit={handleRegister} className="login-register-form">
                        {/* Registration Form Fields */}
                        <div>
                            <label htmlFor="firstName" className="login-register-label">First Name:</label>
                            <input
                                type="text"
                                id="firstName"
                                name="firstName"
                                value={formData.firstName}
                                onChange={handleChange}
                                required
                                className="login-register-input"
                            />
                        </div>
                        <div>
                            <label htmlFor="lastName" className="login-register-label">Last Name:</label>
                            <input
                                type="text"
                                id="lastName"
                                name="lastName"
                                value={formData.lastName}
                                onChange={handleChange}
                                required
                                className="login-register-input"
                            />
                        </div>
                        <div>
                            <label htmlFor="email" className="login-register-label">Email:</label>
                            <input
                                type="email"
                                id="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                required
                                className="login-register-input"
                            />
                        </div>
                        <div>
                            <label htmlFor="username" className="login-register-label">Username:</label>
                            <input
                                type="text"
                                id="username"
                                name="username"
                                value={formData.username}
                                onChange={handleChange}
                                required
                                className="login-register-input"
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="login-register-label">Password:</label>
                            <input
                                type="password"
                                id="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                required
                                className="login-register-input"
                            />
                        </div>
                        <div>
                            <label htmlFor="sector" className="login-register-label">Sector:</label>
                            <select
                                id="sector"
                                name="sector"
                                value={formData.sector}
                                onChange={handleChange}
                                required
                                className="login-register-select"
                            >
                                <option value="">Select a sector</option>
                                {sectors.map(sector => (
                                    <option key={sector} value={sector}>{sector}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="discipline" className="login-register-label">Discipline:</label>
                            <select
                                id="discipline"
                                name="discipline"
                                value={formData.discipline}
                                onChange={handleChange}
                                required
                                className="login-register-select"
                            >
                                <option value="">Select a discipline</option>
                                {disciplines.map(discipline => (
                                    <option key={discipline} value={discipline}>{discipline}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="country" className="login-register-label">Country:</label>
                            <select
                                id="country"
                                name="country"
                                value={formData.country}
                                onChange={handleChange}
                                required
                                className="login-register-select"
                            >
                                <option value="">Select a country</option>
                                {countries.map(country => (
                                    <option key={country} value={country}>{country}</option>
                                ))}
                            </select>
                        </div>
                        <button type="submit" className="login-register-button">Register</button>
                        <button
                            type="button"
                            onClick={() => setIsRegistering(false)}
                            className="login-register-button"
                        >
                            Go to Login
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleLogin} className="login-register-form">
                        {/* Login Form Fields */}
                        <div>
                            <label htmlFor="username" className="login-register-label">Username:</label>
                            <input
                                type="text"
                                id="username"
                                name="username"
                                value={formData.username}
                                onChange={handleChange}
                                required
                                className="login-register-input"
                            />
                        </div>
                        <div>
                            <label htmlFor="password" className="login-register-label">Password:</label>
                            <input
                                type="password"
                                id="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                required
                                className="login-register-input"
                            />
                        </div>
                        <button type="submit" className="login-register-button">Login</button>
                        <button
                            type="button"
                            onClick={() => setIsRegistering(true)}
                            className="login-register-button"
                        >
                            Go to Register
                        </button>
                    </form>
                )}
            </div>
        </Modal>
    );
};

export default LoginRegisterPage;
