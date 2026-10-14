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
  for (let offset=0;offset<valueRows.length;offset+=5000) {
    const batch=valueRows.slice(offset,offset+5000);
    const {rows} = await client.query(`
      SELECT count(fv.field_id)::int AS existing_count,
             count(fv.field_id) FILTER (WHERE fv.value IS DISTINCT FROM incoming.value)::int AS differing_count
      FROM unnest($1::uuid[], $2::timestamptz[], $3::text[]) AS incoming(field_id, timestamp, value)
      LEFT JOIN field_values fv ON fv.field_id=incoming.field_id AND fv.timestamp=incoming.timestamp
       AND fv.field_id=ANY($1::uuid[]) AND fv.timestamp >= $4::timestamptz AND fv.timestamp <= $5::timestamptz`,
      [batch.map(v=>v.fieldId), batch.map(v=>v.timestamp), batch.map(v=>v.value),
       new Date(Math.min(...batch.map(v=>v.timestamp.getTime()))),new Date(Math.max(...batch.map(v=>v.timestamp.getTime())))]);
    existingCount+=rows[0].existing_count; differingCount+=rows[0].differing_count;
  }
  return {missingCount:valueRows.length-existingCount,existingCount,differingCount};
}
module.exports={getRawBackfillFields,compareBackfillReadings};
