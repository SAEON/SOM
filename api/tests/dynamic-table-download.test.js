const test = require('node:test');
const assert = require('node:assert/strict');
const {Readable, Writable} = require('node:stream');
const {createTableDownloadHandler, formatSastTimestamp} = require('../dynamic-table-download');
const {progressHandler} = require('../download-progress');
const tableId = 'b313f720-2fb5-4425-bdae-9ffc77ab7c4b';
class Response extends Writable {
  constructor() { super(); this.headers = {}; this.body = ''; this.statusCode = 200; this.headersSent = false; }
  setHeader(name, value) { this.headers[name] = value; }
  status(code) { this.statusCode = code; return this; }
  json(value) { this.end(JSON.stringify(value)); return this; }
  _write(chunk, encoding, callback) { this.headersSent = true; this.body += chunk; callback(); }
}
function fixture({rows = [], failMetadata = false, failStream = false, missingTable = false} = {}) {
  let releases = 0, connects = 0;
  const queries = [];
  class QueryStream { constructor(sql, params) { this.sql = sql; this.params = params; } }
  const client = {
    query(query, params) {
      queries.push(query);
      if (query instanceof QueryStream) {
        if (failStream) return new Readable({objectMode: true, read() { this.destroy(new Error('query failed')); }});
        return Readable.from(rows);
      }
      if (query.includes('FROM server_tables')) return Promise.resolve({rows: missingTable ? [] : [{table_name: 'Daily', server_name: 'SAEON_SAWC_AWS'}]});
      if (failMetadata) return Promise.reject(new Error('metadata failed'));
      return Promise.resolve({rows: [{field_id: 'air', field_name: 'AirTC_Max', units: 'Deg C'}, {field_id: 'rain', field_name: 'Rain', units: 'mm'}, {field_id: 'text', field_name: 'Text', units: ''}]});
    },
    release() { releases++; },
  };
  const handler = createTableDownloadHandler({pool: {async connect() { connects++; return client; }}, QueryStream, logger: {log() {}, error() {}}});
  return {handler, queries, releases: () => releases, connects: () => connects};
}
test('UTC midnight crossing is formatted explicitly as SAST', () => {
  assert.equal(formatSastTimestamp('2020-11-19T22:00:00Z'), '20/11/2020 00:00:00');
});
test('dynamic export uses current data, fixed columns, zeros, CSV escaping, and timezone headers', async () => {
  const f = fixture({rows: [
    {timestamp: '2020-11-19T22:00:00Z', fields: [{field_name: 'AirTC_Max', value: '36.57'}, {field_name: 'Rain', value: 0}, {field_name: 'Text', value: 'a,"b"'}]},
    {timestamp: '2020-11-20T22:00:00Z', fields: [{field_name: 'AirTC_Max', value: '23.24'}]},
  ]});
  const res = new Response();
  await f.handler({params: {tableId}}, res);
  assert.equal(res.body, 'timestamp,AirTC_Max,Rain,Text\n,Deg C,mm,\n20/11/2020 00:00:00,36.57,0,"a,""b"""\n21/11/2020 00:00:00,23.24,,\n');
  assert.equal(res.headers['X-CSV-Source'], 'dynamic-raw-table');
  assert.equal(res.headers['X-CSV-Timezone'], 'Africa/Johannesburg');
  assert.equal(f.releases(), 1);
  assert.equal(f.queries.length, 3);
  assert.deepEqual(f.queries[2].params, [['air', 'rain', 'text']]);
});
test('unknown table returns 404 and releases its connection', async () => {
  const f = fixture({missingTable: true}); const res = new Response();
  await f.handler({params: {tableId}}, res);
  assert.equal(res.statusCode, 404); assert.equal(f.releases(), 1);
});
test('metadata failure releases its connection', async () => {
  const f = fixture({failMetadata: true}); const res = new Response();
  await f.handler({params: {tableId}}, res);
  assert.equal(res.statusCode, 500); assert.equal(f.releases(), 1);
});
test('query stream failure releases its connection', async () => {
  const f = fixture({failStream: true}); const res = new Response();
  await f.handler({params: {tableId}}, res);
  assert.equal(res.destroyed, true); assert.equal(f.releases(), 1);
});
test('empty data produces a valid header-only CSV', async () => {
  const f = fixture(); const res = new Response();
  await f.handler({params: {tableId}}, res);
  assert.equal(res.body, 'timestamp,AirTC_Max,Rain,Text\n,Deg C,mm,\n'); assert.equal(f.releases(), 1);
});
test('client disconnect destroys the query stream and releases its connection', async () => {
  const f = fixture({rows: [{timestamp: '2020-11-19T22:00:00Z', fields: []}]});
  const res = new Response();
  res._write = function(chunk, encoding, callback) { callback(); this.destroy(); };
  await f.handler({params: {tableId}}, res);
  assert.equal(res.destroyed, true); assert.equal(f.releases(), 1);
});
test('invalid ID does not acquire a database connection', async () => {
  const f = fixture(); const res = new Response();
  await f.handler({params: {tableId: 'invalid'}}, res);
  assert.equal(res.statusCode, 400); assert.equal(f.connects(), 0);
});
test('progress reports the completed CSV row and byte counts', async () => {
  const f = fixture({rows: [{timestamp: '2020-11-19T22:00:00Z', fields: []}]});
  const downloadId = '11111111-2222-3333-4444-555555555555';
  const csv = new Response();
  await f.handler({params: {tableId}, query: {downloadId}}, csv);
  const status = new Response(); progressHandler({params: {downloadId}}, status);
  const progress = JSON.parse(status.body);
  assert.equal(progress.status, 'complete'); assert.equal(progress.rows, 1);
  assert.equal(progress.bytes, Buffer.byteLength(csv.body));
});
test('progress reports a database error rather than remaining busy', async () => {
  const f = fixture({failMetadata: true});
  const downloadId = '22222222-2222-3333-4444-555555555555';
  await f.handler({params: {tableId}, query: {downloadId}}, new Response());
  const status = new Response(); progressHandler({params: {downloadId}}, status);
  assert.equal(JSON.parse(status.body).status, 'error');
});
