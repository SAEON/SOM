const {insertMissingBackfillValues}=require('./backfill-insert');
const {refreshMabasaMetadata}=require('./mabasa-backfill-metadata');

async function importResumable(client, validated, target, audit, onProgress=()=>{}) {
 const missing=[...validated.missingValueRows].sort((a,b)=>a.timestamp-b.timestamp||a.fieldId.localeCompare(b.fieldId));
 const result={insertedCount:0,skippedExistingCount:validated.valueCount,committedBatches:0,metadataComplete:false};
 const transaction=async(work)=>{
  await client.query('BEGIN');
  try{
   await client.query("SET LOCAL statement_timeout='120s'");
   await client.query("SET LOCAL lock_timeout='15s'");
   await client.query("SELECT pg_advisory_xact_lock(hashtext('technician_backfill'))");
   const value=await work();await client.query('COMMIT');return value;
  }catch(error){await client.query('ROLLBACK');throw error;}
 };
 try{
  for(let offset=0;offset<missing.length;offset+=250){
   const batch=missing.slice(offset,offset+250);
   const inserted=await transaction(async()=>{
    const r=await insertMissingBackfillValues(client,batch,250);
    await client.query(`INSERT INTO backfill_jobs
     (created_by_username,server_name,table_name,file_name,mode,status,row_count,value_count,inserted_or_updated_count,warnings,errors)
     VALUES ($1,$2,$3,$4,'import','imported',$5,$6,$7,$8::jsonb,'[]'::jsonb)`,
     [audit.operator,target.serverName,target.tableName,audit.fileName,new Set(batch.map(v=>v.timestamp.toISOString())).size,batch.length,r.insertedCount,
      JSON.stringify([`Resumable batch SHA256=${validated.sha}; offset=${offset}; rawTableId=${target.tableId}; availability refreshed separately`])]);
    return r.insertedCount;
   });
   result.insertedCount+=inserted;result.committedBatches++;
   result.skippedExistingCount=validated.valueCount-result.insertedCount;
   onProgress({phase:'insert',checked:offset+batch.length,total:missing.length,...result});
  }
  // Each SAST month is independent: a metadata failure never rolls back observations.
  const months=new Map();
  for(const item of validated.valueRows){
   const month=new Date(item.timestamp.getTime()+7200000).toISOString().slice(0,7);
   if(!months.has(month))months.set(month,[]);months.get(month).push(item);
  }
  let checked=0;
  for(const [month,rows] of months){
   await transaction(()=>refreshMabasaMetadata(client,target.tableId,rows));
   onProgress({phase:'metadata',month,checked:++checked,total:months.size,...result});
  }
  result.metadataComplete=true;return result;
 }catch(error){error.partialResult=result;throw error;}
}
module.exports={importResumable};
