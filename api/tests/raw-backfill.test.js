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
test('preflight reads bounded monthly slices without writing and compares exact field/time pairs',async()=>{
 const time=new Date('2022-06-21T22:00:00Z');const progress=[];let calls=0;
 const client={query:async(sql,args)=>{
  calls++;assert.match(sql,/field_id=ANY/);assert.match(sql,/LIMIT 250001/);assert.doesNotMatch(sql,/JOIN|INSERT|UPDATE|DELETE/);
  assert.equal(args[0].length,3);
  return{rows:[{field_id:'same',timestamp:time,value:'0'},{field_id:'different',timestamp:time,value:null},
    {field_id:'same',timestamp:new Date('2022-06-22T22:00:00Z'),value:'extra'}]};
 }};
 const missing=[];
 const rows=[{fieldId:'same',timestamp:time,value:'0'},{fieldId:'different',timestamp:time,value:'1'},{fieldId:'missing',timestamp:time,value:'2'}];
 assert.deepEqual(await compareBackfillReadings(client,rows,p=>progress.push(p.checked),item=>missing.push(item)),{missingCount:1,existingCount:2,differingCount:1});
 assert.equal(calls,1);assert.deepEqual(progress,[3]);
 assert.deepEqual(missing,[rows[2]]);
});
test('interleaved fields are read once per month rather than once per field or global batch',async()=>{
 const values=Array.from({length:10000},(_,i)=>({fieldId:i%2?'a':'b',timestamp:new Date(1700000000000+i*1000),value:'1'}));
 let calls=0;const client={query:async()=>{calls++;return{rows:[]};}};
 assert.equal((await compareBackfillReadings(client,values)).missingCount,10000);
 assert.equal(calls,1);
});
