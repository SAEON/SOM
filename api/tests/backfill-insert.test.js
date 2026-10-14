const test = require('node:test');
const assert = require('node:assert/strict');
const {insertMissingBackfillValues} = require('../backfill-insert');
test('insert-only SQL preserves conflicts and reports inserted versus skipped values', async () => {
  const calls = [];
  const client = {async query(sql, params) {calls.push({sql,params}); return {rowCount:1};}};
  const result = await insertMissingBackfillValues(client,[{fieldId:'a',timestamp:'2020-11-19T22:00:00Z',value:'0',status:'backfilled'},{fieldId:'b',timestamp:'2020-11-19T22:00:00Z',value:'1',status:'backfilled'}]);
  assert.deepEqual(result,{insertedCount:1,skippedExistingCount:1});
  assert.match(calls[0].sql,/ON CONFLICT \(field_id, "timestamp"\) DO NOTHING/);
  assert.doesNotMatch(calls[0].sql,/DO UPDATE/);
  assert.equal(calls[0].params[2],'0');
});
test('empty file values do not write anything', async () => {
  const client = {query() {throw new Error('Unexpected SQL');}};
  assert.deepEqual(await insertMissingBackfillValues(client,[]),{insertedCount:0,skippedExistingCount:0});
});
test('database errors propagate so the caller can roll back the entire import', async () => {
  await assert.rejects(insertMissingBackfillValues({async query() {throw new Error('constraint violation');}}, [{fieldId:'a',timestamp:'bad',value:'1',status:'backfilled'}]), /constraint violation/);
});
