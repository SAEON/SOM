const test=require('node:test');const assert=require('node:assert/strict');
const {importResumable}=require('./mabasa-resumable');
test('a later insertion failure retains prior committed and audited batches',async()=>{
 let insertCalls=0,commits=0,rollbacks=0,audits=0;
 const client={query:async(sql)=>{
  if(sql.startsWith('INSERT INTO field_values')){if(++insertCalls===2)throw new Error('simulated timeout');return{rowCount:250};}
  if(sql.startsWith('INSERT INTO backfill_jobs'))audits++;
  if(sql==='COMMIT')commits++;
  if(sql==='ROLLBACK')rollbacks++;
  return{rows:[],rowCount:0};
 }};
 const rows=Array.from({length:251},(_,i)=>({fieldId:'a',timestamp:new Date(1700000000000+i*1000),value:'0',status:'backfilled'}));
 await assert.rejects(importResumable(client,{missingValueRows:rows,valueRows:rows,valueCount:251,sha:'test'},{serverName:'site',tableName:'table',tableId:'id'},{operator:'test',fileName:'test.csv'}),e=>{
  assert.equal(e.partialResult.insertedCount,250);assert.equal(e.partialResult.committedBatches,1);return /timeout/.test(e.message);
 });
 assert.equal(commits,1);assert.equal(audits,1);assert.equal(rollbacks,1);
});
test('metadata failure does not roll back committed observations',async()=>{
 let commits=0,rollbacks=0;
 const client={query:async(sql)=>{
  if(sql.includes('CREATE TEMP TABLE mabasa_backfill_keys'))throw new Error('metadata timeout');
  if(sql==='COMMIT')commits++;
  if(sql==='ROLLBACK')rollbacks++;
  return{rows:[],rowCount:sql.startsWith('INSERT INTO field_values')?1:0};
 }};
 const rows=[{fieldId:'a',timestamp:new Date('2022-06-21T22:00:00Z'),value:'0',status:'backfilled'}];
 await assert.rejects(importResumable(client,{missingValueRows:rows,valueRows:rows,valueCount:1,sha:'test'},{serverName:'site',tableName:'table',tableId:'id'},{operator:'test',fileName:'test.csv'}),e=>{
  assert.equal(e.partialResult.insertedCount,1);assert.equal(e.partialResult.metadataComplete,false);return /metadata timeout/.test(e.message);
 });
 assert.equal(commits,1);assert.equal(rollbacks,1);
});
