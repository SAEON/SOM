import React, { useState, useEffect } from 'react';
import Modal from 'react-modal';
import { sectors } from './sectors';
import { disciplines } from './disciplines';
import './LoginRegisterPage.css';

const LoginRegisterPage = ({ isOpen, closeModal }) => {
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
    const [countries, setCountries] = useState([]);

    useEffect(() => {
        const fetchCountries = async () => {
            try {
                const response = await fetch('https://restcountries.com/v3.1/all');
                const data = await response.json();
                const countryNames = data.map(country => country.name.common).sort();
                setCountries(countryNames);
            } catch (error) {
                console.error('Error fetching countries:', error);
            }
        };

        fetchCountries();
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({
            ...formData,
            [name]: value
        });
    };

    const handleLogin = (e) => {
        e.preventDefault();
        const { username, password } = formData;
        console.log('Login:', { username, password });
        // Replace with actual API call
        // const response = await axios.post('/api/login', { username, password });
    };

    const handleRegister = (e) => {
        e.preventDefault();
        console.log('Register:', formData);
        // Replace with actual API call
        // const response = await axios.post('/api/register', formData);
    };

    return (
        <Modal
            isOpen={isOpen}
            onRequestClose={closeModal}
            contentLabel="Login/Register Modal"
            className="login-register-modal-content"
            overlayClassName="login-register-modal-overlay"
        >
            <button onClick={closeModal} className="login-register-close-button">X</button>
            <div className="login-register-modal-header">
                <h2 className="login-register-title">{isRegistering ? 'Register' : 'Login/Register'}</h2>
            </div>
            <div className="login-register-modal-body">
                <button onClick={() => setIsRegistering(!isRegistering)} className="login-register-toggle-button">
                    {isRegistering ? 'Go to Login' : 'Go to Register'}
                </button>
                {isRegistering ? (
                    <form onSubmit={handleRegister} className="login-register-form">
                        <div>
                            <label htmlFor="firstName" className="login-register-label">First Name:</label>
                            <input type="text" id="firstName" name="firstName" value={formData.firstName} onChange={handleChange} required className="login-register-input" />
                        </div>
                        <div>
                            <label htmlFor="lastName" className="login-register-label">Last Name:</label>
                            <input type="text" id="lastName" name="lastName" value={formData.lastName} onChange={handleChange} required className="login-register-input" />
                        </div>
                        <div>
                            <label htmlFor="email" className="login-register-label">Email:</label>
                            <input type="email" id="email" name="email" value={formData.email} onChange={handleChange} required className="login-register-input" />
                        </div>
                        <div>
                            <label htmlFor="username" className="login-register-label">Username:</label>
                            <input type="text" id="username" name="username" value={formData.username} onChange={handleChange} required className="login-register-input" />
                        </div>
                        <div>
                            <label htmlFor="password" className="login-register-label">Password:</label>
                            <input type="password" id="password" name="password" value={formData.password} onChange={handleChange} required className="login-register-input" />
                        </div>
                        <div>
                            <label htmlFor="sector" className="login-register-label">Sector:</label>
                            <select id="sector" name="sector" value={formData.sector} onChange={handleChange} required className="login-register-select">
                                <option value="">Select a sector</option>
                                {sectors.map(sector => (
                                    <option key={sector} value={sector}>{sector}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="discipline" className="login-register-label">Discipline:</label>
                            <select id="discipline" name="discipline" value={formData.discipline} onChange={handleChange} required className="login-register-select">
                                <option value="">Select a discipline</option>
                                {disciplines.map(discipline => (
                                    <option key={discipline} value={discipline}>{discipline}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="country" className="login-register-label">Country:</label>
                            <select id="country" name="country" value={formData.country} onChange={handleChange} required className="login-register-select">
                                <option value="">Select a country</option>
                                {countries.map(country => (
                                    <option key={country} value={country}>{country}</option>
                                ))}
                            </select>
                        </div>
                        <button type="submit" className="login-register-button">Register</button>
                    </form>
                ) : (
                    <form onSubmit={handleLogin} className="login-register-form">
                        <div>
                            <label htmlFor="username" className="login-register-label">Username:</label>
                            <input type="text" id="username" name="username" value={formData.username} onChange={handleChange} required className="login-register-input" />
                        </div>
                        <div>
                            <label htmlFor="password" className="login-register-label">Password:</label>
                            <input type="password" id="password" name="password" value={formData.password} onChange={handleChange} required className="login-register-input" />
                        </div>
                        <button type="submit" className="login-register-button">Login</button>
                    </form>
                )}
            </div>
        </Modal>
    );
};

export default LoginRegisterPage;
