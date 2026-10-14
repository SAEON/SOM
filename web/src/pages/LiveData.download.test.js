import React from 'react';
import {render, screen, fireEvent, act, waitFor} from '@testing-library/react';
import '@testing-library/jest-dom';
import LiveData from './LiveData';

jest.mock('../utils/logInteraction', () => ({logInteraction: jest.fn()}));
jest.mock('./LoadingSpinner', () => () => null);
jest.mock('react-modal', () => {
  const React = require('react');
  const Modal = ({isOpen, children}) => isOpen ? React.createElement('div', null, children) : null;
  Modal.setAppElement = jest.fn();
  return Modal;
});
const tableId = 'b313f720-2fb5-4425-bdae-9ffc77ab7c4b';
let progress;
let infoFails;
beforeEach(() => {
  progress = {status: 'streaming', rows: 500, bytes: 1048576};
  infoFails = false;
  Object.defineProperty(window, 'crypto', {configurable: true, value: {randomUUID: () => 'f55777d6-268e-4555-bab4-e14e6b3e4ae2'}});
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  global.fetch = jest.fn(async url => {
    let data;
    if (url === '/api/servers') data = [{server_id: 'site', name: 'SAEON_SAWC_AWS'}];
    else if (url === '/api/servers/site/tables') data = [{table_id: tableId, table_name: 'Daily', status: 'active'}];
    else if (url === '/api/tables/date-ranges') data = [];
    else if (url.endsWith('/date-range')) data = {start_date: '2020-11-19T22:00:00Z', end_date: '2020-12-20T22:00:00Z'};
    else if (url.endsWith('/fields')) data = [{field_name: 'AirTC_Max', units: 'Deg C', status: 'active'}];
    else if (url.includes('/values?')) {
      const page = Number(new URL(url, 'http://localhost').searchParams.get('page'));
      data = {data: [{timestamp: `2020-12-${page === 1 ? '20' : '19'}T00:00:00`, fields: [{field_name: 'AirTC_Max', value: '36.57', units: 'Deg C', status: 'active'}]}], totalRecords: 20, totalPages: 2};
    }
    else if (url.endsWith('/info')) return {ok: !infoFails, json: async () => ({servername: 'SAEON_SAWC_AWS', tablename: 'Daily'})};
    else if (url.endsWith('/progress')) data = progress;
    else throw new Error(`Unexpected request: ${url}`);
    return {ok: true, json: async () => data};
  });
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });
async function openTable() {
  render(<LiveData user={{role: 'SU'}} />);
  fireEvent.click(await screen.findByText('SAEON_SAWC_AWS'));
  return screen.findByRole('button', {name: 'Download', exact: true});
}
test('native download remains visibly busy until progress reports completion', async () => {
  const button = await openTable();
  jest.useFakeTimers();
  await act(async () => { fireEvent.click(button); });
  expect(screen.getByText(/Preparing CSV/)).toBeInTheDocument();
  expect(button).toBeDisabled();
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(300); });
  expect(screen.getByText(/500 rows · 1.0 MB exported/)).toBeInTheDocument();
  expect(button).toBeDisabled();
  progress = {status: 'complete', rows: 1960, bytes: 404406};
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(screen.getByText(/Export sent to your browser/)).toBeInTheDocument();
  expect(button).toBeEnabled();
});
test('a failed start shows an error and allows retry', async () => {
  const button = await openTable();
  infoFails = true;
  await act(async () => { fireEvent.click(button); });
  expect(screen.getByText('Could not start this download. Please retry.')).toBeInTheDocument();
  expect(button).toBeEnabled();
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
});
test('opening a table and moving to the next page issues one values request per page', async () => {
  await openTable();
  fireEvent.click(screen.getByRole('button', {name: /Daily/}));
  await screen.findByText('Total Rows: 20');
  const valuesRequests = () => fetch.mock.calls.filter(([url]) => url.includes('/values?'));
  expect(valuesRequests()).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', {name: '→', exact: true}));
  await waitFor(() => expect(valuesRequests()).toHaveLength(2));
  expect(valuesRequests()[1][0]).toContain('page=2');
});
