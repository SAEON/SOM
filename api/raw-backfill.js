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

async function compareBackfillReadings(client, valueRows) {
  let existingCount=0, differingCount=0;
  // One field at a time keeps both index lookups and returned rows bounded.
  // Joining a large unnest to the partitioned parent can choose a broad scan.
  for (let offset=0;offset<valueRows.length;offset+=5000) {
    const fields = new Map();
    for (const item of valueRows.slice(offset,offset+5000)) {
      const readings=fields.get(item.fieldId) || [];
      readings.push(item); fields.set(item.fieldId,readings);
    }
    for (const [fieldId, readings] of fields) {
      const timestamps=readings.map(v=>v.timestamp);
      const {rows}=await client.query(`
        SELECT timestamp, value FROM field_values
        WHERE field_id=$1::uuid AND timestamp=ANY($2::timestamptz[])
          AND timestamp >= $3::timestamptz AND timestamp <= $4::timestamptz`,
        [fieldId,timestamps,new Date(Math.min(...timestamps.map(v=>v.getTime()))),
         new Date(Math.max(...timestamps.map(v=>v.getTime())))]);
      const existing=new Map(rows.map(row=>[row.timestamp.toISOString(),row.value]));
      for (const incoming of readings) {
        const key=incoming.timestamp.toISOString();
        if (!existing.has(key)) continue;
        existingCount+=1;
        if (existing.get(key)!==incoming.value) differingCount+=1;
      }
    }
  }
  return {missingCount:valueRows.length-existingCount,existingCount,differingCount};
}
module.exports={getRawBackfillFields,compareBackfillReadings};
