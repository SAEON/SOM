const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {validateSpionkop,TARGETS}=require('../spionkop-backfill');
const config=require('../spionkop-backfill-config.json');
function fixture(table='TableDay'){
 const fields=config.rawFields[table].map((f,i)=>({...f,field_id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,display_field_name:f.field_name}));
 const values=fields.map(f=>f.data_type==='xsd:dateTime'?'2025-12-31 12:00:00':/float|double|int/.test(f.data_type)?'1':'demo');
 const buffer=Buffer.from(['timestamp,'+fields.map(f=>f.field_name).join(','),'2026-01-01 00:00:00,'+values.join(',')].join('\n')+'\n');
 const manifest={source_review:{binary_audit_sha256:config.reviewedBinaryAuditSha256},reviewed_date_policy:config.reviewedDatePolicy,as_of:'2026-10-15',timezone_offset:'+02:00',expected_serials:['27310','3435'],tables:[{table,table_id:TARGETS[table].tableId}],batches:{'sample.csv':crypto.createHash('sha256').update(buffer).digest('hex')}};
 const client={query:async(sql)=>({rows:sql.includes('JOIN server_tables')?fields:[]})};
 return {fields,buffer,manifest,client,table};
}
test('all seven Spionkop raw tables accept exact schema and SAST rows',async()=>{
 for(const table of Object.keys(TARGETS)){
  const x=fixture(table);const r=await validateSpionkop(x.client,x.buffer,x.manifest,'sample.csv',table);
  assert.equal(r.valueCount,x.fields.length);assert.equal(r.counts.missingCount,x.fields.length);assert.equal(r.valueRows[0].timestamp.toISOString(),'2025-12-31T22:00:00.000Z');
 }
});
test('Mabasa serial and target identities cannot enter Spionkop',async()=>{
 const x=fixture();x.manifest.expected_serials=['6456'];await assert.rejects(()=>validateSpionkop(x.client,x.buffer,x.manifest,'sample.csv',x.table),/Manifest does not identify/);
 x.manifest.expected_serials=['27310','3435'];x.manifest.tables[0].table_id='39e0a801-f0a1-4481-8301-f649c4646788';await assert.rejects(()=>validateSpionkop(x.client,x.buffer,x.manifest,'sample.csv',x.table),/Manifest does not identify/);
});
test('changed pressure units and source checksum are rejected',async()=>{
 const x=fixture();x.fields.find(f=>f.field_name==='BPress_Avg').units='kPa';await assert.rejects(()=>validateSpionkop(x.client,x.buffer,x.manifest,'sample.csv',x.table),/schema or units changed/);
 await assert.rejects(()=>validateSpionkop(x.client,Buffer.concat([x.buffer,Buffer.from('\n')]),x.manifest,'sample.csv',x.table),/checksum/);
});

test('all available dates include valid 2023 records',async()=>{
 const x=fixture();x.buffer=Buffer.from(x.buffer.toString().replaceAll('2026-01-01','2023-01-01').replaceAll('2025-12-31','2022-12-31'));
 x.manifest.batches['sample.csv']=crypto.createHash('sha256').update(x.buffer).digest('hex');
 const r=await validateSpionkop(x.client,x.buffer,x.manifest,'sample.csv',x.table);assert.equal(r.rowCount,1);
});

test('implausible logger event times cannot enter the import',async()=>{
 const x=fixture();x.buffer=Buffer.from(x.buffer.toString().replace('2025-12-31 12:00:00','1990-01-01 00:00:03'));
 x.manifest.batches['sample.csv']=crypto.createHash('sha256').update(x.buffer).digest('hex');
 await assert.rejects(()=>validateSpionkop(x.client,x.buffer,x.manifest,'sample.csv',x.table),/outside reviewed observation window/);
});

test('confirmed test dates and quarantined daily labels are rejected',async()=>{
 for(const date of ['2021-10-25','2021-10-26','2023-04-14','2023-06-16','2024-06-14']){
  const x=fixture();x.buffer=Buffer.from(x.buffer.toString().replace('2026-01-01',date));
  x.manifest.batches['sample.csv']=crypto.createHash('sha256').update(x.buffer).digest('hex');
  await assert.rejects(()=>validateSpionkop(x.client,x.buffer,x.manifest,'sample.csv',x.table),/confirmed test|quarantined daily/);
 }
});
test('reviewed date policy is required before importing',async()=>{
 const x=fixture();delete x.manifest.reviewed_date_policy;
 await assert.rejects(()=>validateSpionkop(x.client,x.buffer,x.manifest,'sample.csv',x.table),/reviewed Spionkop date policy/);
});

test('stale or missing binary audit proof cannot be imported',async()=>{
 const x=fixture();x.manifest.source_review.binary_audit_sha256='0'.repeat(64);
 await assert.rejects(()=>validateSpionkop(x.client,x.buffer,x.manifest,'sample.csv',x.table),/reviewed Spionkop binary audit/);
});
