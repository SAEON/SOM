const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {validateMokala,TARGETS}=require('../mokala-backfill');
const config=require('../mokala-backfill-config.json');
function fixture(table='TableDay'){
 const fields=config.rawFields[table].map((f,i)=>({...f,field_id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,display_field_name:f.field_name}));
 const values=fields.map(f=>f.data_type==='xsd:dateTime'?'2025-12-31 12:00:00':/float|double|int/.test(f.data_type)?'1':'demo');
 const buffer=Buffer.from(['timestamp,'+fields.map(f=>f.field_name).join(','),'2026-01-01 00:00:00,'+values.join(',')].join('\n')+'\n');
 const manifest={as_of:'2026-10-15',timezone_offset:'+02:00',expected_serials:['27084'],tables:[{table,table_id:TARGETS[table].tableId}],batches:{'sample.csv':crypto.createHash('sha256').update(buffer).digest('hex')}};
 const client={query:async(sql)=>({rows:sql.includes('JOIN server_tables')?fields:[]})};
 return {fields,buffer,manifest,client,table};
}
test('all seven Mokala raw tables accept exact schema and SAST rows',async()=>{
 for(const table of Object.keys(TARGETS)){
  const x=fixture(table);const r=await validateMokala(x.client,x.buffer,x.manifest,'sample.csv',table);
  assert.equal(r.valueCount,x.fields.length);assert.equal(r.counts.missingCount,x.fields.length);assert.equal(r.valueRows[0].timestamp.toISOString(),'2025-12-31T22:00:00.000Z');
 }
});
test('Mabasa serial and target identities cannot enter Mokala',async()=>{
 const x=fixture();x.manifest.expected_serials=['6456'];await assert.rejects(()=>validateMokala(x.client,x.buffer,x.manifest,'sample.csv',x.table),/Manifest does not identify/);
 x.manifest.expected_serials=['27084'];x.manifest.tables[0].table_id='39e0a801-f0a1-4481-8301-f649c4646788';await assert.rejects(()=>validateMokala(x.client,x.buffer,x.manifest,'sample.csv',x.table),/Manifest does not identify/);
});
test('changed pressure units and source checksum are rejected',async()=>{
 const x=fixture();x.fields.find(f=>f.field_name==='BPress_Avg').units='kPa';await assert.rejects(()=>validateMokala(x.client,x.buffer,x.manifest,'sample.csv',x.table),/schema or units changed/);
 await assert.rejects(()=>validateMokala(x.client,Buffer.concat([x.buffer,Buffer.from('\n')]),x.manifest,'sample.csv',x.table),/checksum/);
});

test('pre-2024 records are rejected even with a matching checksum',async()=>{
 const x=fixture();x.buffer=Buffer.from(x.buffer.toString().replace('2026-01-01 00:00:00','2023-12-31 00:00:00'));
 x.manifest.batches['sample.csv']=crypto.createHash('sha256').update(x.buffer).digest('hex');
 await assert.rejects(()=>validateMokala(x.client,x.buffer,x.manifest,'sample.csv',x.table),/2024 cutoff/);
});
