if(process.env.ALLOW_LOCAL_BACKFILL_TEST!=='true')throw new Error('Local test guard required.');
const assert=require('node:assert/strict');const fs=require('node:fs');const crypto=require('node:crypto');
const {Pool}=require('pg');
const {TARGET,parseCsv,validateTableDay,insertMissingBackfillValues}=require('../mabasa-tableday-backfill');
const pool=new Pool({host:process.env.DB_HOST,port:process.env.DB_PORT,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
(async()=>{
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const original=fs.readFileSync('/tmp/Mabasa_TableDay_ready/Master_TableDay_raw.csv');
  const manifest=JSON.parse(fs.readFileSync('/tmp/Mabasa_TableDay_ready/preparation-report.json'));
  const headers=parseCsv(original.toString())[0];
  const cells=headers.map(h=>h==='timestamp'?'2022-06-22 00:00:00':h==='AirTemp_Max'?'999.99':h==='WSpd_Min'?'0':'');
  const buffer=Buffer.from(headers.join(',')+'\n'+cells.join(',')+'\n');
  const fixture={...manifest,outputs:{'test.csv':crypto.createHash('sha256').update(buffer).digest('hex')}};
  await assert.rejects(validateTableDay(client,buffer,manifest,'Master_TableDay_raw.csv'),/checksum/);
  const checked=await validateTableDay(client,buffer,fixture,'test.csv');
  assert.deepEqual(checked.counts,{missingCount:1,existingCount:1,differingCount:1});
  const existingId=checked.fields.find(f=>f.display_field_name==='AirTemp_Max').field_id;
  const time='2022-06-21T22:00:00Z';
  const before=await client.query('SELECT value,status FROM field_values WHERE field_id=$1 AND timestamp=$2',[existingId,time]);
  assert.deepEqual(await insertMissingBackfillValues(client,checked.valueRows),{insertedCount:1,skippedExistingCount:1});
  assert.deepEqual((await client.query('SELECT value,status FROM field_values WHERE field_id=$1 AND timestamp=$2',[existingId,time])).rows,before.rows);
  const zero=checked.valueRows.find(v=>v.fieldId!==existingId);
  const row=await client.query('SELECT value,status FROM field_values WHERE field_id=$1 AND timestamp=$2',[zero.fieldId,time]);
  assert.deepEqual(row.rows,[{value:'0',status:'backfilled'}]);
  assert.deepEqual(await insertMissingBackfillValues(client,checked.valueRows),{insertedCount:0,skippedExistingCount:2});
  console.log('PASS: altered-file checksum blocked; correct raw target; existing value/status unchanged; missing zero inserted; replay skipped.');
 }finally{await client.query('ROLLBACK');client.release();await pool.end();}
 console.log('Rolled back all observations.');
})().catch(error=>{console.error(error);process.exitCode=1;});
