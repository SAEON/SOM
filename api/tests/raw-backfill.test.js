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
test('preflight reports missing, existing and differing without writing observations',async()=>{
 const client={query:async sql=>{assert.match(sql,/LEFT JOIN field_values/);assert.doesNotMatch(sql,/INSERT|UPDATE|DELETE/);return{rows:[{existing_count:2,differing_count:1}]};}};
 const rows=[0,1,2].map(x=>({fieldId:'field'+x,timestamp:new Date('2022-06-21T22:00:00Z'),value:String(x)}));
 assert.deepEqual(await compareBackfillReadings(client,rows),{missingCount:1,existingCount:2,differingCount:1});
});
