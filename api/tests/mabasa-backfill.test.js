const test=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');
const {TARGETS,validateMabasa}=require('../mabasa-backfill');
const config=require('../mabasa-backfill-config.json');
function fixture(table,field,units,time,value){
 const buffer=Buffer.from(`timestamp,${field}\n${time},${value}\n`);
 const manifest={outputs:{'test.csv':crypto.createHash('sha256').update(buffer).digest('hex')},tables:[{table,table_id:TARGETS[table].tableId}],as_of:'2026-10-14',timezone_offset:'+02:00',expected_serials:['6456'],unit_rules:config.unitRules,cell_exclusions:config.exclusions};
 const client={query:async sql=>sql.includes('SELECT field_id, timestamp, value FROM field_values')?{rows:[]}:{rows:[{field_id:'00000000-0000-4000-8000-000000000001',display_field_name:field,data_type:'xsd:float',units}]}};
 return {buffer,manifest,client};
}
test('legacy hourly validation uses exact target and does not convert pressure twice',async()=>{
 const f=fixture('TableHour','BPressure_Avg','kPa','2022-06-21 15:00:00','102.067');
 const result=await validateMabasa(f.client,f.buffer,f.manifest,'test.csv','TableHour');
 assert.equal(result.valueRows[0].value,'102.067');
 assert.equal(result.valueRows[0].timestamp.toISOString(),'2022-06-21T13:00:00.000Z');
});
test('native pressure in unconfirmed periods is blocked even with a matching checksum',async()=>{
 const f=fixture('hourly','pressure_atm','hpa','2025-05-23 15:00:00','102.324');
 await assert.rejects(validateMabasa(f.client,f.buffer,f.manifest,'test.csv','hourly'),/unconfirmed pressure/);
});
test('wrong table and off-grid five-minute timestamps fail validation',async()=>{
 const f=fixture('five_min','temp_air_avg','deg_c','2025-05-24 00:01:00','20');
 await assert.rejects(validateMabasa(f.client,f.buffer,f.manifest,'test.csv','five_min'),/off the raw table interval/);
 await assert.rejects(validateMabasa(f.client,f.buffer,f.manifest,'test.csv','hourly'),/does not identify/);
});
