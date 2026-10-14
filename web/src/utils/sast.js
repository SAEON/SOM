// API strings without an offset already represent SAST wall-clock time.
export function formatSastTimestamp(value) {
    const text = String(value);
    const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}+02:00`;
    return new Date(zoned).toLocaleString('en-ZA', {timeZone: 'Africa/Johannesburg'});
}
