const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getRawBackfillFields(client, serverName, tableName, rawTableId) {
  if (!uuid.test(rawTableId)) throw new Error('Invalid raw table ID.');
  const {rows} = await client.query(`
    SELECT sf.field_id, sf.field_name AS display_field_name, sf.data_type, sf.units,
           st.table_id, st.table_name, s.name AS server_name
    FROM server_table_fields sf JOIN server_tables st USING (table_id)
    JOIN servers s USING (server_id)
    WHERE st.table_id=$1::uuid AND s.name=$2 AND st.table_name=$3
    ORDER BY sf.field_name`, [rawTableId, serverName, tableName]);
  if (!rows.length) throw new Error('Raw table does not belong to the selected server/table, or has no fields.');
  return rows;
}

async function compareBackfillReadings(client, valueRows, onProgress = null, onMissing = null) {
  let existingCount=0, differingCount=0;
  // Read each bounded monthly slice once, instead of thousands of random
  // per-field timestamp probes against a partitioned database.
  const windows=new Map();
  for(const item of valueRows){
    const month=item.timestamp.toISOString().slice(0,7);
    const readings=windows.get(month)||[];readings.push(item);windows.set(month,readings);
  }
  let checked=0,windowIndex=0;
  for(const readings of windows.values()){
    windowIndex+=1;
    const fieldIds=[...new Set(readings.map(v=>v.fieldId))];
    const times=readings.map(v=>v.timestamp.getTime());
    const {rows}=await client.query(`
      SELECT field_id, timestamp, value FROM field_values
      WHERE field_id=ANY($1::uuid[]) AND timestamp >= $2::timestamptz
       AND timestamp <= $3::timestamptz
       AND timestamp = date_trunc('milliseconds', timestamp) LIMIT 250001`,
      [fieldIds,new Date(Math.min(...times)),new Date(Math.max(...times))]);
    if(rows.length>250000)throw new Error('Existing monthly slice exceeds preflight memory cap; split the upload into shorter windows.');
    const existing=new Map(rows.map(row=>[row.field_id+':'+row.timestamp.toISOString(),row.value]));
    for(const incoming of readings){
      const key=incoming.fieldId+':'+incoming.timestamp.toISOString();
      if(!existing.has(key)){if(onMissing)onMissing(incoming);continue;}
      existingCount+=1;if(existing.get(key)!==incoming.value)differingCount+=1;
    }
    checked+=readings.length;
    if(onProgress)onProgress({checked,total:valueRows.length,windowIndex,windowTotal:windows.size});
  }
  return {missingCount:valueRows.length-existingCount,existingCount,differingCount};
}
module.exports={getRawBackfillFields,compareBackfillReadings};
