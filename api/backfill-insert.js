async function insertMissingBackfillValues(client, valueRows, batchSize = 5000) {
  let insertedCount = 0;
  for (let offset = 0; offset < valueRows.length; offset += batchSize) {
    const batch = valueRows.slice(offset, offset + batchSize);
    const params = [];
    const tuples = batch.map((item, index) => {
      const base = index * 4;
      params.push(item.fieldId, item.timestamp, item.value, item.status);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
    }).join(',');
    const result = await client.query(`INSERT INTO field_values (field_id, "timestamp", value, status)
      VALUES ${tuples} ON CONFLICT (field_id, "timestamp") DO NOTHING`, params);
    insertedCount += result.rowCount;
  }
  return {insertedCount, skippedExistingCount: valueRows.length - insertedCount};
}
module.exports = {insertMissingBackfillValues};
