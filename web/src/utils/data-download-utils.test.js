import {formatSastTimestamp} from './sast';
import {trackedCsvDownload} from './trackedCsvDownload';

test('an offset-free SAST API timestamp is not converted twice', () => {
    expect(formatSastTimestamp('2020-11-20T00:00:00')).toBe(formatSastTimestamp('2020-11-19T22:00:00Z'));
    expect(formatSastTimestamp('2020-11-20T00:00:00+02:00')).toBe(formatSastTimestamp('2020-11-19T22:00:00Z'));
    expect(formatSastTimestamp('2020-11-20T00:00:00')).toContain('00:00:00');
});

test('native download reports completion without fetching or buffering the CSV', async () => {
    Object.defineProperty(window, 'crypto', {configurable: true, value: {randomUUID: () => '11111111-2222-3333-4444-555555555555'}});
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    global.fetch = jest.fn(async () => ({ok: true, json: async () => ({status: 'complete', rows: 10, bytes: 1024})}));
    const updates = jest.fn();
    const result = await trackedCsvDownload('/api/summary_table/download?tableName=daily', 'daily.csv', updates);
    expect(click).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain('/api/downloads/');
    expect(fetch.mock.calls).toHaveLength(1);
    expect(result.rows).toBe(10);
    expect(updates.mock.calls[0][0].status).toBe('preparing');
    expect(updates.mock.calls[1][0].status).toBe('complete');
    click.mockRestore();
});

test('native download reports an export error', async () => {
    Object.defineProperty(window, 'crypto', {configurable: true, value: {randomUUID: () => '22222222-2222-3333-4444-555555555555'}});
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    global.fetch = jest.fn(async () => ({ok: true, json: async () => ({status: 'error', message: 'Database unavailable'})}));
    await expect(trackedCsvDownload('/api/summary_table/download', 'daily.csv', () => {})).rejects.toThrow('Database unavailable');
    click.mockRestore();
});
