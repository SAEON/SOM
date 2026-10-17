const test=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');
const {validateWitsRural,TARGETS}=require('../wits-rural-backfill');const config=require('../wits-rural-backfill-config.json');
function fixture(table='TableDay',day='2026-01-01'){
const fields=config.rawFields[table].map((f,i)=>({...f,field_id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,display_field_name:f.field_name}));
const vals=fields.map(f=>f.data_type==='xsd:dateTime'?day+' 00:00:00':/float|double|int/.test(f.data_type)?'0':'example');
const x={fields,table,client:{query:async sql=>({rows:sql.includes('JOIN server_tables')?fields:[]})},buffer:Buffer.from('timestamp,'+fields.map(f=>f.field_name).join(',')+'\n'+day+' 00:00:00,'+vals.join(',')+'\n')};
x.manifest={source_review:{audit_sha256:config.reviewedSourceAuditSha256},reviewed_date_policy:config.reviewedDatePolicy,as_of:'2026-10-16',timezone_offset:'+02:00',expected_serials:['27307'],tables:[{table,table_id:TARGETS[table].tableId}],batches:{'sample.csv':crypto.createHash('sha256').update(x.buffer).digest('hex')}};return x;
}
const validate=x=>validateWitsRural(x.client,x.buffer,x.manifest,'sample.csv',x.table);
test('all seven exact raw schemas accept numeric zero and SAST',async()=>{for(const t of Object.keys(TARGETS)){const x=fixture(t);const r=await validate(x);assert.equal(r.valueCount,x.fields.length);assert.equal(r.valueRows[0].timestamp.toISOString(),'2025-12-31T22:00:00.000Z');assert.ok(r.valueRows.some(v=>v.value==='0'));}});
test('June 1 cutoff included, May 31 rejected',async()=>{await validate(fixture('TableDay','2023-06-01'));await assert.rejects(()=>validate(fixture('TableDay','2023-05-31')),/cutoff/);});
test('wrong serial and site rejected',async()=>{let x=fixture();x.manifest.expected_serials=['27310'];await assert.rejects(()=>validate(x),/Manifest/);x=fixture();x.manifest.tables[0].table_id='59160773-be33-435f-81cc-6668dbe32727';await assert.rejects(()=>validate(x),/Manifest/);});
test('changed raw units and stale source audit rejected',async()=>{let x=fixture();x.fields.find(f=>f.field_name==='BPress_Avg').units='kPa';await assert.rejects(()=>validate(x),/units changed/);x=fixture();x.manifest.source_review.audit_sha256='bad';await assert.rejects(()=>validate(x),/audit/);});
test('tampered CSV and unreviewed conversions rejected',async()=>{let x=fixture();x.buffer=Buffer.concat([x.buffer,Buffer.from('\n')]);await assert.rejects(()=>validate(x),/checksum/);x=fixture();x.manifest.unit_rules={pressure:10};await assert.rejects(()=>validate(x),/unreviewed/);});
