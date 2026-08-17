require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {Transform, pipeline} = require('stream');
const {promisify} = require('util');
const {Pool} = require('pg');
const QueryStream = require('pg-query-stream');

const pipe = promisify(pipeline);
const EXPORT_ROOT = process.env.CSV_EXPORT_ROOT || path.join(__dirname, '..', 'csv_exports');
const BAD_VALUES = ['NAN', 'NA', 'NULL', 'INF', 'INFINITY', '-INF', '-INFINITY'];

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  max: 4,
});

function parseArgs(argv) {
  return argv.reduce((acc, arg) => {
    if (!arg.startsWith('--')) return acc;
    const [key, value = 'true'] = arg.slice(2).split('=');
    acc[key] = value;
    return acc;
  }, {});
}

function slug(value) {
  return String(value || 'unknown')
    .trim()
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
}

function monthWindows(monthsBack) {
  const now = new Date();
  const windows = [];
  for (let i = 0; i < monthsBack; i += 1) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    windows.push({
      month: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      start: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`,
      end: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`,
    });
  }
  return windows;
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function getTargets(client, args) {
  const params = [];
  const where = [
    "display_server_name IS NOT NULL",
    "display_table_name IS NOT NULL",
    "btrim(display_server_name) <> ''",
    "btrim(display_table_name) <> ''",
  ];

  if (args.server) {
    params.push(args.server);
    where.push(`display_server_name = $${params.length}`);
  }

  if (args.table) {
    params.push(args.table);
    where.push(`display_table_name = $${params.length}`);
  }

  const {rows} = await client.query(
    `
      SELECT DISTINCT display_server_name, display_table_name
      FROM summary_table
      WHERE ${where.join(' AND ')}
      ORDER BY display_server_name, display_table_name
    `,
    params
  );

  return rows;
}

async function getFields(client, serverName, tableName, startDate, endDate) {
  const {rows} = await client.query(
    `
      SELECT DISTINCT st.display_field_name, st.units
      FROM summary_table st
      JOIN field_values fv ON fv.field_id = st.field_id
      WHERE st.display_server_name = $1
        AND st.display_table_name = $2
        AND fv.timestamp >= ($3::date::timestamp AT TIME ZONE 'Africa/Johannesburg')
        AND fv.timestamp < (($4::date + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg')
        AND fv.value IS NOT NULL
        AND btrim(fv.value) <> ''
        AND upper(btrim(fv.value)) <> ALL($5::text[])
      ORDER BY st.display_field_name
    `,
    [serverName, tableName, startDate, endDate, BAD_VALUES]
  );

  return rows;
}

async function writeMonthlyCsv(client, target, window) {
  const {display_server_name: serverName, display_table_name: tableName} = target;
  const fieldsRows = await getFields(client, serverName, tableName, window.start, window.end);
  const fields = fieldsRows.map((row) => row.display_field_name);
  const units = new Map(fieldsRows.map((row) => [row.display_field_name, row.units || '']));
  const relativePath = path.join('monthly', slug(serverName), slug(tableName), `${window.month}.csv`);
  const absolutePath = path.join(EXPORT_ROOT, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), {recursive: true});

  const writeStream = fs.createWriteStream(absolutePath);
  const doiResult = await client.query('SELECT doi FROM site_mapping WHERE display_name = $1 LIMIT 1', [serverName]);
  const doi = doiResult.rows[0]?.doi || 'DOI not available';
  let rowCount = 0;

  writeStream.write(`# Citation link: ${doi}\n`);
  writeStream.write(`# Data for ${tableName} on ${serverName}\n`);
  writeStream.write(['Timestamp', ...fields, 'Latitude', 'Longitude'].map(escapeCsv).join(',') + '\n');
  writeStream.write(['', ...fields.map((field) => units.get(field) || ''), '', ''].map(escapeCsv).join(',') + '\n');

  const queryStream = new QueryStream(
    `
      SELECT
        TO_CHAR(fv.timestamp AT TIME ZONE 'Africa/Johannesburg', 'YYYY-MM-DD"T"HH24:MI:SS') AS timestamp,
        CASE
          WHEN fv.value ~ '^[+-]?[0-9]+(\\.[0-9]*)?$' THEN
            (CAST((CAST(fv.value AS numeric) * CAST(st.multiplier AS numeric)) AS text))
          ELSE fv.value
        END AS field_value,
        st.display_field_name,
        st.latitude,
        st.longitude
      FROM field_values fv
      JOIN summary_table st ON fv.field_id = st.field_id
      WHERE st.display_server_name = $1
        AND st.display_table_name = $2
        AND fv.timestamp >= ($3::date::timestamp AT TIME ZONE 'Africa/Johannesburg')
        AND fv.timestamp < (($4::date + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg')
        AND fv.value IS NOT NULL
        AND btrim(fv.value) <> ''
        AND upper(btrim(fv.value)) <> ALL($5::text[])
      ORDER BY fv.timestamp ASC, st.display_field_name ASC
    `,
    [serverName, tableName, window.start, window.end, BAD_VALUES]
  );

  let currentTimestamp = null;
  let currentValues = {};
  let currentLatitude = '';
  let currentLongitude = '';

  const flush = () => {
    if (!currentTimestamp) return '';
    rowCount += 1;
    const row = [
      currentTimestamp,
      ...fields.map((field) => currentValues[field] ?? ''),
      currentLatitude,
      currentLongitude,
    ];
    return row.map(escapeCsv).join(',') + '\n';
  };

  const transform = new Transform({
    objectMode: true,
    transform(row, enc, callback) {
      let output = '';
      if (currentTimestamp && row.timestamp !== currentTimestamp) {
        output += flush();
        currentValues = {};
        currentLatitude = '';
        currentLongitude = '';
      }
      currentTimestamp = row.timestamp;
      currentValues[row.display_field_name] = row.field_value;
      currentLatitude = row.latitude ?? currentLatitude;
      currentLongitude = row.longitude ?? currentLongitude;
      callback(null, output);
    },
    flush(callback) {
      callback(null, flush());
    },
  });

  await pipe(client.query(queryStream), transform, writeStream);
  const stat = fs.statSync(absolutePath);

  await client.query(
    `
      INSERT INTO csv_export_manifest (
        display_server_name,
        display_table_name,
        period_start,
        period_end,
        file_path,
        file_size_bytes,
        row_count,
        generated_at,
        status,
        error_message
      )
      VALUES ($1, $2, $3::date, $4::date, $5, $6, $7, now(), 'ready', NULL)
      ON CONFLICT (display_server_name, display_table_name, period_start, period_end)
      DO UPDATE SET
        file_path = EXCLUDED.file_path,
        file_size_bytes = EXCLUDED.file_size_bytes,
        row_count = EXCLUDED.row_count,
        generated_at = now(),
        status = 'ready',
        error_message = NULL
    `,
    [serverName, tableName, window.start, window.end, relativePath, stat.size, rowCount]
  );

  return {serverName, tableName, month: window.month, rowCount, bytes: stat.size};
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const monthsBack = Math.max(1, Math.min(parseInt(args['months-back'] || '2', 10), 24));
  const windows = args.month
    ? [{month: args.month, start: `${args.month}-01`, end: new Date(Number(args.month.slice(0, 4)), Number(args.month.slice(5, 7)), 0).toISOString().slice(0, 10)}]
    : monthWindows(monthsBack);

  const client = await pool.connect();
  try {
    const targets = await getTargets(client, args);
    console.log(`Generating ${windows.length} month(s) for ${targets.length} table(s) into ${EXPORT_ROOT}`);
    for (const target of targets) {
      for (const window of windows) {
        try {
          const result = await writeMonthlyCsv(client, target, window);
          console.log(`ready ${result.serverName} / ${result.tableName} / ${result.month}: ${result.rowCount} rows, ${result.bytes} bytes`);
        } catch (error) {
          console.error(`failed ${target.display_server_name} / ${target.display_table_name} / ${window.month}:`, error.message);
          await client.query(
            `
              INSERT INTO csv_export_manifest (
                display_server_name,
                display_table_name,
                period_start,
                period_end,
                file_path,
                status,
                error_message
              )
              VALUES ($1, $2, $3::date, $4::date, '', 'failed', $5)
              ON CONFLICT (display_server_name, display_table_name, period_start, period_end)
              DO UPDATE SET status = 'failed', error_message = EXCLUDED.error_message, generated_at = now()
            `,
            [target.display_server_name, target.display_table_name, window.start, window.end, error.message]
          );
        }
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
