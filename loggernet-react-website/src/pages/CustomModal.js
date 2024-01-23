import React from 'react';
import { Rnd } from 'react-rnd';
import './CustomModal.css'; // Make sure this CSS file exists

const CustomModal = ({ isOpen, onClose, children }) => {
    if (!isOpen) return null;

    return (
        <div className="custom-modal-overlay">
            <Rnd
                default={{
                    x: (window.innerWidth * 0.1) / 2,
                    y: (window.innerHeight * 0.1) / 2,
                    width: window.innerWidth * 0.9, // Adjusted for larger size
                    height: window.innerHeight * 0.9, // Adjusted for larger size
                }}
                minWidth="600px" // Adjusted for larger size
                minHeight="400px" // Adjusted for larger size
                bounds="window"
                className="custom-modal-content"
                resizeHandleStyles={{
                    bottomRight: {
                        cursor: 'nwse-resize' // Cursor changed for resizing
                    }
                }}
            >
                <button className="close-button" onClick={onClose}>X</button>
                {children}
            </Rnd>
        </div>
    );
};

export default CustomModal;
