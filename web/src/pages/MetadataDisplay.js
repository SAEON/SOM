import React, {useEffect, useState} from 'react';

function MetadataDisplay({user}) {
    const [metadata, setMetadata] = useState({fieldNames: [], fieldUnits: []});
    const [isFieldNamesExpanded, setIsFieldNamesExpanded] = useState(false);
    const [isFieldUnitsExpanded, setIsFieldUnitsExpanded] = useState(false);

    useEffect(() => {
        // Fetch metadata from the backend
        fetch('/api/field-metadata')
            .then(response => response.json())
            .then(data => setMetadata(data))
            .catch(error => console.error('Error fetching metadata:', error));
    }, []);

    return (
        <div>
            <div className="expandable-row">
                <button onClick={() => setIsFieldNamesExpanded(!isFieldNamesExpanded)}>
                    <span>
                        <i className="folder-icon">
                            {isFieldNamesExpanded ? '📂' : '📁'} {/* Open or closed folder */}
                        </i>
                        {isFieldNamesExpanded ? "Hide Variable Descriptions" : "Show Variable Descriptions"}
                    </span>
                </button>
                {isFieldNamesExpanded && (
                    <table className="metadata-table">
                        <thead>
                        <tr>
                            <th>Variable</th>
                            <th>Description</th>
                        </tr>
                        </thead>
                        <tbody>
                        {metadata.fieldNames.map((field, index) => (
                            <tr key={index}>
                                <td>{field.display_field_name}</td>
                                <td>{field.description || 'No description available'}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="expandable-row">
                <button onClick={() => setIsFieldUnitsExpanded(!isFieldUnitsExpanded)}>
                    <span>
                        <i className="folder-icon">
                            {isFieldUnitsExpanded ? '📂' : '📁'} {/* Open or closed folder */}
                        </i>
                        {isFieldUnitsExpanded ? "Hide Unit Descriptions" : "Show Unit Descriptions"}
                    </span>
                </button>
                {isFieldUnitsExpanded && (
                    <table className="metadata-table">
                        <thead>
                        <tr>
                            <th>Unit</th>
                            <th>Description</th>
                        </tr>
                        </thead>
                        <tbody>
                        {metadata.fieldUnits.map((unit, index) => (
                            <tr key={index}>
                                <td>{unit.units}</td>
                                <td>{unit.units_description || 'No description available'}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

export default MetadataDisplay;
