const test = require('node:test');
const assert = require('node:assert/strict');
const {backgroundResources, batches, normalizedTableRows} = require('../background-resources');
test('background resource settings have bounded defaults and reject invalid values', () => {
  const defaults = backgroundResources({});
  assert.equal(defaults.workMemMb, 128);
  assert.equal(defaults.parallelWorkers, 1);
  assert.equal(defaults.batchSize, 5000);
  const configured = backgroundResources({INGEST_BATCH_SIZE: '999999', DAILY_TABLE_SYNC_CONCURRENCY: 'Infinity', AVAILABILITY_WORK_MEM_MB: "128'; DROP TABLE x", EXTENDED_SERVER_SYNC_CONCURRENCY: '-1'});
  assert.equal(configured.batchSize, 10000);
  assert.equal(configured.tableConcurrency, 3);
  assert.equal(configured.workMemMb, 128);
  assert.equal(configured.serverConcurrency, 2);
});
test('batching consumes a large iterator lazily with a bounded batch size', () => {
  let consumed = 0;
  function* readings() { for (let i=0; i<100000; i++) {consumed++; yield i;} }
  const iterator = batches(readings(), 5000);
  assert.equal(consumed, 0);
  assert.equal(iterator.next().value.length, 5000);
  assert.equal(consumed, 5000);
  let total=5000;
  for (const batch of iterator) { assert.ok(batch.length <= 5000); total += batch.length; }
  assert.equal(total, 100000);
});
test('normalization is lazy and retains zeros, mapping, timestamps, and missing-value filtering', () => {
  let normalized = 0;
  const rows = normalizedTableRows(new Map([['temperature','field-a'], ['rain','field-b']]), {
    fields: [{name:'temperature'}, {name:'rain'}, {name:'unmapped'}],
    data: [{time:'2020-11-19T22:00:00Z', vals:[36.57,0,99]}, {time:'invalid',vals:[1,2]}, {time:'2020-11-20T22:00:00Z', vals:[null,'NA']}],
  }, {parseTimestamp: value => new Date(value), normalizeValue: value => {normalized++; return value == null || value === 'NA' ? null : value;}});
  assert.equal(normalized, 0);
  const result = Array.from(rows);
  assert.equal(result.length, 2);
  assert.equal(result[0][0], 'field-a'); assert.equal(result[0][2], 36.57);
  assert.equal(result[1][2], 0);
  assert.equal(result[0][1].toISOString(), '2020-11-19T22:00:00.000Z');
});
test('empty ingestion produces no SQL batches', () => {
  assert.deepEqual([...batches([], 5000)], []);
});
