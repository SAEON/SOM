const test=require('node:test');const assert=require('node:assert/strict');
const {getRawBackfillFields,compareBackfillReadings}=require('../raw-backfill');
test('raw target validates ID before querying and binds table/site together',async()=>{
 let params;
 const client={query:async(sql,args)=>{params=args;return{rows:[{field_id:'field'}]};}};
 await assert.rejects(getRawBackfillFields(client,'site','TableDay','not-id'),/Invalid/);
 assert.equal(params,undefined);
 await getRawBackfillFields(client,'site','TableDay','39e0a801-f0a1-4481-8301-f649c4646788');
 assert.deepEqual(params,['39e0a801-f0a1-4481-8301-f649c4646788','site','TableDay']);
 await assert.rejects(getRawBackfillFields({query:async()=>({rows:[]})},'wrong','TableDay','39e0a801-f0a1-4481-8301-f649c4646788'),/does not belong/);
});
test('preflight performs bounded field-index lookups and preserves null/text comparison',async()=>{
 const time=new Date('2022-06-21T22:00:00Z');
 const client={query:async (sql,args)=>{
  assert.match(sql,/field_id=\$1::uuid/);assert.match(sql,/timestamp=ANY/);
  assert.doesNotMatch(sql,/JOIN|INSERT|UPDATE|DELETE/);
  if(args[0]==='missing')return{rows:[]};
  return{rows:[{timestamp:time,value:args[0]==='same'?'0':null}]};
 }};
 const rows=[{fieldId:'same',timestamp:time,value:'0'},{fieldId:'different',timestamp:time,value:'1'},{fieldId:'missing',timestamp:time,value:'2'}];
 assert.deepEqual(await compareBackfillReadings(client,rows),{missingCount:1,existingCount:2,differingCount:1});
});
