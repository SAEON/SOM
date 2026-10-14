#!/usr/bin/env node
require('dotenv').config();
const fs=require('node:fs');const path=require('node:path');
const {Pool}=require('pg');
const {TARGETS,validateMabasa,insertMissingBackfillValues}=require('../mabasa-backfill');
const {refreshMabasaMetadata}=require('../mabasa-backfill-metadata');

const args={};
for(let i=2;i<process.argv.length;i+=2){const key=process.argv[i];const value=process.argv[i+1];if(!key.startsWith('--')||!value)throw new Error('Arguments are --name value pairs.');args[key.slice(2)]=value;}
if(!args.file||!args.manifest||!args.report)throw new Error('Required: --file CSV --manifest JSON --report NEW_JSON [--mode preflight|test|import]');
const TARGET=TARGETS[args.table];if(!TARGET)throw new Error('Required --table: TableDay, daily, TableHour, hourly or five_min');
const mode=args.mode||'preflight';if(!['preflight','test','import'].includes(mode))throw new Error('Invalid mode');
if(fs.existsSync(args.report))throw new Error('Report already exists; choose a new report path.');
if(!process.env.DB_NAME)throw new Error('DB_NAME must explicitly identify the database.');
if(mode==='import'&&(args['confirm-database']!==process.env.DB_NAME||!args.operator))throw new Error('Import requires --confirm-database matching DB_NAME and --operator YOUR_NAME.');
if(mode==='test'&&process.env.ALLOW_LOCAL_BACKFILL_TEST!=='true')throw new Error('Rollback test requires ALLOW_LOCAL_BACKFILL_TEST=true on local only.');
const manifest=JSON.parse(fs.readFileSync(args.manifest,'utf8'));
const buffer=fs.readFileSync(args.file);
const pool=new Pool({host:process.env.DB_HOST,port:process.env.DB_PORT,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,max:1,application_name:'som-mabasa-backfill'});
(async()=>{
 const client=await pool.connect();let transaction=false;
 try {
  await client.query(mode==='preflight'?'BEGIN READ ONLY':'BEGIN');transaction=true;
  await client.query('SET LOCAL statement_timeout = \'120s\'');
  if(mode!=='preflight')await client.query("SELECT pg_advisory_xact_lock(hashtext('technician_backfill'))");
  console.log(`Validating ${args.table}: checksum, raw schema, units and timestamps...`);
  const started=Date.now();
  const validated=await validateMabasa(client,buffer,manifest,path.relative(path.dirname(args.manifest),args.file).split(path.sep).join('/'),args.table,
    progress=>console.log(`Preflight: ${progress.checked}/${progress.total} readings checked; month ${progress.windowIndex}/${progress.windowTotal}; ${Math.round((Date.now()-started)/1000)}s elapsed`));
  const {valueRows,missingValueRows,fields,...summary}=validated;
  const report={database:process.env.DB_NAME,mode,target:TARGET,...summary,sourceConflictCells:manifest.tables.find(t=>t.table===args.table).conflicting_cells,
   warnings:['Existing readings and statuses are preserved, including existing pressure values requiring separate correction.','Conflicting source cells are blank in the prepared file.']};
  console.log(JSON.stringify(report,null,2));
  if(mode!=='preflight'){
   console.log(`Inserting ${missingValueRows.length} missing readings in batches of 250...`);
   missingValueRows.sort((a,b)=>a.timestamp-b.timestamp||a.fieldId.localeCompare(b.fieldId));
   report.importResult=await insertMissingBackfillValues(client,missingValueRows,250,
     progress=>console.log(`Insert: ${progress.checked}/${progress.total} candidates processed; ${progress.insertedCount} inserted; ${Math.round((Date.now()-started)/1000)}s elapsed`));
   report.importResult.skippedExistingCount=valueRows.length-report.importResult.insertedCount;
   console.log('Refreshing availability metadata...');
   report.metadataRefresh=await refreshMabasaMetadata(client,TARGET.tableId,valueRows);
   if(mode==='import'){
    await client.query(`INSERT INTO backfill_jobs (created_by_username,server_name,table_name,file_name,mode,status,row_count,value_count,inserted_or_updated_count,warnings,errors)
      VALUES ($1,$2,$3,$4,'import','imported',$5,$6,$7,$8::jsonb,'[]'::jsonb)`,
      [args.operator,TARGET.serverName,TARGET.tableName,path.basename(args.file),summary.rowCount,summary.valueCount,report.importResult.insertedCount,JSON.stringify([...report.warnings,`CLI import SHA256=${summary.sha}; skipped=${report.importResult.skippedExistingCount}; rawTableId=${TARGET.tableId}`])]);
    await client.query('COMMIT');transaction=false;report.committed=true;
   }else{
    const replay=await insertMissingBackfillValues(client,missingValueRows,250);
    if(replay.insertedCount!==0)throw new Error('Repeat-import idempotence check failed.');
    report.repeatTest=replay;await client.query('ROLLBACK');transaction=false;report.committed=false;
   }
  }else{await client.query('ROLLBACK');transaction=false;report.committed=false;}
  fs.writeFileSync(args.report,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(mode==='import'?'Import committed.':'No observations retained. Report: '+args.report);
 }catch(error){if(transaction)await client.query('ROLLBACK');throw error;}
 finally{client.release();await pool.end();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
