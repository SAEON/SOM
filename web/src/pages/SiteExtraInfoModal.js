import React, { useEffect, useMemo, useState } from 'react';
import Modal from 'react-modal';

/**
 * props:
 * - isOpen
 * - onRequestClose()
 * - schema: { fields: [ { name, label, type, required, options?, group? } ] }
 * - initialValues: { [name]: value }
 * - serverName: string
 * - onSaved(): callback to run after successful save (e.g., openConsentModal)
 */
export default function SiteExtraInfoModal({
                                               isOpen,
                                               onRequestClose,
                                               schema,
                                               initialValues = {},
                                               serverName,
                                               onSaved
                                           }) {
    const [values, setValues] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        setValues(initialValues || {});
    }, [initialValues, isOpen]);

    const fields = useMemo(() => schema?.fields || [], [schema]);

    const handleChange = (name, val) => {
        setValues(prev => ({ ...prev, [name]: val }));
    };

    const requiredMissing = () => {
        return fields
            .filter(f => f.required)
            .filter(f => {
                const v = values[f.name];
                if (f.type === 'checkbox') return !Boolean(v);
                return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
            })
            .map(f => f.label || f.name);
    };

    const handleSubmit = async () => {
        setError('');
        const missing = requiredMissing();
        if (missing.length) {
            setError(`Please complete required fields: ${missing.join(', ')}`);
            return;
        }

        setSubmitting(true);
        try {
            const res = await fetch('/api/public/user_site_info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include', // keep session/JWT cookies
                body: JSON.stringify({
                    serverName,
                    data: values,
                    popiaConsent: !!values.popia_consent
                })
            });
            if (!res.ok) {
                const msg = await res.json().catch(() => ({}));
                throw new Error(msg?.error || 'Failed to save details');
            }
            onRequestClose();
            onSaved?.();
        } catch (e) {
            setError(e.message || 'Failed to save details');
        } finally {
            setSubmitting(false);
        }
    };

    // simple grouped layout (group === 'study' etc.)
    const groups = useMemo(() => {
        const map = {};
        fields.forEach(f => {
            const g = f.group || '_default';
            map[g] = map[g] || [];
            map[g].push(f);
        });
        return map;
    }, [fields]);

    const renderField = (f) => {
        const v = values[f.name] ?? '';
        const common = {
            id: f.name,
            name: f.name,
            required: !!f.required,
            onChange: (e) => handleChange(f.name, e.target.value),
            value: v
        };

        switch ((f.type || 'text').toLowerCase()) {
            case 'select':
                return (
                    <select {...common}>
                        <option value="">-- Select --</option>
                        {(f.options || []).map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                        ))}
                    </select>
                );
            case 'textarea':
                return (
                    <textarea {...common} rows={4} />
                );
            case 'email':
            case 'tel':
            case 'month':
            case 'text':
                return (
                    <input type={f.type} {...common} />
                );
            case 'checkbox':
                return (
                    <input
                        type="checkbox"
                        id={f.name}
                        checked={!!values[f.name]}
                        onChange={(e) => handleChange(f.name, e.target.checked)}
                    />
                );
            default:
                return <input type="text" {...common} />;
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onRequestClose={onRequestClose}
            contentLabel="Additional site-specific information"
            className="modal"
            overlayClassName="modal-overlay"
        >
            <div className="extra-info-modal">
                <div className="extra-info-header">
                    <h3 className="extra-info-title">Additional details required for {serverName}</h3>
                    <button className="extra-info-close" onClick={onRequestClose} aria-label="Close">×</button>
                </div>

                <div className="extra-info-body">
                    {Object.keys(groups).map(groupKey => (
                        <fieldset key={groupKey} className="extra-info-group">
                            {groupKey !== '_default' && <legend className="extra-info-legend">{groupKey}</legend>}
                            <div className="extra-info-grid">
                                {groups[groupKey].map(f => (
                                    <label key={f.name} htmlFor={f.name} className={`extra-info-field type-${(f.type||'text').toLowerCase()}`}>
                    <span className="extra-info-label">
                      {f.label || f.name}{f.required ? ' *' : ''}
                    </span>
                                        <div className="extra-info-input">
                                            {renderField(f)}
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                    ))}

                    {error && <div className="extra-info-error">{error}</div>}
                </div>

                <div className="extra-info-actions">
                    <button className="disclaimer-btn disclaimer-btn-secondary" onClick={onRequestClose} disabled={submitting}>
                        Cancel
                    </button>
                    <button className="disclaimer-btn disclaimer-btn-primary" onClick={handleSubmit} disabled={submitting}>
                        {submitting ? 'Saving…' : 'Save & Continue'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}