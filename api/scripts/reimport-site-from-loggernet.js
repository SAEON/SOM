require('dotenv').config();

const axios = require('axios');
const https = require('https');
const {Pool} = require('pg');

const args = process.argv.slice(2);

function argValue(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return args[index + 1] || fallback;
}

function hasFlag(name) {
  return args.includes(name);
}

function usage() {
  console.log(`
Usage:
  node scripts/reimport-site-from-loggernet.js --server "Bambanani AWS" --since 2026-02-01
  node scripts/reimport-site-from-loggernet.js --server "Bambanani AWS" --table daily --since 2026-02-01 --execute

Options:
  --server     Public display server name from summary_table. Required.
  --table      Public display table name. Optional; all public tables for the site when omitted.
  --since      Local SAST date/time to replace from. Default: 2026-02-01.
  --execute    Delete and reimport. Without this flag the script is dry-run only.
  --skip-db-count
              Skip the preflight DB count. Useful when live DB count is slow and
              LoggerNet availability is the only dry-run check needed.
`);
}

const displayServerName = argValue('--server');
const displayTableName = argValue('--table');
const sinceInput = argValue('--since', '2026-02-01');
const execute = hasFlag('--execute');
const skipDbCount = hasFlag('--skip-db-count');

if (!displayServerName) {
  usage();
  process.exit(1);
}

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  connectionTimeoutMillis: 60000,
  idleTimeoutMillis: 300000,
  max: 5,
});

const loggernetHostOverride = (process.env.LOGGERNET_HOST_OVERRIDE || '').trim();
const agent = new https.Agent({
  rejectUnauthorized: process.env.LOGGERNET_REJECT_UNAUTHORIZED === 'true',
  lookup: loggernetHostOverride
    ? (hostname, options, callback) => {
      if (hostname === 'lognet.saeon.ac.za') {
        if (options && options.all) {
          callback(null, [{address: loggernetHostOverride, family: 4}]);
          return;
        }
        callback(null, loggernetHostOverride, 4);
        return;
      }
      require('dns').lookup(hostname, options, callback);
    }
    : undefined,
});

const BAD_FIELD_VALUE_STRINGS = new Set(['', 'NAN', 'NA', 'NULL', 'INF', 'INFINITY', '-INF', '-INFINITY']);
const BATCH_SIZE = Number(process.env.REIMPORT_BATCH_SIZE || 5000);
const REQUEST_TIMEOUT_MS = Number(process.env.TABLE_VALUE_REQUEST_TIMEOUT_MS || 120000);

function logProgress(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function normalizeText(value) {
  return value == null ? '' : String(value).trim();
}

function sinceForDb(value) {
  const raw = normalizeText(value);
  return raw.includes('T') ? raw : `${raw}T00:00:00`;
}

function sinceForLoggerNet(value) {
  return sinceForDb(value).replace(/[+-]\d{2}:?\d{2}$/i, '').replace(/Z$/i, '');
}

function parseLoggerNetTimestamp(value) {
  if (value instanceof Date) return value;
  const raw = normalizeText(value);
  if (!raw) return new Date(NaN);
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  return new Date(hasTimezone ? normalized : `${normalized}+02:00`);
}

function normalizeOneValue(rawVal) {
  if (rawVal == null) return null;

  let val;
  if (typeof rawVal === 'number') {
    if (!Number.isFinite(rawVal)) return null;
    val = rawVal;
  } else if (typeof rawVal === 'string') {
    val = rawVal.trim();
  } else if (rawVal instanceof Date) {
    val = rawVal.toISOString();
  } else if (typeof rawVal === 'boolean') {
    val = rawVal ? 'true' : 'false';
  } else {
    try {
      val = JSON.stringify(rawVal);
    } catch (e) {
      return null;
    }
  }

  if (typeof val === 'string' && BAD_FIELD_VALUE_STRINGS.has(val.trim().toUpperCase())) return null;
  return val;
}

async function fetchValuesForTable(tableUri, p1) {
  const url = 'https://lognet.saeon.ac.za/?command=dataquery&uri=' +
    encodeURIComponent(tableUri) +
    '&format=json&mode=since-time&p1=' + encodeURIComponent(p1);

  logProgress(`Fetching LoggerNet data for ${tableUri} since ${p1}`);
  const response = await axios.get(url, {httpsAgent: agent, timeout: REQUEST_TIMEOUT_MS});
  const payload = {
    fields: response.data?.head && Array.isArray(response.data.head.fields) ? response.data.head.fields : [],
    data: Array.isArray(response.data?.data) ? response.data.data : [],
  };
  logProgress(`Fetched ${payload.data.length} LoggerNet rows and ${payload.fields.length} fields for ${tableUri}`);
  return payload;
}

function buildRows(fieldsByName, payload) {
  const rows = [];
  const apiFields = Array.isArray(payload.fields) ? payload.fields : [];
  const data = Array.isArray(payload.data) ? payload.data : [];
  const fieldIdsByPosition = apiFields.map((field) => fieldsByName.get(field?.name) || null);

  for (const row of data) {
    const rawTime = row?.time != null ? row.time : (row?.timestamp || row?.t);
    const timestamp = parseLoggerNetTimestamp(rawTime);
    if (Number.isNaN(timestamp.getTime())) continue;

    const vals = Array.isArray(row?.vals) ? row.vals : [];
    for (let i = 0; i < fieldIdsByPosition.length; i += 1) {
      const fieldId = fieldIdsByPosition[i];
      if (!fieldId) continue;
      const value = normalizeOneValue(vals[i]);
      if (value == null) continue;
      rows.push([fieldId, timestamp, value]);
    }
  }

  return rows;
}

async function loadTargetTables() {
  const params = [displayServerName];
  let tableFilter = '';
  if (displayTableName) {
    params.push(displayTableName);
    tableFilter = 'AND btrim(st.display_table_name) = $2';
  }

  const {rows} = await pool.query(`
    SELECT DISTINCT
      st.display_server_name,
      st.display_table_name,
      stf.field_id,
      stf.field_name,
      stbl.table_id,
      stbl.table_name,
      stbl.uri AS table_uri,
      s.name AS raw_server_name
    FROM public.summary_table st
    JOIN public.server_table_fields stf ON stf.field_id = st.field_id
    JOIN public.server_tables stbl ON stbl.table_id = stf.table_id
    JOIN public.servers s ON s.server_id = stbl.server_id
    WHERE btrim(st.display_server_name) = $1
      ${tableFilter}
      AND st.field_id IS NOT NULL
      AND stbl.uri IS NOT NULL
    ORDER BY st.display_table_name, stbl.table_name, stf.field_name
  `, params);

  const byTable = new Map();
  for (const row of rows) {
    const key = row.table_id;
    if (!byTable.has(key)) {
      byTable.set(key, {
        displayServerName: row.display_server_name,
        displayTableName: row.display_table_name,
        rawServerName: row.raw_server_name,
        tableId: row.table_id,
        tableName: row.table_name,
        tableUri: row.table_uri,
        fields: [],
      });
    }
    byTable.get(key).fields.push({
      fieldId: row.field_id,
      fieldName: row.field_name,
    });
  }
  return Array.from(byTable.values());
}

async function countDbRows(client, fieldIds, sinceDb) {
  logProgress(`Counting existing DB values for ${fieldIds.length} mapped fields since ${sinceDb} SAST`);
  const {rows} = await client.query(`
    SELECT
      count(*)::bigint AS values,
      count(DISTINCT "timestamp")::bigint AS timestamps,
      min("timestamp" AT TIME ZONE 'Africa/Johannesburg') AS first_sast,
      max("timestamp" AT TIME ZONE 'Africa/Johannesburg') AS last_sast
    FROM public.field_values
    WHERE field_id = ANY($1::uuid[])
      AND "timestamp" >= ($2::timestamp AT TIME ZONE 'Africa/Johannesburg')
  `, [fieldIds, sinceDb]);
  return rows[0];
}

async function deleteDbRows(client, fieldIds, sinceDb) {
  logProgress(`Deleting existing DB values for ${fieldIds.length} mapped fields since ${sinceDb} SAST`);
  const result = await client.query(`
    DELETE FROM public.field_values
    WHERE field_id = ANY($1::uuid[])
      AND "timestamp" >= ($2::timestamp AT TIME ZONE 'Africa/Johannesburg')
  `, [fieldIds, sinceDb]);
  logProgress(`Deleted ${result.rowCount || 0} existing DB values`);
  return result.rowCount || 0;
}

async function insertRows(client, rows) {
  let touched = 0;
  const totalBatches = Math.ceil(rows.length / BATCH_SIZE);
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const slice = rows.slice(start, start + BATCH_SIZE);
    const batchNumber = Math.floor(start / BATCH_SIZE) + 1;
    logProgress(`Inserting batch ${batchNumber}/${totalBatches} (${slice.length} values)`);
    const placeholders = [];
    const params = [];
    let p = 1;
    for (const row of slice) {
      params.push(row[0], row[1], row[2]);
      placeholders.push(`($${p++}, $${p++}, $${p++}, 'active')`);
    }
    const result = await client.query(`
      INSERT INTO public.field_values (field_id, "timestamp", value, status)
      VALUES ${placeholders.join(',')}
      ON CONFLICT (field_id, "timestamp") DO UPDATE SET
        value = EXCLUDED.value,
        status = 'active'
      WHERE field_values.value IS DISTINCT FROM EXCLUDED.value
         OR field_values.status IS DISTINCT FROM 'active'
    `, params);
    touched += result.rowCount || 0;
    logProgress(`Inserted/updated batch ${batchNumber}/${totalBatches}; touched so far ${touched}`);
  }
  return touched;
}

async function reimportTable(table) {
  const sinceDb = sinceForDb(sinceInput);
  const sinceLoggerNet = sinceForLoggerNet(sinceInput);
  const fieldIds = table.fields.map((field) => field.fieldId);
  const fieldsByName = new Map(table.fields.map((field) => [field.fieldName, field.fieldId]));

  const client = await pool.connect();
  try {
    const before = skipDbCount
      ? {
        values: null,
        timestamps: null,
        first_sast: null,
        last_sast: null,
      }
      : await countDbRows(client, fieldIds, sinceDb);
    const payload = await fetchValuesForTable(table.tableUri, sinceLoggerNet);
    logProgress(`Normalizing LoggerNet rows for ${table.displayServerName} / ${table.displayTableName}`);
    const rows = buildRows(fieldsByName, payload);
    logProgress(`Normalized ${rows.length} importable values for ${table.displayServerName} / ${table.displayTableName}`);
    const uniqueTimestamps = new Set(rows.map((row) => row[1].toISOString()));
    const apiFieldNames = new Set((payload.fields || []).map((field) => field.name));
    const missingFields = table.fields
      .map((field) => field.fieldName)
      .filter((fieldName) => !apiFieldNames.has(fieldName));

    const summary = {
      displayTableName: table.displayTableName,
      rawTableName: table.tableName,
      rawServerName: table.rawServerName,
      dbValuesBefore: before.values,
      dbTimestampsBefore: before.timestamps,
      dbFirstSast: before.first_sast,
      dbLastSast: before.last_sast,
      loggernetRows: payload.data.length,
      loggernetFields: payload.fields.length,
      mappedFields: table.fields.length,
      missingMappedFields: missingFields,
      importableValues: rows.length,
      importableTimestamps: uniqueTimestamps.size,
      deleted: 0,
      touched: 0,
    };

    if (!execute) return summary;

    await client.query('BEGIN');
    await client.query('SET LOCAL synchronous_commit = OFF');
    summary.deleted = await deleteDbRows(client, fieldIds, sinceDb);
    summary.touched = await insertRows(client, rows);
    await client.query('COMMIT');
    return summary;
  } catch (error) {
    if (execute) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {}
    }
    throw error;
  } finally {
    client.release();
  }
}

(async () => {
  console.log(`[MODE] ${execute ? 'EXECUTE' : 'DRY RUN'}`);
  console.log(`[TARGET] ${displayServerName}${displayTableName ? ' / ' + displayTableName : ''}`);
  console.log(`[SINCE] ${sinceForDb(sinceInput)} SAST`);

  const tables = await loadTargetTables();
  if (!tables.length) {
    console.log('No public mapped tables found for target.');
    return;
  }

  for (const table of tables) {
    console.log(`\n[TABLE] ${table.displayServerName} / ${table.displayTableName} (${table.rawServerName} / ${table.tableName})`);
    const summary = await reimportTable(table);
    console.log(JSON.stringify(summary, null, 2));
  }
})()
  .catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
