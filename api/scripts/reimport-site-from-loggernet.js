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
  node scripts/reimport-site-from-loggernet.js --raw-server "EFTEON_Bambanani ERS" --since 2026-02-01
  node scripts/reimport-site-from-loggernet.js --server "Bambanani AWS" --table daily --since 2026-02-01 --execute

Options:
  --raw-server Raw LoggerNet server name from the LoggerNet Server list.
  --server     Public display server name from summary_table. Use when raw name is not supplied.
  --table      Raw or public display table name. Optional; all active raw tables for the site when omitted.
  --since      Local SAST date/time to replace from. Default: 2026-02-01.
  --execute    Delete and reimport. Without this flag the script is dry-run only.
  --public-only
              Repair only currently public mapped fields. Default repairs all
              active raw fields for the mapped LoggerNet site.
  --skip-db-count
              Skip the preflight DB count. Useful when live DB count is slow and
              LoggerNet availability is the only dry-run check needed.
`);
}

const displayServerName = argValue('--server');
const rawServerName = argValue('--raw-server');
const displayTableName = argValue('--table');
const sinceInput = argValue('--since', '2026-02-01');
const execute = hasFlag('--execute');
const publicOnly = hasFlag('--public-only');
const skipDbCount = hasFlag('--skip-db-count');

if (!displayServerName && !rawServerName) {
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
const BATCH_SIZE = Number(process.env.REIMPORT_BATCH_SIZE || 50000);
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

function buildRows(fieldsByName, payload, minTimestamp = null) {
  const rows = [];
  const apiFields = Array.isArray(payload.fields) ? payload.fields : [];
  const data = Array.isArray(payload.data) ? payload.data : [];
  const fieldIdsByPosition = apiFields.map((field) => fieldsByName.get(field?.name) || null);
  const minTime = minTimestamp instanceof Date && !Number.isNaN(minTimestamp.getTime())
    ? minTimestamp.getTime()
    : null;

  for (const row of data) {
    const rawTime = row?.time != null ? row.time : (row?.timestamp || row?.t);
    const timestamp = parseLoggerNetTimestamp(rawTime);
    if (Number.isNaN(timestamp.getTime())) continue;
    if (minTime != null && timestamp.getTime() < minTime) continue;

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

function dedupeRows(rows) {
  const byKey = new Map();
  for (const row of rows) {
    byKey.set(`${row[0]}|${row[1].toISOString()}`, row);
  }
  return Array.from(byKey.values());
}

async function loadTargetTables() {
  const targetName = rawServerName || displayServerName;
  const targetClause = rawServerName
    ? 'WHERE btrim(s.name) = $1'
    : 'WHERE btrim(st.display_server_name) = $1';
  const siteServersSource = rawServerName
    ? `
      SELECT DISTINCT
        s.server_id,
        s.name AS raw_server_name,
        coalesce(site_names.display_server_name, s.name) AS display_server_name
      FROM public.servers s
      LEFT JOIN LATERAL (
        SELECT st.display_server_name
        FROM public.server_tables stbl
        JOIN public.server_table_fields stf ON stf.table_id = stbl.table_id
        JOIN public.summary_table st ON st.field_id = stf.field_id
        WHERE stbl.server_id = s.server_id
          AND st.display_server_name IS NOT NULL
          AND btrim(st.display_server_name) <> ''
        ORDER BY st.display_server_name
        LIMIT 1
      ) site_names ON true
      ${targetClause}
    `
    : `
      SELECT DISTINCT
        stbl.server_id,
        s.name AS raw_server_name,
        st.display_server_name
      FROM public.summary_table st
      JOIN public.server_table_fields stf ON stf.field_id = st.field_id
      JOIN public.server_tables stbl ON stbl.table_id = stf.table_id
      JOIN public.servers s ON s.server_id = stbl.server_id
      ${targetClause}
    `;

  const params = [targetName];
  let tableFilter = '';
  if (displayTableName) {
    params.push(displayTableName);
    tableFilter = 'AND (btrim(stbl.table_name) = $2 OR btrim(coalesce(public_tables.display_table_name, stbl.table_name)) = $2)';
  }

  const {rows} = await pool.query(`
    WITH site_servers AS (
      ${siteServersSource}
    ),
    public_tables AS (
      SELECT DISTINCT
        stf.table_id,
        st.display_table_name
      FROM public.summary_table st
      JOIN public.server_table_fields stf ON stf.field_id = st.field_id
      JOIN public.server_tables stbl ON stbl.table_id = stf.table_id
      JOIN site_servers ss ON ss.server_id = stbl.server_id
    ),
    public_fields AS (
      SELECT DISTINCT st.field_id
      FROM public.summary_table st
      JOIN public.server_table_fields stf ON stf.field_id = st.field_id
      JOIN public.server_tables stbl ON stbl.table_id = stf.table_id
      JOIN site_servers ss ON ss.server_id = stbl.server_id
    )
    SELECT DISTINCT
      ss.display_server_name,
      coalesce(public_tables.display_table_name, stbl.table_name) AS display_table_name,
      stf.field_id,
      stf.field_name,
      stbl.table_id,
      stbl.table_name,
      stbl.uri AS table_uri,
      ss.raw_server_name,
      (public_fields.field_id IS NOT NULL) AS currently_public
    FROM site_servers ss
    JOIN public.server_tables stbl ON stbl.server_id = ss.server_id
    JOIN public.server_table_fields stf ON stf.table_id = stbl.table_id
    LEFT JOIN public_tables ON public_tables.table_id = stbl.table_id
    LEFT JOIN public_fields ON public_fields.field_id = stf.field_id
    WHERE stbl.status = 'active'
      AND stf.status = 'active'
      ${tableFilter}
      AND stbl.uri IS NOT NULL
      AND ($${params.length + 1}::boolean IS FALSE OR public_fields.field_id IS NOT NULL)
    ORDER BY coalesce(public_tables.display_table_name, stbl.table_name), stbl.table_name, stf.field_name
  `, [...params, publicOnly]);

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
      currentlyPublic: row.currently_public,
    });
  }
  return Array.from(byTable.values());
}

async function countDbRows(client, fieldIds, sinceDb) {
  logProgress(`Counting existing DB values for ${fieldIds.length} fields since ${sinceDb} SAST`);
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
  logProgress(`Deleting existing DB values for ${fieldIds.length} fields since ${sinceDb} SAST`);
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
    const fieldIds = slice.map((row) => row[0]);
    const timestamps = slice.map((row) => row[1]);
    const values = slice.map((row) => String(row[2]));
    const result = await client.query(`
      INSERT INTO public.field_values (field_id, "timestamp", value, status)
      SELECT field_id, "timestamp", value, 'active'
      FROM unnest($1::uuid[], $2::timestamptz[], $3::text[]) AS rows(field_id, "timestamp", value)
    `, [fieldIds, timestamps, values]);
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
  const currentlyPublicCount = table.fields.filter((field) => field.currentlyPublic).length;

  const client = await pool.connect();
  try {
    const minTimestamp = parseLoggerNetTimestamp(sinceDb);
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
    const rows = dedupeRows(buildRows(fieldsByName, payload, minTimestamp));
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
      dbValuesAfter: null,
      dbTimestampsAfter: null,
      dbFirstSastAfter: null,
      dbLastSastAfter: null,
      loggernetRows: payload.data.length,
      loggernetFields: payload.fields.length,
      repairedFields: table.fields.length,
      currentlyPublicFields: currentlyPublicCount,
      missingMappedFields: missingFields,
      importableValues: rows.length,
      importableTimestamps: uniqueTimestamps.size,
      deleted: 0,
      touched: 0,
      verified: !execute ? null : false,
    };

    if (!execute) return summary;

    await client.query('BEGIN');
    await client.query('SET LOCAL synchronous_commit = OFF');
    summary.deleted = await deleteDbRows(client, fieldIds, sinceDb);
    summary.touched = await insertRows(client, rows);
    const after = await countDbRows(client, fieldIds, sinceDb);
    summary.dbValuesAfter = after.values;
    summary.dbTimestampsAfter = after.timestamps;
    summary.dbFirstSastAfter = after.first_sast;
    summary.dbLastSastAfter = after.last_sast;
    summary.verified =
      String(after.values) === String(rows.length) &&
      String(after.timestamps) === String(uniqueTimestamps.size);
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
  console.log(`[TARGET] ${(rawServerName && 'raw: ' + rawServerName) || displayServerName}${displayTableName ? ' / ' + displayTableName : ''}`);
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
