function boundedInteger(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && Number.isInteger(number) && number >= min
    ? Math.min(number, max) : fallback;
}
function backgroundResources(env = process.env) {
  return {
    batchSize: boundedInteger(env.INGEST_BATCH_SIZE, 5000, 100, 10000),
    tableConcurrency: boundedInteger(env.DAILY_TABLE_SYNC_CONCURRENCY, 3, 1, 4),
    metadataConcurrency: boundedInteger(env.METADATA_SYNC_CONCURRENCY, 3, 1, 4),
    serverConcurrency: boundedInteger(env.EXTENDED_SERVER_SYNC_CONCURRENCY, 2, 1, 3),
    fieldConcurrency: boundedInteger(env.EXTENDED_FIELD_SYNC_CONCURRENCY, 2, 1, 4),
    workMemMb: boundedInteger(env.AVAILABILITY_WORK_MEM_MB, 128, 16, 256),
    parallelWorkers: boundedInteger(env.AVAILABILITY_PARALLEL_WORKERS, 1, 0, 2),
  };
}
function* batches(rows, size) {
  let batch = [];
  for (const row of rows) {
    batch.push(row);
    if (batch.length === size) { yield batch; batch = []; }
  }
  if (batch.length) yield batch;
}
function* normalizedTableRows(dbFieldsByName, payload, {parseTimestamp, normalizeValue}) {
  const apiFields = Array.isArray(payload?.fields) ? payload.fields : [];
  const data = Array.isArray(payload?.data) ? payload.data : [];
  if (!apiFields.length || !data.length) return;
  const fieldIds = apiFields.map(field => dbFieldsByName.get(field?.name) || null);
  for (const row of data) {
    if (!row) continue;
    const rawTime = row.time != null ? row.time : (row.timestamp || row.t);
    if (!rawTime) continue;
    const timestamp = parseTimestamp(rawTime);
    if (Number.isNaN(timestamp.getTime())) continue;
    const values = Array.isArray(row.vals) ? row.vals : [];
    for (let i = 0; i < fieldIds.length; i++) {
      if (!fieldIds[i]) continue;
      const value = normalizeValue(values[i]);
      if (value != null) yield [fieldIds[i], timestamp, value];
    }
  }
}
module.exports = {backgroundResources, batches, normalizedTableRows};
