require("dotenv").config();
const axios = require("axios");
const https = require("https");
const express = require("express");
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bodyParser = require("body-parser");
const cors = require("cors");
//const session = require("express-session");
const bcrypt = require("bcrypt");
const cron = require("node-cron");
const fs = require("fs"); // Make sure fs is required
const path = require("path"); // Ensure 'path' is imported
const QueryStream = require('pg-query-stream');
const {Transform} = require('stream');
const {stringify} = require('csv-stringify'); // Correct import of csv-stringify
const {pipeline} = require('stream'); // Import pipeline for handling streams
const JSONStream = require('JSONStream');
const {Readable} = require('stream');
const multer = require('multer');
const {spawn} = require('child_process');
const loggernetHostOverride = (process.env.LOGGERNET_HOST_OVERRIDE || '').trim();
const agent = new https.Agent({
  rejectUnauthorized: process.env.LOGGERNET_REJECT_UNAUTHORIZED === 'true',
  lookup: loggernetHostOverride
    ? (hostname, options, callback) => {
      if (hostname === 'lognet.saeon.ac.za') {
        if (options && options.all) {
          callback(null, [{ address: loggernetHostOverride, family: 4 }]);
          return;
        }
        callback(null, loggernetHostOverride, 4);
        return;
      }
      require('dns').lookup(hostname, options, callback);
    }
    : undefined,
});
const compression = require('compression'); // Import compression middleware

const app = express();
app.set('trust proxy', true);  // Trust the X-Forwarded-For header
const port = process.env.PORT;
const backgroundJobsEnabled = process.env.ENABLE_BACKGROUND_JOBS === 'true';
const emptyBackgroundLane = () => ({
  running: false,
  currentStep: null,
  currentStepIndex: 0,
  totalSteps: 0,
  lastCompletedStep: null,
  detail: null,
  subStepIndex: 0,
  subStepTotal: 0,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastError: null,
  lastDurationSeconds: null,
  nextRunAt: null,
  tablesCheckedThisRun: 0,
  tablesWithDataThisRun: 0,
  tablesFailedThisRun: 0,
  rowsTouchedThisRun: 0,
  lastSuccessfulTable: null,
  lastFailedTable: null,
});
const backgroundStatus = {
  enabled: backgroundJobsEnabled,
  timezone: 'Africa/Johannesburg',
  readerSchedule: 'CSV exports daily at 00:15 SAST',
  writerSchedule: 'Fast sync Mon-Sat at 06:00, 14:00, and 22:00 SAST; Sunday fast sync at 06:00 and 14:00 SAST; extended sync Sunday at 20:00 SAST',
  reader: emptyBackgroundLane(),
  writer: emptyBackgroundLane(),
};
let activeBackgroundLane = null;

function setPublicCache(res, seconds = 60) {
  res.set('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${seconds * 4}`);
}

function setNoStore(res) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
}

function getSastDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day
  };
}

function isPrivilegedApiRole(role) {
  return ['admin', 'su', 'collaborator', 'collaborators'].includes(String(role || '').trim().toLowerCase());
}

function isRateLimitExempt(req) {
  return isPrivilegedApiRole(req.apiUser?.role || req.session?.user?.role || req.user?.role);
}

function createRateLimiter({windowMs, max, message, skip}) {
  const buckets = new Map();

  return (req, res, next) => {
    if (typeof skip === 'function' && skip(req)) {
      res.set('X-RateLimit-Limit', 'unlimited');
      res.set('X-RateLimit-Remaining', 'unlimited');
      return next();
    }

    const now = Date.now();
    const actor =
      req.session?.user?.id ? `user:${req.session.user.id}` :
      req.apiUser?.id ? `user:${req.apiUser.id}` :
      `ip:${req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.socket?.remoteAddress || 'unknown'}`;
    const key = `${actor}:${req.baseUrl || req.path}`;
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, {count: 1, resetAt: now + windowMs});
      res.set('X-RateLimit-Limit', String(max));
      res.set('X-RateLimit-Remaining', String(Math.max(max - 1, 0)));
      res.set('X-RateLimit-Reset', String(Math.ceil((now + windowMs) / 1000)));
      return next();
    }

    bucket.count += 1;
    const remaining = Math.max(max - bucket.count, 0);
    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(remaining));
    res.set('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.set('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({
        message: message || 'Too many requests. Please slow down and try again shortly.',
      });
    }

    next();
  };
}

function logApiAnalytics(req, res, interactionType, additionalData = {}) {
  res.on('finish', () => {
    const requestIp =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      null;
    const eventTimestamp = new Date();
    const interactionHour = new Date(eventTimestamp);
    interactionHour.setMinutes(0, 0, 0);
    const sastDate = getSastDateParts(eventTimestamp);

    pool.query(
      `INSERT INTO user_interactions
        (user_id, ip, interaction_type, request_path, referrer, user_agent, status_code,
         response_size, timestamp, additional_data, session_id, location, interaction_hour, interaction_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT DO NOTHING`,
      [
        req.session?.user?.id || req.apiUser?.id || null,
        requestIp,
        interactionType,
        req.originalUrl,
        req.get('referer') || null,
        req.get('user-agent') || null,
        res.statusCode,
        Number(res.getHeader('Content-Length')) || null,
        eventTimestamp,
        additionalData,
        req.sessionID || null,
        null,
        interactionHour,
        `${sastDate.year}-${sastDate.month}-${sastDate.day}`,
      ],
    ).catch((error) => {
      console.error('Error logging public API analytics:', error.message);
    });
  });
}

function publicApiAnalyticsMiddleware(req, res, next) {
  if (req.path === '/site-status') return next();
  const endpoint = req.path.replace(/^\/+/, '') || 'root';
  const interactionType = req.path === '/download' || req.originalUrl.startsWith('/api/v1/download')
    ? 'api_download'
    : 'api_request';
  logApiAnalytics(req, res, interactionType, {
    endpoint,
    method: req.method,
    query: req.method === 'GET' ? req.query : {},
  });
  next();
}

async function authenticateBasicApiUser(req) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Basic\s+(.+)$/i);
  if (!match) return null;

  let decoded = '';
  try {
    decoded = Buffer.from(match[1], 'base64').toString('utf8');
  } catch (error) {
    return null;
  }

  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex < 1) return null;

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);
  if (!username || !password) return null;

  const userResult = await pool.query(
    'SELECT u.id, u.username, u.password, r.name as role_name FROM users u JOIN user_roles ur ON u.id = ur.user_id JOIN roles r ON ur.role_id = r.id WHERE u.username = $1',
    [username],
  );
  const user = userResult.rows[0];
  if (!user) return null;

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) return null;

  return {id: user.id, username: user.username, role: user.role_name};
}

async function requireLoggedInPublicApi(req, res, next) {
  if (req.session?.user?.id) return next();
  if (req.apiUser?.id) return next();

  try {
    const apiUser = await authenticateBasicApiUser(req);
    if (apiUser) {
      req.apiUser = apiUser;
      return next();
    }
  } catch (error) {
    console.error('Basic API authentication failed:', error.message);
  }

  res.set('WWW-Authenticate', 'Basic realm="SAEON observations monitor API", charset="UTF-8"');
  return res.status(401).json({
    message: 'Login required for data API access. Use a session cookie or HTTP Basic Auth over HTTPS.',
  });
}

async function identifyOptionalPublicApiUser(req, res, next) {
  if (req.session?.user?.id || req.apiUser?.id) return next();

  try {
    const apiUser = await authenticateBasicApiUser(req);
    if (apiUser) req.apiUser = apiUser;
  } catch (error) {
    console.error('Optional Basic API authentication failed:', error.message);
  }

  next();
}

function parseDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function queryDateOnly(req, primary, alias = null) {
  return normalizeText(req.query[primary] || (alias ? req.query[alias] : null));
}

function formatDateOnlyValue(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function daySpan(startDate, endDate) {
  return Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
}

const defaultCsvDownloadDays = 7;
const monthlyCsvDownloadDays = 31;
const annualCsvDownloadDays = 366;

function getCsvDownloadLimitDays(tableName) {
  const normalizedTable = normalizeText(tableName).toLowerCase();
  if (/\b(daily|day)\b/.test(normalizedTable)) return annualCsvDownloadDays;
  if (/\b(hourly|hour)\b/.test(normalizedTable)) return monthlyCsvDownloadDays;
  return defaultCsvDownloadDays;
}

function csvDownloadLimitMessage(tableName) {
  const limitDays = getCsvDownloadLimitDays(tableName);
  return `CSV downloads for this table are limited to ${limitDays} days per request. Daily tables support annual downloads; hourly tables are split into monthly batches; higher-frequency tables are split into weekly batches so the live API and database remain responsive.`;
}

function isUsableDataValue(value) {
  if (value === null || value === undefined) return false;
  const text = String(value).trim();
  if (!text) return false;
  return !['NAN', 'NA', 'NULL', 'INF', 'INFINITY', '-INF', '-INFINITY'].includes(text.toUpperCase());
}

function parseFieldEntries(fieldValues) {
  if (Array.isArray(fieldValues)) return fieldValues;
  try {
    return JSON.parse(fieldValues || '[]');
  } catch (error) {
    return [];
  }
}

// Allow CORS for all routes
app.use(cors());
// Incorrect:
// app.setTimeout(600000);

// Correct:
app.use((req, res, next) => {
  req.setTimeout(600000);  // Set timeout for requests (10 minutes)
  res.setTimeout(600000);  // Set timeout for responses (10 minutes)
  next();
});
// PostgreSQL pool configuration
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    idleTimeoutMillis: 300000, // Increase idle timeout to 5 minutes
    connectionTimeoutMillis: 60000, // Wait 60 seconds for a connection before timing out
    max: 20, // Allow up to 20 concurrent clients
});
app.use(compression()); // Use compression middleware
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

// Session configuration
//app.use(session({
//  secret: process.env.SESSION_SECRET,
//  resave: false,
//  saveUninitialized: true,
//  cookie: {secure: false} // Set to true if using https
//}));

app.use(session({
  store: new pgSession({
    pool: pool,                // Use your PostgreSQL connection pool
    tableName: 'session',      // Optional: customize the session table name
    createTableIfMissing: true, // Optional: creates the session table automatically if it doesn't exist
  }),
  secret: process.env.SESSION_SECRET, // Your secret from environment variables
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    maxAge: 30 * 24 * 60 * 60 * 1000, // Session expiration (e.g., 30 days)
    httpOnly: true,  // Helps prevent cross-site scripting (XSS) attacks
  }
}));

app.use('/images', (req, res, next) => {
    console.log(`Serving image request: ${req.url}`);
    next();
}, express.static(path.join(__dirname, 'public/images')));

const siteImageDir = path.join(__dirname, 'public/images');
fs.mkdirSync(siteImageDir, {recursive: true});

function normalizeText(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeOptionalText(value) {
  const cleaned = normalizeText(value);
  return cleaned || null;
}

function parseBooleanFlag(value) {
  if (value === true || value === false) return value;
  if (typeof value === 'number') return value === 1;
  const normalized = normalizeText(value).toLowerCase();
  return ['true', '1', 'yes', 'on'].includes(normalized);
}

let summaryIncludeColumnExists = null;

async function hasSummaryIncludeColumn() {
  if (summaryIncludeColumnExists !== null) return summaryIncludeColumnExists;

  const {rows} = await pool.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'summary_table'
        AND column_name = 'include_in_summary'
    ) AS exists
  `);
  summaryIncludeColumnExists = parseBooleanFlag(rows[0]?.exists);
  return summaryIncludeColumnExists;
}

async function getSummaryVisibilityCondition(alias = '') {
  const prefix = alias ? `${alias}.` : '';
  return (await hasSummaryIncludeColumn()) ? ` AND ${prefix}include_in_summary IS DISTINCT FROM FALSE` : '';
}

function parseNullableNumber(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function validateLatLon(latitude, longitude) {
  const errors = [];
  if (latitude !== null && (Number.isNaN(latitude) || latitude < -90 || latitude > 90)) {
    errors.push('Latitude must be between -90 and 90.');
  }
  if (longitude !== null && (Number.isNaN(longitude) || longitude < -180 || longitude > 180)) {
    errors.push('Longitude must be between -180 and 180.');
  }
  return errors;
}

function makeSafeImageName(originalName) {
  const ext = path.extname(originalName || '').toLowerCase();
  const stem = path.basename(originalName || 'site-image', ext)
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'site-image';
  return `${Date.now()}-${stem}${ext}`;
}

const siteImageUpload = multer({
  storage: multer.diskStorage({
    destination: siteImageDir,
    filename: (req, file, cb) => cb(null, makeSafeImageName(file.originalname))
  }),
  limits: {fileSize: 8 * 1024 * 1024},
  fileFilter: (req, file, cb) => {
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    if (!allowed.has(file.mimetype)) {
      return cb(new Error('Only JPG, PNG, WEBP, and GIF images are allowed.'));
    }
    cb(null, true);
  }
});

app.get('/api/backfill/walkthrough', async (req, res) => {
  if (!requireTechnician(req, res)) return;
  res.json({
    title: 'Technician backfill workflow',
    steps: [
      'Choose the public site and table that already exist in Unified Mapping.',
      'Download the CSV template. Keep the timestamp column and the generated field headers unchanged.',
      'Paste historical values into the template. Use SAST timestamps unless the timestamp includes an explicit timezone.',
      'Run Preflight. Fix unknown columns, duplicate timestamps, blank timestamps, or rows with no values.',
      'Import only after Preflight passes. Existing field/timestamp values are updated; new values are inserted.',
      'Open the Data page and refresh availability/downloads for the same site and table.',
    ],
    csvRules: [
      'Required timestamp headers: timestamp, time, datetime, or date_time.',
      'Field headers must exactly match the template display field names.',
      'Blank values are skipped.',
      'Each upload is capped at 20,000 timestamp rows and 250,000 values.',
      'Imports are audited in backfill_jobs.',
    ],
  });
});

app.get('/api/backfill/template', async (req, res) => {
  if (!requireTechnician(req, res)) return;

  const serverName = normalizeText(req.query.serverName);
  const tableName = normalizeText(req.query.tableName);
  if (!serverName || !tableName) {
    return res.status(400).json({message: 'serverName and tableName are required.'});
  }

  try {
    const fields = await getBackfillFields(pool, serverName, tableName);
    if (!fields.length) {
      return res.status(404).json({message: 'No mapped public fields found for this site/table.'});
    }

    const headers = ['timestamp', ...fields.map((field) => field.display_field_name)];
    const example = ['2026-08-13 12:00:00', ...fields.map(() => '')];
    const csv = `${headers.map(csvEscape).join(',')}\n${example.map(csvEscape).join(',')}\n`;
    const filename = `${serverName}_${tableName}_backfill_template.csv`.replace(/[^a-z0-9._-]+/gi, '_');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error('GET /api/backfill/template failed:', error);
    res.status(500).json({message: 'Failed to generate backfill template.', error: error.message});
  }
});

app.post('/api/backfill/preflight', (req, res) => {
  if (!requireTechnician(req, res)) return;

  backfillCsvUpload.single('file')(req, res, async (uploadError) => {
    const serverName = normalizeText(req.body.serverName);
    const tableName = normalizeText(req.body.tableName);
    const client = await pool.connect();

    try {
      if (uploadError) return res.status(400).json({message: uploadError.message || 'Upload failed.'});
      if (!serverName || !tableName) return res.status(400).json({message: 'serverName and tableName are required.'});
      if (!req.file?.buffer) return res.status(400).json({message: 'CSV file is required.'});

      const result = await validateBackfillCsv(client, {
        serverName,
        tableName,
        fileBuffer: req.file.buffer,
      });
      const status = result.ok ? 'passed' : 'failed';
      const job = await recordBackfillJob(client, req, {
        serverName,
        tableName,
        fileName: req.file.originalname,
        mode: 'preflight',
        status,
        rowCount: result.rowCount,
        valueCount: result.valueCount,
        warnings: result.warnings,
        errors: result.errors,
      });

      res.status(result.ok ? 200 : 400).json({
        ok: result.ok,
        job,
        rowCount: result.rowCount,
        rowsWithValues: result.rowsWithValues,
        valueCount: result.valueCount,
        fieldCount: result.fields.length,
        warnings: result.warnings,
        errors: result.errors,
      });
    } catch (error) {
      console.error('POST /api/backfill/preflight failed:', error);
      res.status(500).json({message: 'Backfill preflight failed.', error: error.message});
    } finally {
      client.release();
    }
  });
});

app.post('/api/backfill/import', (req, res) => {
  if (!requireTechnician(req, res)) return;

  backfillCsvUpload.single('file')(req, res, async (uploadError) => {
    const serverName = normalizeText(req.body.serverName);
    const tableName = normalizeText(req.body.tableName);
    const client = await pool.connect();

    try {
      if (uploadError) return res.status(400).json({message: uploadError.message || 'Upload failed.'});
      if (!serverName || !tableName) return res.status(400).json({message: 'serverName and tableName are required.'});
      if (!req.file?.buffer) return res.status(400).json({message: 'CSV file is required.'});

      const result = await validateBackfillCsv(client, {
        serverName,
        tableName,
        fileBuffer: req.file.buffer,
      });

      if (!result.ok) {
        const failedJob = await recordBackfillJob(client, req, {
          serverName,
          tableName,
          fileName: req.file.originalname,
          mode: 'import',
          status: 'failed',
          rowCount: result.rowCount,
          valueCount: result.valueCount,
          warnings: result.warnings,
          errors: result.errors,
        });
        return res.status(400).json({
          ok: false,
          job: failedJob,
          message: 'Import blocked by preflight errors.',
          warnings: result.warnings,
          errors: result.errors,
        });
      }

      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_lock(hashtext('technician_backfill'))`);

      let insertedOrUpdatedCount = 0;
      const batchSize = 5000;
      for (let offset = 0; offset < result.valueRows.length; offset += batchSize) {
        const batch = result.valueRows.slice(offset, offset + batchSize);
        const params = [];
        const valuesSql = batch.map((item, index) => {
          const base = index * 4;
          params.push(item.fieldId, item.timestamp, item.value, item.status);
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
        }).join(',');
        const insertResult = await client.query(
          `
            INSERT INTO field_values (field_id, "timestamp", value, status)
            VALUES ${valuesSql}
            ON CONFLICT (field_id, "timestamp") DO UPDATE
            SET value = EXCLUDED.value,
                status = EXCLUDED.status
            WHERE field_values.value IS DISTINCT FROM EXCLUDED.value
               OR field_values.status IS DISTINCT FROM EXCLUDED.status
          `,
          params,
        );
        insertedOrUpdatedCount += insertResult.rowCount;
      }

      const job = await recordBackfillJob(client, req, {
        serverName,
        tableName,
        fileName: req.file.originalname,
        mode: 'import',
        status: 'imported',
        rowCount: result.rowCount,
        valueCount: result.valueCount,
        insertedOrUpdatedCount,
        warnings: result.warnings,
        errors: [],
      });

      await client.query('COMMIT');
      await client.query(`SELECT pg_advisory_unlock(hashtext('technician_backfill'))`).catch(() => {});

      res.json({
        ok: true,
        job,
        rowCount: result.rowCount,
        rowsWithValues: result.rowsWithValues,
        valueCount: result.valueCount,
        insertedOrUpdatedCount,
        warnings: result.warnings,
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      await client.query(`SELECT pg_advisory_unlock(hashtext('technician_backfill'))`).catch(() => {});
      console.error('POST /api/backfill/import failed:', error);
      res.status(500).json({message: 'Backfill import failed.', error: error.message});
    } finally {
      client.release();
    }
  });
});

app.get('/api/backfill/jobs', async (req, res) => {
  if (!requireTechnician(req, res)) return;
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);

  try {
    const {rows} = await pool.query(
      `
        SELECT id, created_at, created_by_username, server_name, table_name, file_name,
               mode, status, row_count, value_count, inserted_or_updated_count, warnings, errors
        FROM backfill_jobs
        ORDER BY created_at DESC
        LIMIT $1
      `,
      [limit],
    );
    res.json({items: rows, count: rows.length});
  } catch (error) {
    console.error('GET /api/backfill/jobs failed:', error);
    res.status(500).json({message: 'Failed to fetch backfill jobs.', error: error.message});
  }
});

const backfillCsvUpload = multer({
  storage: multer.memoryStorage(),
  limits: {fileSize: 25 * 1024 * 1024},
  fileFilter: (req, file, cb) => {
    const allowedMime = new Set(['text/csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream']);
    const isCsvName = /\.csv$/i.test(file.originalname || '');
    if (!isCsvName && !allowedMime.has(file.mimetype)) {
      return cb(new Error('Upload a CSV file exported from the backfill template.'));
    }
    cb(null, true);
  }
});

async function fetchLocation(ip) {
    const maxRetries = 3;
    const retryDelay = 1000; // 1 second delay between retries
    const services = [

        async () => axios.get(`http://ip-api.com/json/${ip}`),
        async () => axios.get(`https://geolocation-db.com/json/${ip}&position=true`),
        async () => axios.get(`https://ipwhois.app/json/${ip}`)
    ];

    for (let service of services) {
        let attempt = 0;
        while (attempt < maxRetries) {
            try {
                const response = await service();
                if (response.data && response.data.success !== false) {
                    return response.data;
                } else {
                    console.warn(`Service returned an unsuccessful response: ${response.data.message || 'Unknown error'}`);
                }
            } catch (error) {
                console.error(`Attempt ${attempt + 1} with service failed: ${error.message}`);
            }

            // Increment attempt counter and delay before the next attempt
            attempt++;
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
    }

    throw new Error('Failed to fetch location after trying all services');
}


// ===================================================================
// Issues API — accepts BOTH UUID and numeric ids for get/patch/delete
// Includes: create, mine, admin list, all-as-marc, get/patch/delete by id, summary
// ===================================================================

function getAuth(req) {
  return {
    username: req.user?.username || req.session?.user?.username || req.query.user || req.body?.createdByUser || null,
    role: req.user?.role || req.session?.user?.role || req.query.role || req.body?.createdByRole || null,
    userId: req.user?.id || req.session?.user?.id || req.query.userId || req.body?.userId || null,
  };
}

function requireSuperUser(req, res) {
  const role = req.user?.role || req.session?.user?.role || null;
  if (role !== 'SU') {
    res.status(role ? 403 : 401).json({message: 'SU access required.'});
    return false;
  }
  return true;
}

function requireTechnician(req, res) {
  const role = req.user?.role || req.session?.user?.role || null;
  if (!['Admin', 'SU'].includes(role)) {
    res.status(role ? 403 : 401).json({message: 'Technician access required.'});
    return false;
  }
  return true;
}

app.get('/api/background-status', async (req, res) => {
  if (!requireTechnician(req, res)) return;

  try {
    const [syncResult, summaryResult] = await Promise.all([
      pool.query('SELECT sync_time, last_data_availability_sync_time FROM last_synced WHERE id = 1'),
      pool.query('SELECT total_field_values_count, summary_data_count FROM field_values_summary WHERE id = 1'),
    ]);

    res.set('Cache-Control', 'no-store');
    res.json({
      ...backgroundStatus,
      serverTime: new Date().toISOString(),
      lastSynced: syncResult.rows[0]?.sync_time || null,
      lastDataAvailabilitySyncTime: syncResult.rows[0]?.last_data_availability_sync_time || null,
      totalFieldValues: Number(summaryResult.rows[0]?.total_field_values_count) || 0,
      totalSummaryRows: Number(summaryResult.rows[0]?.summary_data_count) || 0,
    });
  } catch (error) {
    console.error('Error fetching background status:', error);
    res.status(500).json({ message: 'Failed to fetch background status' });
  }
});

function csvEscape(value) {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsvText(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((csvRow) => csvRow.some((value) => normalizeText(value) !== ''));
}

function parseBackfillTimestamp(value) {
  const raw = normalizeText(value);
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const candidate = hasTimezone ? normalized : `${normalized}+02:00`;
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function isBackfillBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

async function getBackfillFields(client, serverName, tableName) {
  const {rows} = await client.query(
    `
      SELECT field_id, TRIM(display_field_name) AS display_field_name
      FROM summary_table
      WHERE TRIM(display_server_name) = $1
        AND TRIM(display_table_name) = $2
        AND field_id IS NOT NULL
        AND display_field_name IS NOT NULL
        AND TRIM(display_field_name) <> ''
      ORDER BY TRIM(display_field_name)
    `,
    [serverName, tableName],
  );
  return rows;
}

async function validateBackfillCsv(client, {serverName, tableName, fileBuffer}) {
  const errors = [];
  const warnings = [];
  const fields = await getBackfillFields(client, serverName, tableName);

  if (!fields.length) {
    errors.push('No mapped public fields were found for this site/table. Publish the mapping before backfilling data.');
    return {ok: false, errors, warnings, fields, rows: [], valueRows: [], rowCount: 0, valueCount: 0};
  }

  const csvText = fileBuffer.toString('utf8').replace(/^\uFEFF/, '');
  const parsedRows = parseCsvText(csvText);
  if (parsedRows.length < 2) {
    errors.push('CSV must include a header row and at least one data row.');
    return {ok: false, errors, warnings, fields, rows: [], valueRows: [], rowCount: 0, valueCount: 0};
  }

  const headers = parsedRows[0].map((header) => normalizeText(header));
  const timestampIndex = headers.findIndex((header) => ['timestamp', 'time', 'datetime', 'date_time'].includes(header.toLowerCase()));
  if (timestampIndex < 0) {
    errors.push('CSV must include a timestamp column.');
  }

  const duplicateHeaders = headers.filter((header, index) => header && headers.indexOf(header) !== index);
  if (duplicateHeaders.length) {
    errors.push(`Duplicate CSV headers: ${[...new Set(duplicateHeaders)].join(', ')}`);
  }

  const fieldByName = new Map(fields.map((field) => [field.display_field_name, field]));
  const fieldColumns = [];
  const unknownHeaders = [];

  headers.forEach((header, index) => {
    if (!header || index === timestampIndex) return;
    const field = fieldByName.get(header);
    if (field) {
      fieldColumns.push({index, header, fieldId: field.field_id});
    } else {
      unknownHeaders.push(header);
    }
  });

  if (unknownHeaders.length) {
    errors.push(`Unknown field columns for ${serverName} / ${tableName}: ${unknownHeaders.join(', ')}`);
  }
  if (!fieldColumns.length) {
    errors.push('CSV must include at least one field column from the template.');
  }

  const dataRows = parsedRows.slice(1);
  if (dataRows.length > 20000) {
    errors.push('Backfill uploads are capped at 20,000 timestamp rows per import. Split the file into smaller date windows.');
  }

  const seenTimestamps = new Set();
  const valueRows = [];
  let rowsWithValues = 0;

  dataRows.forEach((csvRow, rowOffset) => {
    const rowNumber = rowOffset + 2;
    const timestamp = parseBackfillTimestamp(csvRow[timestampIndex]);
    if (!timestamp) {
      errors.push(`Row ${rowNumber}: invalid or blank timestamp.`);
      return;
    }

    const timestampKey = timestamp.toISOString();
    if (seenTimestamps.has(timestampKey)) {
      errors.push(`Row ${rowNumber}: duplicate timestamp ${timestampKey}.`);
      return;
    }
    seenTimestamps.add(timestampKey);

    let rowValueCount = 0;
    fieldColumns.forEach((column) => {
      const rawValue = csvRow[column.index];
      if (isBackfillBlank(rawValue)) return;
      const value = String(rawValue).trim();
      if (value.length > 1000) {
        errors.push(`Row ${rowNumber}, ${column.header}: value is longer than 1000 characters.`);
        return;
      }
      valueRows.push({
        fieldId: column.fieldId,
        timestamp,
        value,
        status: 'backfilled',
      });
      rowValueCount += 1;
    });
    if (rowValueCount > 0) rowsWithValues += 1;
  });

  if (!valueRows.length) {
    errors.push('No non-blank data values were found to import.');
  }
  if (dataRows.length !== rowsWithValues) {
    warnings.push(`${dataRows.length - rowsWithValues} timestamp row(s) contain no field values and will be skipped.`);
  }
  if (valueRows.length > 250000) {
    errors.push('Backfill uploads are capped at 250,000 values per import. Split the file into smaller files.');
  }

  return {
    ok: errors.length === 0,
    errors: errors.slice(0, 100),
    warnings: warnings.slice(0, 100),
    fields,
    headers,
    fieldColumns,
    rowCount: dataRows.length,
    rowsWithValues,
    valueCount: valueRows.length,
    valueRows,
  };
}

async function recordBackfillJob(client, req, payload) {
  const auth = getAuth(req);
  const {rows} = await client.query(
    `
      INSERT INTO backfill_jobs (
        created_by_user_id, created_by_username, server_name, table_name, file_name,
        mode, status, row_count, value_count, inserted_or_updated_count, warnings, errors
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)
      RETURNING id, created_at
    `,
    [
      auth.userId ? Number(auth.userId) : null,
      auth.username,
      payload.serverName,
      payload.tableName,
      payload.fileName || null,
      payload.mode,
      payload.status,
      payload.rowCount || 0,
      payload.valueCount || 0,
      payload.insertedOrUpdatedCount || 0,
      JSON.stringify(payload.warnings || []),
      JSON.stringify(payload.errors || []),
    ],
  );
  return rows[0];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INT_RE  = /^\d+$/;

function classifyId(idStr) {
  if (typeof idStr !== 'string') return null;
  if (UUID_RE.test(idStr)) return { kind: 'uuid', value: idStr };
  if (INT_RE.test(idStr))  return { kind: 'int', value: parseInt(idStr, 10) };
  return null;
}

// ----------------------------------------------------------
// POST /api/issues (create new)
// ----------------------------------------------------------
app.post('/api/issues', async (req, res) => {
  try {
    const { username, role } = getAuth(req);
    const {
      summary,
      details = null,
      severity = 'low',
      contactEmail = null,
      labels = null,
      meta = null,
      userMessage = null
    } = req.body || {};

    if (!summary || summary.trim().length < 4)
      return res.status(400).json({ message: 'Summary must be at least 4 characters.' });

    const sev = ['low','medium','high'].includes(severity) ? severity : 'low';
    const createdBy = (username || 'unknown').trim();

    const { rows } = await pool.query(
      `INSERT INTO ops.reported_issues
          (summary, details, severity, contact_email, labels, meta_json,
          created_by_user, created_by_role, user_message, status)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,'open')
        RETURNING id, created_at, updated_at, created_by_user, created_by_role,
                  summary, details, severity, status, contact_email, labels, meta_json, user_message`,
      [
        summary.trim(), details, sev,
        contactEmail, labels || null, meta ? JSON.stringify(meta) : null,
        createdBy, role || null, userMessage
      ]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('create issue:', err);
    res.status(500).json({ message: 'Failed to create issue' });
  }
});

// ----------------------------------------------------------
// GET /api/issues/mine (current user's issues)
// ----------------------------------------------------------
app.get('/api/issues/mine', async (req, res) => {
  try {
    const { username } = getAuth(req);
    if (!username) return res.status(400).json({ message: 'User not specified' });

    const status = req.query.status;
    const params = [username];
    let where = 'LOWER(created_by_user) = LOWER($1)';
    if (status && ['open','in_progress','resolved','closed'].includes(status)) {
      params.push(status); where += ` AND status = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT id, created_at, updated_at, created_by_user,
              summary, details, severity, status, labels, user_message
        FROM ops.reported_issues
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT 200`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error('list mine:', err);
    res.status(500).json({ message: 'Failed to fetch issues' });
  }
});

// ----------------------------------------------------------
// GET /api/issues (Admin or SU only)
// ----------------------------------------------------------
app.get('/api/issues', async (req, res) => {
  try {
    const { role } = getAuth(req);
    if (!['Admin','SU'].includes(role)) return res.status(403).json({ message: 'Forbidden' });

    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || '20', 10), 1), 200);

    const params = [];
    const where = [];
    if (req.query.status && ['open','in_progress','resolved','closed'].includes(req.query.status)) {
      params.push(req.query.status); where.push(`status = $${params.length}`);
    }
    if (req.query.q) {
      params.push(`%${req.query.q.toLowerCase()}%`);
      where.push(`(LOWER(summary) LIKE $${params.length} OR LOWER(details) LIKE $${params.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (page - 1) * pageSize;

    const { rows } = await pool.query(
      `SELECT id, created_at, updated_at, created_by_user, created_by_role,
              summary, details, severity, status, labels, user_message
        FROM ops.reported_issues
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, pageSize, offset]
    );

    const { rows: tot } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM ops.reported_issues ${whereSql}`, params
    );

    res.json({ items: rows, total: tot[0].total, page, pageSize });
  } catch (err) {
    console.error('admin list:', err);
    res.status(500).json({ message: 'Failed to fetch issues' });
  }
});

// ----------------------------------------------------------
// GET /api/issues/all-as-marc (special for Marc SU id=14)
// ----------------------------------------------------------
app.get('/api/issues/all-as-marc', async (req, res) => {
  try {
    const { username, role, userId } = getAuth(req);
    const isMarcSU14 =
    String(role).toUpperCase() === 'SU' &&
    String(username).toLowerCase() === 'marc' &&
    String(userId) === '14';

    if (!isMarcSU14) return res.status(403).json({ message: 'Forbidden' });

    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || '20', 10), 1), 200);

    const params = [];
    const where = [];
    if (req.query.status && ['open','in_progress','resolved','closed'].includes(req.query.status)) {
      params.push(req.query.status); where.push(`status = $${params.length}`);
    }
    if (req.query.q) {
      params.push(`%${req.query.q.toLowerCase()}%`);
      where.push(`(LOWER(summary) LIKE $${params.length} OR LOWER(details) LIKE $${params.length})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (page - 1) * pageSize;

    const { rows } = await pool.query(
      `SELECT id, created_at, updated_at, created_by_user, created_by_role,
              summary, details, severity, status, labels, user_message
        FROM ops.reported_issues
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, pageSize, offset]
    );

    const { rows: tot } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM ops.reported_issues ${whereSql}`, params
    );

    res.json({ items: rows, total: tot[0].total, page, pageSize });
  } catch (err) {
    console.error('all-as-marc:', err);
    res.status(500).json({ message: 'Failed to fetch all issues' });
  }
});

// ===================================================================
// Shared helpers for :id routes (accept uuid or int)
// ===================================================================
async function loadIssueByIdFlexible(idStr) {
  const kind = classifyId(idStr);
  if (!kind) return { error: 'Bad id format' };

  if (kind.kind === 'uuid') {
    const { rows } = await pool.query(`SELECT * FROM ops.reported_issues WHERE id = $1::uuid`, [kind.value]);
    return { rows };
  } else {
    const { rows } = await pool.query(`SELECT * FROM ops.reported_issues WHERE id = $1::int`, [kind.value]);
    return { rows };
  }
}

async function deleteIssueByIdFlexible(idStr) {
  const kind = classifyId(idStr);
  if (!kind) return { error: 'Bad id format' };

  const sql = kind.kind === 'uuid'
  ? `DELETE FROM ops.reported_issues WHERE id = $1::uuid`
  : `DELETE FROM ops.reported_issues WHERE id = $1::int`;

  const { rowCount } = await pool.query(sql, [kind.value]);
  return { rowCount };
}

async function updateIssueByIdFlexible(idStr, sets, vals) {
  const kind = classifyId(idStr);
  if (!kind) return { error: 'Bad id format' };

  const sql = `
    UPDATE ops.reported_issues
        SET ${sets.join(', ')}
      WHERE id = $${vals.length + 1}::${kind.kind === 'uuid' ? 'uuid' : 'int'}
      RETURNING *`;
  const { rows } = await pool.query(sql, [...vals, kind.value]);
  return { rows };
}

// ----------------------------------------------------------
// GET /api/issues/summary (status counts)
// Must be registered before /api/issues/:id.
// ----------------------------------------------------------
app.get('/api/issues/summary', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT status, COUNT(*)::int AS count
      FROM ops.reported_issues
      GROUP BY status
    `);
    const summary = rows.reduce((acc, r) => ({ ...acc, [r.status]: r.count }), {});
    res.json({ summary });
  } catch (err) {
    console.error('summary:', err);
    res.status(500).json({ message: 'Failed to fetch summary' });
  }
});

// ----------------------------------------------------------
// GET /api/issues/:id  (uuid OR numeric)
// ----------------------------------------------------------
app.get('/api/issues/:id', async (req, res) => {
  try {
    const { username, role } = getAuth(req);
    if (!username && !role) return res.status(401).json({ message: 'Login required' });

    const { error, rows } = await loadIssueByIdFlexible(req.params.id);
    if (error) return res.status(400).json({ message: error });
    if (!rows.length) return res.status(404).json({ message: 'Not found' });

    const issue = rows[0];
    const canView =
    String(issue.created_by_user || '').toLowerCase() === String(username || '').toLowerCase() ||
    ['Admin','SU'].includes(role);
    if (!canView) return res.status(403).json({ message: 'Forbidden' });

    res.json(issue);
  } catch (err) {
    console.error('get by id:', err);
    res.status(500).json({ message: 'Failed to fetch issue' });
  }
});

// ----------------------------------------------------------
// PATCH /api/issues/:id  (uuid OR numeric; owner OR Admin/SU)
// ----------------------------------------------------------
app.patch('/api/issues/:id', async (req, res) => {
  try {
    const { username, role } = getAuth(req);
    if (!username && !role) return res.status(401).json({ message: 'Login required' });

    const { error, rows } = await loadIssueByIdFlexible(req.params.id);
    if (error) return res.status(400).json({ message: error });
    if (!rows.length) return res.status(404).json({ message: 'Not found' });

    const owner = String(rows[0].created_by_user || '').toLowerCase();
    const isOwner = owner === String(username || '').toLowerCase();
    const isAdmin = ['Admin','SU'].includes(role);

    const { summary, details, contactEmail, severity, status, labels, userMessage } = req.body || {};
    const sets = [];
    const vals = [];

    if (isOwner || isAdmin) {
      if (summary !== undefined) {
        if (String(summary).trim().length < 4)
          return res.status(400).json({ message: 'Summary must be at least 4 characters' });
        sets.push(`summary = $${sets.length + 1}`); vals.push(summary);
      }
      if (details !== undefined)      { sets.push(`details = $${sets.length + 1}`); vals.push(details); }
      if (contactEmail !== undefined) { sets.push(`contact_email = $${sets.length + 1}`); vals.push(contactEmail); }
    }

    if (isAdmin) {
      if (severity !== undefined) {
        const sev = ['low','medium','high'].includes(severity) ? severity : null;
        if (!sev) return res.status(400).json({ message: 'Bad severity' });
        sets.push(`severity = $${sets.length + 1}`); vals.push(sev);
      }
      if (status !== undefined) {
        const st = ['open','in_progress','resolved','closed'].includes(status) ? status : null;
        if (!st) return res.status(400).json({ message: 'Bad status' });
        sets.push(`status = $${sets.length + 1}`); vals.push(st);
      }
      if (labels !== undefined)      { sets.push(`labels = $${sets.length + 1}`); vals.push(labels); }
      if (userMessage !== undefined) { sets.push(`user_message = $${sets.length + 1}`); vals.push(userMessage); }
    }

    if (!sets.length) return res.status(403).json({ message: 'No editable fields for your role' });

    sets.push('updated_at = now()');
    const upd = await updateIssueByIdFlexible(req.params.id, sets, vals);
    if (upd.error) return res.status(400).json({ message: upd.error });
    res.json(upd.rows[0]);
  } catch (err) {
    console.error('update issue:', err);
    res.status(500).json({ message: 'Failed to update issue' });
  }
});

// ----------------------------------------------------------
// DELETE /api/issues/:id  (uuid OR numeric; owner OR Admin/SU)
// ----------------------------------------------------------
app.delete('/api/issues/:id', async (req, res) => {
  try {
    const { username, role } = getAuth(req);
    if (!username && !role) return res.status(401).json({ message: 'Login required' });

    const loaded = await loadIssueByIdFlexible(req.params.id);
    if (loaded.error) return res.status(400).json({ message: loaded.error });
    if (!loaded.rows.length) return res.status(404).json({ message: 'Not found' });

    const issue = loaded.rows[0];
    const isOwner = String(issue.created_by_user || '').toLowerCase() === String(username || '').toLowerCase();
    const isAdmin = ['Admin','SU'].includes(role);
    if (!isOwner && !isAdmin) return res.status(403).json({ message: 'Forbidden' });

    const del = await deleteIssueByIdFlexible(req.params.id);
    if (del.error) return res.status(400).json({ message: del.error });

    if (!del.rowCount) return res.status(404).json({ message: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('delete issue:', err);
    res.status(500).json({ message: 'Failed to delete issue' });
  }
});

// Put this near the top of your server file (outside the handler)
const SUMMARY_SQL = {
  name: 'get_field_values_summary_v1',
  text: 'SELECT total_field_values_count, summary_data_count FROM field_values_summary WHERE id = 1'
};

// Optional: run once at startup to ensure the singleton row exists
// await pool.query(`INSERT INTO field_values_summary (id, total_field_values_count, summary_data_count)
//                   VALUES (1, 0, 0) ON CONFLICT (id) DO NOTHING`);

app.get('/api/total-field-values', async (req, res) => {
  try {
    const result = await pool.query(SUMMARY_SQL);
    const row = result.rows[0];

    // pg can return BIGINT as strings — cast defensively
    const payload = {
      totalDataValues: row ? Number(row.total_field_values_count) || 0 : 0,
      totalRawValues:  row ? Number(row.summary_data_count)       || 0 : 0
    };

    res.json(payload); // no double await
  } catch (error) {
    console.error('Error fetching field values summary:', error);
    res.status(500).json({ message: 'Error fetching field values summary' });
  }
});


app.get('/api/unified_mapping_table/sankey', async (req, res) => {
    const includeInSummary = req.query.includeInSummary === 'true';
    const selectedServers = Array.isArray(req.query.selectedServers) ? req.query.selectedServers : [req.query.selectedServers];

    try {
        let query = `
      SELECT
        current_server_name,
        display_server_name,
        current_table_name,
        display_table_name,
        current_field_name,
        display_field_name
      FROM unified_mapping_table
      WHERE include_in_summary = $1
    `;

        const params = [includeInSummary];

        if (selectedServers.length > 0 && selectedServers[0] !== undefined) {
            query += ` AND display_server_name = ANY($2)`;
            params.push(selectedServers);
        }

        const result = await pool.query(query, params);

        const nodes = [];
        const links = [];

        const addNode = (name) => {
            if (!nodes.find(node => node.name === name)) {
                nodes.push({name});
            }
        };

        result.rows.forEach(row => {
            addNode(row.current_server_name);
            addNode(row.display_server_name);
            addNode(row.current_table_name);
            addNode(row.display_table_name);
            addNode(row.current_field_name);
            addNode(row.display_field_name);

            links.push({source: row.current_server_name, target: row.display_server_name, value: 1});
            links.push({source: row.display_server_name, target: row.current_table_name, value: 1});
            links.push({source: row.current_table_name, target: row.display_table_name, value: 1});
            links.push({source: row.display_table_name, target: row.current_field_name, value: 1});
            links.push({source: row.current_field_name, target: row.display_field_name, value: 1});
        });

        await await res.json({nodes, links});
    } catch (error) {
        console.error('Error fetching Sankey data:', error);
        res.status(500).send('Server Error');
    }
});

app.get('/api/images', (req, res) => {
    const imagesDir = path.join(__dirname, 'public/images');

    fs.readdir(imagesDir, (err, files) => {
        if (err) {
            console.error('Error reading images directory:', err);
            return res.status(500).json({message: 'Error reading images directory'});
        }

        // Filter only image files (optional)
        const imageFiles = files.filter(file => {
            return ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(path.extname(file).toLowerCase());
        });

        res.json({files: imageFiles});
    });
});

app.post('/api/site_mappings/image', (req, res) => {
    if (!requireSuperUser(req, res)) return;

    siteImageUpload.single('image')(req, res, async (error) => {
        if (error) {
            return res.status(400).json({message: error.message || 'Image upload failed.'});
        }

        if (!req.file) {
            return res.status(400).json({message: 'No image file supplied.'});
        }

        const siteId = Number(req.body.siteId);
        if (Number.isInteger(siteId) && siteId > 0) {
            const updateResult = await pool.query(
              `UPDATE site_mapping SET image = $1 WHERE site_id = $2`,
              [req.file.filename, siteId]
            );
            if (updateResult.rowCount === 0) {
                return res.status(404).json({message: 'Image uploaded, but no matching site mapping row was found.'});
            }
        }

        res.status(201).json({
            fileName: req.file.filename,
            imageUrl: `/images/${encodeURIComponent(req.file.filename)}`,
            persisted: Number.isInteger(siteId) && siteId > 0
        });
    });
});

app.post('/api/log_interaction', async (req, res) => {
    const {
        ip,
        interaction_type,
        request_path,
        referrer,
        user_agent,
        status_code,
        response_size,
        additional_data,
        session_id,
        user_id
    } = req.body;

    const timestamp = new Date();
    let location = null;

    try {
        location = await fetchLocation(ip);
    } catch (error) {
        console.warn('Failed to fetch location, proceeding without it:', error.message);
    }

    try {
        await pool.query(
            `INSERT INTO user_interactions
      (user_id, ip, interaction_type, request_path, referrer, user_agent, status_code, response_size, timestamp, additional_data, session_id, location)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (ip, user_agent, interaction_type, request_path, date_trunc('minute', timestamp))
      DO NOTHING`,
            [user_id, ip, interaction_type, request_path, referrer, user_agent, status_code, response_size, timestamp, additional_data, session_id, location]
        );
        res.status(200).send({success: true});
    } catch (error) {
        console.error('Error logging interaction:', error);
        res.status(500).send({success: false, error: 'Failed to log interaction'});
    }
});

app.post('/api/check_and_log_interaction', async (req, res) => {
    const {
        ip,
        interaction_type,
        request_path,
        referrer,
        user_agent,
        status_code,
        response_size,
        additional_data,
        session_id,
        user_id,
        timestamp // This is now passed from the client
    } = req.body;

    const requestIp =
        ip ||
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress ||
        null;
    const safeAdditionalData = additional_data || {};

    const eventTimestamp = timestamp ? new Date(timestamp) : new Date();
    if (Number.isNaN(eventTimestamp.getTime())) {
        return res.status(400).send({success: false, error: 'Invalid timestamp'});
    }

    // Calculate the interaction hour based on the provided timestamp
    const interactionHour = new Date(eventTimestamp);
    interactionHour.setMinutes(0, 0, 0); // Truncate to the hour

    let location = null;

    try {
        if (ip) {
            location = await fetchLocation(ip);
        }

        // Check if a similar interaction exists for the same hour
        const existingInteraction = await pool.query(
            `SELECT id FROM user_interactions
        WHERE interaction_type = $1
        AND request_path = $2
        AND interaction_hour = $3
        AND (user_id = $4 OR (user_id IS NULL AND $4 IS NULL))
        AND session_id = $5
        AND md5(additional_data::text) = md5($6::text)
      LIMIT 1`,
            [interaction_type, request_path, interactionHour, user_id, session_id, safeAdditionalData]
        );

        if (existingInteraction.rows.length > 0) {
            // Interaction already logged for this hour
            return res.status(200).send({success: true, message: 'Interaction already logged for this hour.'});
        }

        // Proceed to log the interaction if no duplicate is found
        await pool.query(
            `INSERT INTO user_interactions
      (user_id, ip, interaction_type, request_path, referrer, user_agent, status_code, response_size, timestamp, additional_data, session_id, location, interaction_hour, interaction_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [user_id, requestIp, interaction_type, request_path, referrer, user_agent, status_code, response_size, eventTimestamp, safeAdditionalData, session_id, location, interactionHour, getSastDateParts(eventTimestamp).year + '-' + getSastDateParts(eventTimestamp).month + '-' + getSastDateParts(eventTimestamp).day]
        );

        res.status(200).send({success: true});

    } catch (error) {
        if (error.code === '23505') {
            // Handle unique constraint violation
            console.log('Duplicate interaction detected, skipping insert.');
            return res.status(200).send({success: true, message: 'Duplicate interaction detected and skipped.'});
        }

        console.error('Error logging interaction:', error);
        res.status(500).send({success: false, error: 'Failed to log interaction'});
    }
});


const publicApiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 240,
  message: 'Public API rate limit exceeded. Please wait a minute before retrying.',
  skip: isRateLimitExempt,
});

const publicDataLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Data API rate limit exceeded. JSON data pages are limited to 60 requests per minute. Please wait before retrying.',
  skip: isRateLimitExempt,
});

const publicDownloadLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 3,
  message: 'CSV download rate limit exceeded. Exports can be large, so downloads are limited to 3 starts per 10 minutes. Please wait before starting more downloads.',
  skip: isRateLimitExempt,
});

app.use('/api/summary_table/download', requireLoggedInPublicApi);
app.use(['/api/public', '/api/v1'], identifyOptionalPublicApiUser);
app.use('/api/public/download', publicDownloadLimiter);
app.use('/api/summary_table/download', publicDownloadLimiter);
app.use('/api/public', publicApiLimiter, publicApiAnalyticsMiddleware);
app.use(
  [
    '/api/public/servers',
    '/api/public/tables',
    '/api/public/date-range',
    '/api/public/download',
  ],
  requireLoggedInPublicApi,
);
app.use('/api/v1/status', publicApiLimiter, publicApiAnalyticsMiddleware);
app.use('/api/v1/data', requireLoggedInPublicApi, publicDataLimiter, publicApiAnalyticsMiddleware);
app.use('/api/v1/download', requireLoggedInPublicApi, publicDownloadLimiter, publicApiAnalyticsMiddleware);
app.use(
  [
    '/api/v1/sites',
    '/api/v1/tables',
    '/api/v1/date-range',
  ],
  requireLoggedInPublicApi,
  publicApiLimiter,
  publicApiAnalyticsMiddleware,
);

const SITE_STATUS_TYPES = new Set(['online', 'normal', 'done', 'testing', 'maintenance', 'warning', 'degraded', 'offline']);

async function ensureSiteStatusSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.site_status (
      id integer PRIMARY KEY DEFAULT 1,
      status text NOT NULL DEFAULT 'online',
      is_active boolean NOT NULL DEFAULT false,
      message text NOT NULL DEFAULT 'SAEON observations monitor API is online.',
      details text,
      updated_by text,
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT site_status_singleton CHECK (id = 1)
    )
  `);
  await pool.query(`ALTER TABLE public.site_status ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE public.site_status ADD COLUMN IF NOT EXISTS details text`);
  await pool.query(`ALTER TABLE public.site_status ADD COLUMN IF NOT EXISTS updated_by text`);
  await pool.query(`ALTER TABLE public.site_status ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`);
  await pool.query(`
    INSERT INTO public.site_status (id, status, is_active, message, details, updated_by, updated_at)
    VALUES (1, 'online', false, 'SAEON observations monitor API is online.', null, 'system', now())
    ON CONFLICT (id) DO NOTHING
  `);
}

async function ensureApiRoles() {
  await pool.query(`
    INSERT INTO roles (name)
    SELECT role_name
    FROM (VALUES ('User'), ('Admin'), ('SU'), ('Collaborators')) AS required(role_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM roles
      WHERE lower(name) = lower(required.role_name)
    )
  `);
}

app.get('/api/public/site-status', async (req, res) => {
  try {
    await ensureSiteStatusSchema();
    const {rows} = await pool.query(`
      SELECT status, is_active, message, details, updated_by, updated_at
      FROM site_status
      WHERE id = 1
      LIMIT 1
    `);

    const row = rows[0] || {};
    const status = String(row.status || 'online').trim().toLowerCase();
    const isActive = parseBooleanFlag(row.is_active);
    const severity = ['offline', 'degraded'].includes(status)
      ? 'danger'
      : ['warning', 'maintenance', 'testing'].includes(status)
        ? 'warning'
        : 'info';

    setNoStore(res);
    res.json({
      active: isActive,
      showBanner: isActive,
      status,
      type: status,
      severity,
      message: row.message || 'SAEON observations monitor API is online.',
      details: row.details || null,
      updatedBy: row.updated_by || null,
      updatedAt: row.updated_at || null,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('GET /api/public/site-status failed:', error);
    setNoStore(res);
    res.json({
      active: true,
      showBanner: true,
      status: 'offline',
      type: 'offline',
      severity: 'danger',
      message: 'SAEON observations monitor API is temporarily unreachable.',
      checkedAt: new Date().toISOString(),
    });
  }
});

app.get('/api/site-status', async (req, res) => {
  if (!requireSuperUser(req, res)) return;

  try {
    await ensureSiteStatusSchema();
    const {rows} = await pool.query(`
      SELECT status, is_active, message, details, updated_by, updated_at
      FROM public.site_status
      WHERE id = 1
      LIMIT 1
    `);
    const row = rows[0] || {};
    res.json({
      active: parseBooleanFlag(row.is_active),
      status: row.status || 'online',
      type: row.status || 'online',
      message: row.message || '',
      details: row.details || '',
      updatedBy: row.updated_by || null,
      updatedAt: row.updated_at || null,
    });
  } catch (error) {
    console.error('GET /api/site-status failed:', error);
    res.status(500).json({message: 'Failed to load site banner status.', error: error.message});
  }
});

app.put('/api/site-status', async (req, res) => {
  if (!requireSuperUser(req, res)) return;

  const active = parseBooleanFlag(req.body.active);
  const status = normalizeText(req.body.status || req.body.type || 'online').toLowerCase();
  const message = normalizeText(req.body.message);
  const details = normalizeOptionalText(req.body.details);

  if (!SITE_STATUS_TYPES.has(status)) {
    return res.status(400).json({message: `Banner type must be one of: ${Array.from(SITE_STATUS_TYPES).join(', ')}.`});
  }
  if (active && !message) {
    return res.status(400).json({message: 'Banner message is required when the banner is active.'});
  }

  try {
    await ensureSiteStatusSchema();
    const updatedBy = req.user?.username || req.session?.user?.username || 'unknown';
    const {rows} = await pool.query(
      `
        INSERT INTO public.site_status (id, status, is_active, message, details, updated_by, updated_at)
        VALUES (1, $1, $2, $3, $4, $5, now())
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          is_active = EXCLUDED.is_active,
          message = EXCLUDED.message,
          details = EXCLUDED.details,
          updated_by = EXCLUDED.updated_by,
          updated_at = now()
        RETURNING status, is_active, message, details, updated_by, updated_at
      `,
      [status, active, message || 'SAEON observations monitor API is online.', details, updatedBy],
    );
    const row = rows[0];
    res.json({
      active: parseBooleanFlag(row.is_active),
      status: row.status,
      type: row.status,
      message: row.message,
      details: row.details || '',
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
    });
  } catch (error) {
    console.error('PUT /api/site-status failed:', error);
    res.status(500).json({message: 'Failed to update site banner status.', error: error.message});
  }
});

app.get('/api/public/servers', async (req, res) => {
  try {
    const visibilityCondition = await getSummaryVisibilityCondition();
    let {rows} = await pool.query(`
      SELECT DISTINCT TRIM(display_server_name) AS site_name
      FROM summary_table
      WHERE display_server_name IS NOT NULL
        AND TRIM(display_server_name) <> ''
        ${visibilityCondition}
      ORDER BY TRIM(display_server_name)
    `);
    if (rows.length === 0 && visibilityCondition) {
      ({rows} = await pool.query(`
        SELECT DISTINCT TRIM(display_server_name) AS site_name
        FROM summary_table
        WHERE display_server_name IS NOT NULL
          AND TRIM(display_server_name) <> ''
        ORDER BY TRIM(display_server_name)
      `));
    }
    setNoStore(res);
    res.json({items: rows, count: rows.length});
  } catch (error) {
    console.error('GET /api/public/servers failed:', error);
    res.status(500).json({message: 'Failed to fetch public sites'});
  }
});

app.get('/api/public/tables', async (req, res) => {
  const serverName = normalizeText(req.query.serverName || req.query.server);
  if (!serverName) return res.status(400).json({message: 'serverName is required'});

  try {
    const visibilityCondition = await getSummaryVisibilityCondition();
    const fetchRows = (whereVisibilityCondition) => pool.query(
      `
        SELECT
          tn.display_table_name AS table_name,
          sdr.start_date,
          sdr.end_date,
          sdr.total_count
        FROM (
          SELECT DISTINCT btrim(display_table_name) AS display_table_name
          FROM summary_table
          WHERE btrim(display_server_name) = btrim($1)
            ${whereVisibilityCondition}
            AND display_table_name IS NOT NULL
            AND btrim(display_table_name) <> ''
        ) tn
        LEFT JOIN summary_data_date_ranges sdr
          ON btrim(sdr.server_name) = btrim($1)
         AND sdr.table_name = tn.display_table_name
        ORDER BY tn.display_table_name
      `,
      [serverName],
    );
    let {rows} = await fetchRows(visibilityCondition);
    if (rows.length === 0 && visibilityCondition) {
      ({rows} = await fetchRows(''));
    }
    setNoStore(res);
    res.json({serverName, items: rows, count: rows.length});
  } catch (error) {
    console.error('GET /api/public/tables failed:', error);
    res.status(500).json({message: 'Failed to fetch public tables'});
  }
});

app.get('/api/public/date-range', async (req, res) => {
  const serverName = normalizeText(req.query.serverName || req.query.server);
  const tableName = normalizeText(req.query.tableName || req.query.table);
  if (!serverName || !tableName) return res.status(400).json({message: 'serverName and tableName are required'});

  try {
    const {rows} = await pool.query(
      `
        SELECT start_date, end_date, total_count
        FROM summary_data_date_ranges
        WHERE server_name = $1
          AND table_name = $2
        LIMIT 1
      `,
      [serverName, tableName],
    );
    setNoStore(res);
    res.json({
      serverName,
      tableName,
      startDate: rows[0]?.start_date || null,
      endDate: rows[0]?.end_date || null,
      totalCount: Number(rows[0]?.total_count) || 0,
    });
  } catch (error) {
    console.error('GET /api/public/date-range failed:', error);
    res.status(500).json({message: 'Failed to fetch date range'});
  }
});

app.get('/api/public/download', async (req, res) => {
  const serverName = normalizeText(req.query.serverName || req.query.server);
  const tableName = normalizeText(req.query.tableName || req.query.table);
  const startDate = queryDateOnly(req, 'startDate', 'start');
  const endDate = queryDateOnly(req, 'endDate', 'end');

  if (!serverName || !tableName || !startDate || !endDate) {
    return res.status(400).json({
      message: 'serverName, tableName, startDate, and endDate are required for public downloads.',
    });
  }

  const parsedStart = parseDateOnly(startDate);
  const parsedEnd = parseDateOnly(endDate);
  if (!parsedStart || !parsedEnd || parsedEnd < parsedStart) {
    return res.status(400).json({message: 'Dates must use YYYY-MM-DD and endDate must be on or after startDate.'});
  }

  if (daySpan(parsedStart, parsedEnd) > 31) {
    return res.status(400).json({
      message: 'Public downloads are limited to 31 days per request. Split larger exports into monthly requests.',
    });
  }

  res.redirect(
    307,
    `/api/summary_table/download?serverName=${encodeURIComponent(serverName)}&tableName=${encodeURIComponent(tableName)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
  );
});

app.get('/api/v1/status', async (req, res) => {
  try {
    const {rows} = await pool.query(`
      SELECT status, message, details, updated_by, updated_at
      FROM site_status
      WHERE id = 1
      LIMIT 1
    `);

    const row = rows[0] || {};
    const status = String(row.status || 'online').trim().toLowerCase();
    const isWarning = !['online', 'normal', 'done'].includes(status);

    setPublicCache(res, 30);
    res.json({
      active: !isWarning,
      status,
      severity: isWarning ? 'warning' : 'ok',
      message: row.message || 'SAEON observations monitor API is online.',
      details: row.details || null,
      updatedBy: row.updated_by || null,
      updatedAt: row.updated_at || null,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('GET /api/v1/status failed:', error);
    setPublicCache(res, 15);
    res.json({
      active: true,
      status: 'online',
      severity: 'ok',
      message: 'SAEON observations monitor API is online.',
      checkedAt: new Date().toISOString(),
    });
  }
});

app.get('/api/v1/sites', async (req, res) => {
  try {
    const visibilityCondition = await getSummaryVisibilityCondition();
    let {rows} = await pool.query(`
      SELECT DISTINCT TRIM(display_server_name) AS site_name
      FROM summary_table
      WHERE display_server_name IS NOT NULL
        AND TRIM(display_server_name) <> ''
        ${visibilityCondition}
      ORDER BY TRIM(display_server_name)
    `);
    if (rows.length === 0 && visibilityCondition) {
      ({rows} = await pool.query(`
        SELECT DISTINCT TRIM(display_server_name) AS site_name
        FROM summary_table
        WHERE display_server_name IS NOT NULL
          AND TRIM(display_server_name) <> ''
        ORDER BY TRIM(display_server_name)
      `));
    }
    setNoStore(res);
    res.json({
      count: rows.length,
      items: rows,
      next: rows.length ? `/api/v1/tables?serverName=${encodeURIComponent(rows[0].site_name)}` : null,
    });
  } catch (error) {
    console.error('GET /api/v1/sites failed:', error);
    res.status(500).json({message: 'Failed to fetch public sites'});
  }
});

app.get('/api/v1/tables', async (req, res) => {
  const serverName = normalizeText(req.query.serverName || req.query.site || req.query.server);
  if (!serverName) return res.status(400).json({message: 'serverName is required'});

  try {
    const visibilityCondition = await getSummaryVisibilityCondition();
    const fetchRows = (whereVisibilityCondition) => pool.query(
      `
        SELECT
          tn.display_table_name AS table_name,
          sdr.start_date,
          sdr.end_date,
          sdr.total_count
        FROM (
          SELECT DISTINCT btrim(display_table_name) AS display_table_name
          FROM summary_table
          WHERE btrim(display_server_name) = btrim($1)
            ${whereVisibilityCondition}
            AND display_table_name IS NOT NULL
            AND btrim(display_table_name) <> ''
        ) tn
        LEFT JOIN summary_data_date_ranges sdr
          ON btrim(sdr.server_name) = btrim($1)
         AND sdr.table_name = tn.display_table_name
        ORDER BY tn.display_table_name
      `,
      [serverName],
    );
    let {rows} = await fetchRows(visibilityCondition);
    if (rows.length === 0 && visibilityCondition) {
      ({rows} = await fetchRows(''));
    }
    setNoStore(res);
    res.json({
      serverName,
      count: rows.length,
      items: rows,
      next: rows.length ? `/api/v1/date-range?serverName=${encodeURIComponent(serverName)}&tableName=${encodeURIComponent(rows[0].table_name)}` : null,
    });
  } catch (error) {
    console.error('GET /api/v1/tables failed:', error);
    res.status(500).json({message: 'Failed to fetch public tables'});
  }
});

app.get('/api/v1/date-range', async (req, res) => {
  const serverName = normalizeText(req.query.serverName || req.query.site || req.query.server);
  const tableName = normalizeText(req.query.tableName || req.query.table);
  if (!serverName || !tableName) return res.status(400).json({message: 'serverName and tableName are required'});

  try {
    const {rows} = await pool.query(
      `
        SELECT start_date, end_date, total_count
        FROM summary_data_date_ranges
        WHERE server_name = $1
          AND table_name = $2
        LIMIT 1
      `,
      [serverName, tableName],
    );
    const row = rows[0] || {};
    const startDateOnly = formatDateOnlyValue(row.start_date);
    const endDateOnly = formatDateOnlyValue(row.end_date);
    const exampleStartDate = endDateOnly ? `${endDateOnly.slice(0, 8)}01` : null;
    setNoStore(res);
    res.json({
      serverName,
      tableName,
      startDate: startDateOnly,
      endDate: endDateOnly,
      totalCount: Number(row.total_count) || 0,
      next: endDateOnly ? `/api/v1/data?serverName=${encodeURIComponent(serverName)}&tableName=${encodeURIComponent(tableName)}&startDate=${encodeURIComponent(exampleStartDate)}&endDate=${encodeURIComponent(endDateOnly)}` : null,
      csv: endDateOnly ? `/api/v1/download?serverName=${encodeURIComponent(serverName)}&tableName=${encodeURIComponent(tableName)}&startDate=${encodeURIComponent(exampleStartDate)}&endDate=${encodeURIComponent(endDateOnly)}` : null,
    });
  } catch (error) {
    console.error('GET /api/v1/date-range failed:', error);
    res.status(500).json({message: 'Failed to fetch date range'});
  }
});

app.get('/api/v1/data', async (req, res) => {
  const serverName = normalizeText(req.query.serverName || req.query.site || req.query.server);
  const tableName = normalizeText(req.query.tableName || req.query.table);
  const startDate = queryDateOnly(req, 'startDate', 'start');
  const endDate = queryDateOnly(req, 'endDate', 'end');
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 1000, 1), 5000);
  const after = normalizeText(req.query.after);

  if (!serverName || !tableName || !startDate || !endDate) {
    return res.status(400).json({
      message: 'serverName, tableName, startDate, and endDate are required for JSON data access.',
    });
  }

  const parsedStart = parseDateOnly(startDate);
  const parsedEnd = parseDateOnly(endDate);
  if (!parsedStart || !parsedEnd || parsedEnd < parsedStart) {
    return res.status(400).json({message: 'Dates must use YYYY-MM-DD and endDate must be on or after startDate.'});
  }

  if (daySpan(parsedStart, parsedEnd) > 31) {
    return res.status(400).json({
      message: 'JSON data requests are limited to 31 days per request. Split larger scripts into monthly windows.',
    });
  }

  const afterDate = after ? new Date(after) : null;
  if (after && Number.isNaN(afterDate.getTime())) {
    return res.status(400).json({message: 'after must be an ISO timestamp returned by the previous response.'});
  }

  try {
    const {rows} = await pool.query(
      `
        SELECT
          timestamp,
          TO_CHAR(timestamp AT TIME ZONE 'Africa/Johannesburg', 'YYYY-MM-DD"T"HH24:MI:SS') AS timestamp_sast,
          field_values,
          latitude,
          longitude
        FROM pre_aggregated_field_values
        WHERE display_table_name = $1
          AND display_server_name = $2
          AND timestamp >= ($3::date::timestamp AT TIME ZONE 'Africa/Johannesburg')
          AND timestamp < (($4::date + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg')
          AND ($5::timestamptz IS NULL OR timestamp > $5::timestamptz)
        ORDER BY timestamp ASC
        LIMIT $6
      `,
      [tableName, serverName, startDate, endDate, after || null, limit],
    );

    const fieldMap = new Map();
    const items = rows.map((row) => {
      const values = {};
      for (const entry of parseFieldEntries(row.field_values)) {
        const fieldName = normalizeText(entry?.display_field_name);
        const fieldValue = entry?.field_value;
        if (!fieldName || !isUsableDataValue(fieldValue)) continue;
        values[fieldName] = fieldValue;
        if (!fieldMap.has(fieldName)) {
          fieldMap.set(fieldName, {
            name: fieldName,
            units: normalizeText(entry?.units) || null,
          });
        }
      }

      const timestampUtc = row.timestamp instanceof Date
        ? row.timestamp.toISOString()
        : new Date(row.timestamp).toISOString();

      return {
        timestamp: row.timestamp_sast,
        timestampSast: row.timestamp_sast,
        timestampUtc,
        latitude: row.latitude,
        longitude: row.longitude,
        values,
      };
    });

    const lastItem = items[items.length - 1];
    const next = rows.length === limit && lastItem
      ? `/api/v1/data?serverName=${encodeURIComponent(serverName)}&tableName=${encodeURIComponent(tableName)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&limit=${limit}&after=${encodeURIComponent(lastItem.timestampUtc)}`
      : null;

    res.set('Cache-Control', 'private, max-age=60');
    res.json({
      serverName,
      tableName,
      startDate,
      endDate,
      timezone: 'Africa/Johannesburg',
      count: items.length,
      limit,
      next,
      csv: `/api/v1/download?serverName=${encodeURIComponent(serverName)}&tableName=${encodeURIComponent(tableName)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
      fields: Array.from(fieldMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
      items,
    });
  } catch (error) {
    console.error('GET /api/v1/data failed:', error);
    res.status(500).json({message: 'Failed to fetch JSON data'});
  }
});

app.get('/api/v1/download', async (req, res) => {
  const serverName = normalizeText(req.query.serverName || req.query.site || req.query.server);
  const tableName = normalizeText(req.query.tableName || req.query.table);
  const startDate = queryDateOnly(req, 'startDate', 'start');
  const endDate = queryDateOnly(req, 'endDate', 'end');

  if (!serverName || !tableName || !startDate || !endDate) {
    return res.status(400).json({
      message: 'serverName, tableName, startDate, and endDate are required for API downloads.',
    });
  }

  const parsedStart = parseDateOnly(startDate);
  const parsedEnd = parseDateOnly(endDate);
  if (!parsedStart || !parsedEnd || parsedEnd < parsedStart) {
    return res.status(400).json({message: 'Dates must use YYYY-MM-DD and endDate must be on or after startDate.'});
  }

  if (daySpan(parsedStart, parsedEnd) > 31) {
    return res.status(400).json({
      message: 'API downloads are limited to 31 days per request. Split larger exports into monthly requests.',
    });
  }

  res.redirect(
    307,
    `/api/summary_table/download?serverName=${encodeURIComponent(serverName)}&tableName=${encodeURIComponent(tableName)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
  );
});

app.get('/api/public/analytics/years', async (req, res) => {
  const todaySast = getSastDateParts();

  try {
    const result = await pool.query(`
      SELECT DISTINCT EXTRACT(YEAR FROM interaction_date)::int AS year
      FROM user_interactions
      WHERE interaction_date IS NOT NULL
      ORDER BY year DESC
    `);

    const years = result.rows
      .map((row) => row.year)
      .filter((year) => Number.isInteger(year));
    const currentYear = Number(todaySast.year);

    if (!years.includes(currentYear)) {
      years.unshift(currentYear);
    }

    setNoStore(res);
    res.json({ years, currentYear });
  } catch (error) {
    console.error('Error fetching public analytics years:', error);
    res.status(500).json({ message: 'Failed to fetch public analytics years' });
  }
});


app.get('/api/public/analytics/highlights', async (req, res) => {
  const todaySast = getSastDateParts();
  const safeYear = /^\d{4}$/.test(String(req.query.year || '')) ? String(req.query.year) : todaySast.year;
  const startDate = `${safeYear}-01-01`;
  const endDate = `${safeYear}-12-31`;

  try {
    const [
      interactionsResult,
      allInteractionsResult,
      downloadsResult,
      allDownloadsResult,
      webDownloadsResult,
      apiDownloadsResult,
      apiRequestsResult,
      allApiRequestsResult,
      activeSitesResult,
      datasetsResult,
    ] = await Promise.all([
      pool.query(
        `
          SELECT COUNT(*)::int AS count
          FROM user_interactions
          WHERE interaction_date BETWEEN $1 AND $2
        `,
        [startDate, endDate]
      ),
      pool.query(
        `
          SELECT COUNT(*)::int AS count
          FROM user_interactions
        `
      ),
      pool.query(
        `
          SELECT COUNT(*)::int AS count
          FROM user_interactions
	          WHERE interaction_date BETWEEN $1 AND $2
	            AND (
	              interaction_type IN ('download_data', 'download_table_button_clicked')
	              OR interaction_type = 'api_download'
	              OR request_path LIKE '/api/public/download%'
	            )
	        `,
        [startDate, endDate]
      ),
      pool.query(
        `
          SELECT COUNT(*)::int AS count
          FROM user_interactions
          WHERE interaction_type IN ('download_data', 'download_table_button_clicked', 'api_download')
            OR request_path LIKE '/api/public/download%'
            OR request_path LIKE '/api/v1/download%'
        `
      ),
      pool.query(
        `
          SELECT COUNT(*)::int AS count
          FROM user_interactions
          WHERE interaction_date BETWEEN $1 AND $2
            AND interaction_type IN ('download_data', 'download_table_button_clicked')
        `,
        [startDate, endDate]
      ),
      pool.query(
        `
          SELECT COUNT(*)::int AS count
          FROM user_interactions
          WHERE interaction_date BETWEEN $1 AND $2
            AND (
              interaction_type = 'api_download'
              OR request_path LIKE '/api/public/download%'
              OR request_path LIKE '/api/v1/download%'
            )
        `,
        [startDate, endDate]
      ),
      pool.query(
        `
          SELECT COUNT(*)::int AS count
          FROM user_interactions
          WHERE interaction_date BETWEEN $1 AND $2
            AND (
              request_path LIKE '/api/public/%'
              OR request_path LIKE '/api/v1/%'
            )
        `,
        [startDate, endDate]
      ),
      pool.query(
        `
          SELECT COUNT(*)::int AS count
          FROM user_interactions
          WHERE request_path LIKE '/api/public/%'
             OR request_path LIKE '/api/v1/%'
        `
      ),
      pool.query(
        `
	          SELECT COUNT(DISTINCT TRIM(display_server_name))::int AS count
	          FROM summary_table
	          WHERE display_server_name IS NOT NULL
	            AND btrim(display_server_name) <> ''
	        `
      ),
      pool.query(
        `
          SELECT COUNT(*)::int AS count
          FROM (
	            SELECT DISTINCT TRIM(display_server_name), TRIM(display_table_name)
	            FROM summary_table
            WHERE display_server_name IS NOT NULL
              AND btrim(display_server_name) <> ''
              AND display_table_name IS NOT NULL
              AND btrim(display_table_name) <> ''
          ) datasets
        `
      ),
    ]);

    setNoStore(res);
    res.json({
      year: safeYear,
      startDate,
      endDate,
      generatedAt: new Date().toISOString(),
      totalInteractions: interactionsResult.rows[0]?.count || 0,
      allTimeInteractions: allInteractionsResult.rows[0]?.count || 0,
      downloads: downloadsResult.rows[0]?.count || 0,
      allTimeDownloads: allDownloadsResult.rows[0]?.count || 0,
      webDownloads: webDownloadsResult.rows[0]?.count || 0,
      apiDownloads: apiDownloadsResult.rows[0]?.count || 0,
      apiRequests: apiRequestsResult.rows[0]?.count || 0,
      allTimeApiRequests: allApiRequestsResult.rows[0]?.count || 0,
      activeSites: activeSitesResult.rows[0]?.count || 0,
      datasets: datasetsResult.rows[0]?.count || 0,
    });
  } catch (error) {
    console.error('Error fetching public analytics highlights:', error);
    res.status(500).json({ message: 'Failed to fetch public analytics highlights' });
  }
});

app.get('/api/public/monitoring/highlights', async (req, res) => {
  try {
    const [
      fieldValuesResult,
      lastSyncedResult,
      coverageResult,
      dateRangeResult,
      latestTablesResult,
    ] = await Promise.all([
      pool.query('SELECT total_field_values_count, summary_data_count FROM field_values_summary WHERE id = 1'),
      pool.query('SELECT sync_time, last_data_availability_sync_time FROM last_synced WHERE id = 1'),
	      pool.query(`
	        SELECT
	          COUNT(DISTINCT TRIM(display_server_name))::int AS active_sites,
	          COUNT(DISTINCT TRIM(display_server_name) || '|' || TRIM(display_table_name))::int AS public_datasets,
	          (COUNT(DISTINCT TRIM(display_server_name) || '|' || TRIM(display_table_name) || '|' || TRIM(display_field_name)) FILTER (
	            WHERE display_field_name IS NOT NULL AND btrim(display_field_name) <> ''
	          ))::int AS public_variables
	        FROM summary_table
	        WHERE display_server_name IS NOT NULL
	          AND btrim(display_server_name) <> ''
	          AND display_table_name IS NOT NULL
	          AND btrim(display_table_name) <> ''
	      `),
	      pool.query(`
	        SELECT
	          MIN(start_date)::date AS archive_start,
	          MAX(end_date)::date AS archive_end,
	          SUM(COALESCE(total_count, 0))::bigint AS public_table_rows
	        FROM summary_data_date_ranges
	      `),
      pool.query(`
        SELECT
          server_name,
          table_name,
          end_date::date AS latest_date,
          total_count
        FROM summary_data_date_ranges
        WHERE end_date IS NOT NULL
        ORDER BY end_date DESC, total_count DESC NULLS LAST
        LIMIT 4
      `),
    ]);

    const fieldValues = fieldValuesResult.rows[0] || {};
    const sync = lastSyncedResult.rows[0] || {};
    const coverage = coverageResult.rows[0] || {};
    const dateRange = dateRangeResult.rows[0] || {};

    setPublicCache(res, 300);
    res.json({
      totalDataValues: Number(fieldValues.total_field_values_count) || 0,
      totalRawValues: Number(fieldValues.summary_data_count) || 0,
      lastSynced: sync.sync_time || null,
      lastDataAvailabilitySyncTime: sync.last_data_availability_sync_time || null,
      activeSites: Number(coverage.active_sites) || 0,
      publicDatasets: Number(coverage.public_datasets) || 0,
      publicVariables: Number(coverage.public_variables) || 0,
      archiveStart: dateRange.archive_start || null,
      archiveEnd: dateRange.archive_end || null,
      publicTableRows: Number(dateRange.public_table_rows) || 0,
      recentlyUpdated: latestTablesResult.rows.map((row) => ({
        site: row.server_name,
        table: row.table_name,
        latestDate: row.latest_date,
        totalCount: Number(row.total_count) || 0,
      })),
    });
  } catch (error) {
    console.error('Error fetching public monitoring highlights:', error);
    res.status(500).json({ message: 'Failed to fetch public monitoring highlights' });
  }
});

app.get('/api/analytics/overview', async (req, res) => {
  const { range = 'monthly' } = req.query;
  const todaySast = getSastDateParts();
  const safeYear = /^\d{4}$/.test(String(req.query.year || '')) ? String(req.query.year) : todaySast.year;
  const safeMonth = /^(0?[1-9]|1[0-2])$/.test(String(req.query.month || ''))
    ? String(req.query.month).padStart(2, '0')
    : todaySast.month;
  const normalizedRange = range === 'yearly' ? 'yearly' : 'monthly';
  const startDate = normalizedRange === 'yearly' ? `${safeYear}-01-01` : `${safeYear}-${safeMonth}-01`;
  const endDate = normalizedRange === 'yearly'
    ? `${safeYear}-12-31`
    : `${safeYear}-${safeMonth}-${new Date(Number(safeYear), Number(safeMonth), 0).getDate()}`;

  try {
    // Total Visits
    const totalVisitsQuery = `
      SELECT COUNT(*) AS total_visits
      FROM user_interactions
      WHERE interaction_date BETWEEN $1 AND $2
    `;
    const totalVisitsResult = await pool.query(totalVisitsQuery, [startDate, endDate]);
    const totalVisits = parseInt(totalVisitsResult.rows[0].total_visits, 10);

    // New Users (Logged-in)
    const newUsersQuery = `
      SELECT COUNT(DISTINCT user_id) AS new_users
      FROM user_interactions
      WHERE interaction_date BETWEEN $1 AND $2
      AND user_id IS NOT NULL;
    `;
    const newUsersResult = await pool.query(newUsersQuery, [startDate, endDate]);
    const newUsers = parseInt(newUsersResult.rows[0].new_users, 10);

    // Anonymous Users
    const anonymousUsersQuery = `
      SELECT COUNT(DISTINCT session_id) AS anonymous_users
      FROM user_interactions
      WHERE interaction_date BETWEEN $1 AND $2
      AND user_id IS NULL;
    `;
    const anonymousUsersResult = await pool.query(anonymousUsersQuery, [startDate, endDate]);
    const anonymousUsers = parseInt(anonymousUsersResult.rows[0].anonymous_users, 10);

    // Visits by Location
//  const locationsQuery = `
//    SELECT
//      location->>'lat' AS lat,
//      location->>'lon' AS lon,
//      location->>'city' AS city,
//      location->>'country' AS country,
//      COUNT(*) AS visits
//    FROM user_interactions
//    WHERE
//      interaction_date BETWEEN $1 AND $2
//      AND location->>'lat' IS NOT NULL
//      AND location->>'lon' IS NOT NULL
//      AND location->>'lat' <> ''
//      AND location->>'lon' <> ''
//    GROUP BY lat, lon, city, country
//    ORDER BY visits DESC;
//  `;
    const locationsQuery = `
  SELECT
    COALESCE(location->>'lat', location->>'latitude') AS lat,
    COALESCE(location->>'lon', location->>'longitude') AS lon,
    location->>'city' AS city,
    location->>'country' AS country,
    COUNT(DISTINCT session_id || interaction_hour) AS visits -- Count distinct sessions per hour
  FROM user_interactions
  WHERE
    interaction_date BETWEEN $1 AND $2
    AND (location->>'lat' IS NOT NULL OR location->>'latitude' IS NOT NULL)
    AND (location->>'lon' IS NOT NULL OR location->>'longitude' IS NOT NULL)
    AND COALESCE(location->>'lat', location->>'latitude') <> ''
    AND COALESCE(location->>'lon', location->>'longitude') <> ''
  GROUP BY lat, lon, city, country
  ORDER BY visits DESC;
`;

    const locationsResult = await pool.query(locationsQuery, [startDate, endDate]);
    const locations = locationsResult.rows
    .filter(row => row.lat && row.lon)
    .map(row => ({
      lat: parseFloat(row.lat),
      lon: parseFloat(row.lon),
      city: row.city || 'Unknown',
      country: row.country || 'Unknown',
      visits: parseInt(row.visits, 10),
    }));

    // Location-based analytics (per day)
    const locationsQueryPerDay = `
      SELECT
        COALESCE(location->>'lat', location->>'latitude') AS lat,
        COALESCE(location->>'lon', location->>'longitude') AS lon,
        location->>'city' AS city,
        location->>'country' AS country,
        COUNT(DISTINCT session_id || interaction_date) AS visits -- Count distinct sessions per day
      FROM user_interactions
      WHERE
        interaction_date BETWEEN $1 AND $2
        AND (location->>'lat' IS NOT NULL OR location->>'latitude' IS NOT NULL)
        AND (location->>'lon' IS NOT NULL OR location->>'longitude' IS NOT NULL)
        AND COALESCE(location->>'lat', location->>'latitude') <> ''
        AND COALESCE(location->>'lon', location->>'longitude') <> ''
      GROUP BY lat, lon, city, country
      ORDER BY visits DESC;
    `;

    const locationsResultPerDay = await pool.query(locationsQueryPerDay, [startDate, endDate]);
    const locationsPerDay = locationsResultPerDay.rows
    .filter(row => row.lat && row.lon)
    .map(row => ({
      lat: parseFloat(row.lat),
      lon: parseFloat(row.lon),
      city: row.city || 'Unknown',
      country: row.country || 'Unknown',
      visits: parseInt(row.visits, 10),
    }));


    // Top Pages by Interaction
    const topPagesQuery = `
      SELECT request_path, COUNT(*) AS interactions
      FROM user_interactions
      WHERE interaction_date BETWEEN $1 AND $2
      GROUP BY request_path
      ORDER BY interactions DESC
    `;
    const topPagesResult = await pool.query(topPagesQuery, [startDate, endDate]);
    const topPages = topPagesResult.rows.map(row => ({
      path: row.request_path,
      interactions: parseInt(row.interactions, 10),
    }));

    // Top Interaction Types
    const topInteractionTypesQuery = `
      SELECT interaction_type, COUNT(*) AS count
      FROM user_interactions
      WHERE interaction_date BETWEEN $1 AND $2
      GROUP BY interaction_type
      ORDER BY count DESC
    `;
    const topInteractionTypesResult = await pool.query(topInteractionTypesQuery, [startDate, endDate]);
    const topInteractionTypes = topInteractionTypesResult.rows.map(row => ({
      type: row.interaction_type,
      count: parseInt(row.count, 10),
    }));

    // User Activity Heatmap
    const userActivityHeatmapQuery = `
      SELECT
        EXTRACT(DOW FROM interaction_hour) AS day_of_week,
        EXTRACT(HOUR FROM interaction_hour) AS hour_of_day,
        COUNT(*) AS interactions
      FROM user_interactions
      WHERE interaction_date BETWEEN $1 AND $2
      GROUP BY day_of_week, hour_of_day
      ORDER BY day_of_week, hour_of_day;
    `;
    const userActivityHeatmapResult = await pool.query(userActivityHeatmapQuery, [startDate, endDate]);
    const userActivityHeatmap = userActivityHeatmapResult.rows.map(row => ({
      dayOfWeek: parseInt(row.day_of_week, 10),
      hourOfDay: parseInt(row.hour_of_day, 10),
      interactions: parseInt(row.interactions, 10),
    }));

    // Detailed Interactions with User Information
    const detailedInteractionsQuery = `
      SELECT
        ui.user_id,
        COALESCE(u.first_name, 'Anonymous') AS first_name,
        COALESCE(u.last_name, '') AS last_name,
        COALESCE(u.sector, '') AS sector,
        COALESCE(u.discipline, '') AS discipline,
        COALESCE(u.country, '') AS user_country,
        ui.interaction_type,
        ui.request_path,
        ui.referrer,
        ui.user_agent,
        ui.additional_data,
        ui.interaction_hour,
        ui.interaction_date,
        ui.location
      FROM user_interactions ui
      LEFT JOIN users u ON ui.user_id = u.id
      WHERE ui.interaction_date BETWEEN $1 AND $2
      ORDER BY ui.interaction_date DESC, ui.interaction_hour DESC;
    `;
    const detailedInteractionsResult = await pool.query(detailedInteractionsQuery, [startDate, endDate]);
    const detailedInteractions = detailedInteractionsResult.rows.map(row => ({
      userId: row.user_id,
      firstName: row.first_name,
      lastName: row.last_name,
      sector: row.sector,
      discipline: row.discipline,
      userCountry: row.user_country,
      interactionType: row.interaction_type,
      requestPath: row.request_path,
      referrer: row.referrer,
      userAgent: row.user_agent,
      additionalData: row.additional_data,
      interactionHour: row.interaction_hour,
      interactionDate: row.interaction_date,
      location: row.location
    }));

    // Count of API Requests
    const apiRequestsQuery = `
  SELECT COUNT(*) AS api_requests
  FROM user_interactions
  WHERE request_path LIKE '/api/public/%'
  AND interaction_date BETWEEN $1 AND $2;
`;

    const apiRequestsResult = await pool.query(apiRequestsQuery, [startDate, endDate]);
    const apiRequests = parseInt(apiRequestsResult.rows[0].api_requests, 10);

    // Count of API Downloads
    const apiDownloadsQuery = `
      SELECT COUNT(*) AS api_downloads
      FROM user_interactions
	      WHERE (
	        interaction_type = 'api_download'
	        OR request_path LIKE '/api/public/download%'
	      )
	      AND interaction_date BETWEEN $1 AND $2;
    `;
    const apiDownloadsResult = await pool.query(apiDownloadsQuery, [startDate, endDate]);
    const apiDownloads = parseInt(apiDownloadsResult.rows[0].api_downloads, 10);

    // Count of Web Downloads
    // Count of Web Downloads (excluding API requests with path like '/api/public/%')
    const webDownloadsQuery = `
  SELECT COUNT(*) AS web_downloads
  FROM user_interactions
  WHERE interaction_type IN ('download_data', 'download_table_button_clicked')
  AND request_path NOT LIKE '/api/public/%'
  AND interaction_date BETWEEN $1 AND $2;
`;
    const webDownloadsResult = await pool.query(webDownloadsQuery, [startDate, endDate]);
    const webDownloads = parseInt(webDownloadsResult.rows[0].web_downloads, 10);

    // Sending the response
    await await res.json({
      overview: {
        totalVisits,
        newUsers,
        anonymousUsers,
        locations,
        locationsPerDay,
        topPages,
        topInteractionTypes,
        userActivityHeatmap,
        detailedInteractions,
        apiRequests,
        apiDownloads,
        webDownloads
      },
    });
  } catch (error) {
    console.error('Error fetching analytics overview:', error);
    res.status(500).json({ message: 'Failed to fetch analytics overview' });
  }
});

app.get('/api/analytics', async (req, res) => {
    try {
        const {range = 'daily', year = new Date().getFullYear(), month = null} = req.query;

        let dateTrunc = 'day';
        let queryParams = [year];
        let dateFilter = `EXTRACT(YEAR FROM timestamp) = $1`;

        if (month) {
            queryParams.push(month);
            dateFilter += ` AND EXTRACT(MONTH FROM timestamp) = $2`;
        }

        if (range === 'monthly') {
            dateTrunc = 'day'; // Group by day for monthly view
        } else if (range === 'yearly') {
            dateTrunc = 'month'; // Group by month for yearly view
        }

        // Total interactions query
        const totalInteractionsResult = await pool.query('SELECT COUNT(*) FROM user_interactions');

        // Unique visitors query
        const uniqueVisitorsResult = await pool.query('SELECT COUNT(DISTINCT ip) FROM user_interactions');

        // Location data for the map
        const locationsResult = await pool.query(`
      SELECT
        location->>'lat' AS lat,
        location->>'lon' AS lon,
        location->>'city' AS city,
        location->>'country' AS country,
        COUNT(*) AS visits
      FROM user_interactions
      WHERE location IS NOT NULL
      GROUP BY lat, lon, city, country
      ORDER BY visits DESC
    `);

        // Most visited sites query
        const mostVisitedSitesResult = await pool.query(`
      SELECT request_path, COUNT(*) AS visits
      FROM user_interactions
      WHERE ${dateFilter}
      GROUP BY request_path
      ORDER BY visits DESC
      LIMIT 10
    `, queryParams);

        // Visits from locations over time query
        const visitsFromLocationsOverTimeResult = await pool.query(`
      SELECT
        date_trunc('${dateTrunc}', timestamp) AS period,
        location->>'country' AS country,
        COUNT(*) AS visits
      FROM user_interactions
      WHERE location IS NOT NULL
        AND ${dateFilter}
      GROUP BY period, country
      ORDER BY period ASC
    `, queryParams);

        // Site visits over time query
        const siteVisitsOverTimeResult = await pool.query(`
      SELECT
        date_trunc('${dateTrunc}', timestamp) AS period,
        request_path,
        COUNT(*) AS visits
      FROM user_interactions
      WHERE ${dateFilter}
      GROUP BY period, request_path
      ORDER BY period ASC
    `, queryParams);

        // Toggle server interactions query
        const toggleServerResult = await pool.query(`
      SELECT
        ui.timestamp,
        ui.request_path,
        COALESCE(ui.additional_data->>'serverName', st.name) AS server_name
      FROM user_interactions ui
      LEFT JOIN servers st ON st.server_id = (ui.additional_data->>'serverId')::uuid
      WHERE ui.interaction_type = 'toggle_server'
        AND ${dateFilter}
    `, queryParams);

        // Downloads by table query
        const downloadDataResult = await pool.query(`
  SELECT
    CONCAT(additional_data->>'serverName', ' - ', additional_data->>'tableName') AS table_label,
    COUNT(*) AS downloads
  FROM user_interactions
  WHERE interaction_type = 'download_data'
    AND ${dateFilter}
  GROUP BY table_label
  ORDER BY downloads DESC
`, queryParams);

        // Data availability by server query remains the same
        const availabilityDataResult = await pool.query(`
  SELECT
    additional_data->>'serverName' AS server_name,
    COUNT(*) AS checks
  FROM user_interactions
  WHERE interaction_type = 'view_data_availability'
    AND ${dateFilter}
  GROUP BY server_name
  ORDER BY checks DESC
`, queryParams);

        // Structure the response data
        const analyticsData = {
            totalInteractions: parseInt(totalInteractionsResult.rows[0].count, 10),
            uniqueVisitors: parseInt(uniqueVisitorsResult.rows[0].count, 10),
            overview: {
                locations: locationsResult.rows,
                mostVisitedSites: {
                    labels: mostVisitedSitesResult.rows.map(row => row.request_path),
                    data: mostVisitedSitesResult.rows.map(row => parseInt(row.visits, 10)),
                },
                visitsFromLocationsOverTime: visitsFromLocationsOverTimeResult.rows.map(row => ({
                    ...row,
                    visits: parseInt(row.visits, 10),
                })),
                siteVisitsOverTime: siteVisitsOverTimeResult.rows.map(row => ({
                    ...row,
                    visits: parseInt(row.visits, 10),
                })),
            },
            toggleServer: toggleServerResult.rows.map(row => ({
                timestamp: row.timestamp,
                request_path: row.request_path,
                server_name: row.server_name,
            })),
            downloadData: downloadDataResult.rows.map(row => ({
                table_label: row.table_label,
                downloads: parseInt(row.downloads, 10),
            })),
            availabilityData: availabilityDataResult.rows.map(row => ({
                server_name: row.server_name,
                checks: parseInt(row.checks, 10),
            })),
        };

        // Send the structured data as a JSON response
        await await res.json(analyticsData);
    } catch (error) {
        console.error('Error fetching analytics data:', error);
        res.status(500).json({error: 'Failed to fetch analytics data'});
    }
});

app.get('/api/server-name', async (req, res) => {
    try {
        const {serverId} = req.query;
        if (!serverId) {
            return res.status(400).json({error: 'Missing serverId'});
        }

        const serverResult = await pool.query(
            'SELECT table_name AS name FROM server_tables WHERE server_id = $1',
            [serverId]
        );

        if (serverResult.rows.length === 0) {
            return res.status(404).json({error: 'Server not found'});
        }

        await await res.json({serverName: serverResult.rows[0].name});
    } catch (error) {
        console.error('Error fetching server name:', error);
        res.status(500).json({error: 'Failed to fetch server name'});
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    const {username, password} = req.body;

    try {
        const userResult = await pool.query(
            'SELECT u.*, ur.role_id, r.name as role_name FROM users u JOIN user_roles ur ON u.id = ur.user_id JOIN roles r ON ur.role_id = r.id WHERE u.username = $1',
            [username]
        );

        if (userResult.rows.length === 0) {
            return res.status(400).json({error: 'Invalid username or password'});
        }

        const user = userResult.rows[0];
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(400).json({error: 'Invalid username or password'});
        }

        req.session.user = {id: user.id, username: user.username, role: user.role_name};

        res.status(200).json({
            message: 'Login successful',
            userId: user.id,
            username: user.username,
            role: user.role_name
        });
    } catch (error) {
        console.error('Error logging in user:', error);
        res.status(500).json({error: 'Internal server error'});
    }
});

// Current user endpoint
app.get('/api/current_user', (req, res) => {
    if (req.session && req.session.user) {
        res.json(req.session.user);
    } else {
        res.status(401).json({message: 'Not logged in'});
    }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({message: 'Failed to log out'});
        }
        res.status(200).json({message: 'Logged out successfully'});
    });
});

// Register endpoint
app.post('/api/register', async (req, res) => {
    const {firstName, lastName, email, username, password, sector, discipline, country} = req.body;
    const defaultRole = 'User';

    try {
        // Check if email or username already exists
        const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (emailCheck.rows.length > 0) {
            return res.status(400).json({message: 'Email already exists'});
        }

        const usernameCheck = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
        if (usernameCheck.rows.length > 0) {
            return res.status(400).json({message: 'Username already exists'});
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await pool.query('BEGIN');

        const result = await pool.query(
            'INSERT INTO users (first_name, last_name, email, username, password, sector, discipline, country) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
            [firstName, lastName, email, username, hashedPassword, sector, discipline, country]
        );
        const userId = result.rows[0].id;

        // Check if the default role exists, if not, create it
        let roleResult = await pool.query('SELECT id FROM roles WHERE name = $1', [defaultRole]);
        if (roleResult.rows.length === 0) {
            await pool.query('INSERT INTO roles (name) VALUES ($1)', [defaultRole]);
            roleResult = await pool.query('SELECT id FROM roles WHERE name = $1', [defaultRole]);
        }

        const roleId = roleResult.rows[0].id;

        await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [userId, roleId]);

        await pool.query('COMMIT');

        req.session.user = {id: userId, username, role: defaultRole};

        res.status(201).json({message: 'User registered successfully', userId, username, role: defaultRole});
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error registering user:', error);
        res.status(500).json({message: 'Error registering user'});
    }
});

// Get all roles
app.get('/api/roles', async (req, res) => {
    try {
        await ensureApiRoles();
        const result = await pool.query('SELECT id, name FROM roles');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching roles:', error);
        res.status(500).json({error: 'Internal server error'});
    }
});

// Update user role
app.post('/api/user_roles', async (req, res) => {
    if (!requireSuperUser(req, res)) return;

    const {userId, roleId} = req.body;

    try {
        await pool.query('BEGIN');
        await pool.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
        await pool.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [userId, roleId]);
        await pool.query('COMMIT');
        res.status(200).json({message: 'User role updated successfully'});
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error updating user role:', error);
        res.status(500).json({error: 'Internal server error'});
    }
});

// Fetch all users
//app.get('/api/users', async (req, res) => {
//  try {
//      const result = await pool.query(
//          `SELECT u.id, u.first_name, u.last_name, u.email, u.username, u.sector, u.discipline, u.country, ur.role_id, r.name as role_name
//    FROM users u
//    JOIN user_roles ur ON u.id = ur.user_id
//    JOIN roles r ON ur.role_id = r.id`
//      );
//      await await res.json(result.rows);
//  } catch (error) {
//      console.error('Error fetching users:', error);
//      res.status(500).json({error: 'Internal server error'});
//  }
//});

app.get('/api/users', async (req, res) => {
  if (!requireSuperUser(req, res)) return;

  try {
    const result = await pool.query(
      `SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.username,
        u.sector,
        u.discipline,
        u.country,
        u.created_at,
        ur.role_id,
        r.name AS role_name
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      ORDER BY u.created_at ASC`
    );
    res.json(result.rows); // removed extra "await"
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a user
app.delete('/api/users/:id', async (req, res) => {
    if (!requireSuperUser(req, res)) return;

    const userId = parseInt(req.params.id);
    if (req.session.user && req.session.user.id === userId) {
        return res.status(400).json({message: 'You cannot delete the current logged-in user'});
    }

    try {
        await pool.query('BEGIN');
        await pool.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
        await pool.query('COMMIT');
        res.status(200).json({message: 'User deleted successfully'});
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Error deleting user:', error);
        res.status(500).json({error: 'Internal server error'});
    }
});

app.get("/api", (req, res) => {
    res.json({message: "Welcome to the API!"});
});


// Reuse your global agent. Define once if you don't already have this:
var REQUEST_TIMEOUT_MS = 120000; // 120s

function isStatisticsUri(u) {
  return typeof u === 'string' && /:__Statistics__$/i.test(u);
}


// Define the update function
async function updateFieldValuesSummary() {
    try {
        const query = `
      WITH partition_estimates AS (
        SELECT GREATEST(c.reltuples, 0)::bigint AS estimated_rows
        FROM pg_inherits i
        JOIN pg_class c ON c.oid = i.inhrelid
        WHERE i.inhparent = 'public.field_values'::regclass
      ),
      totals AS (
        SELECT
          COALESCE((SELECT SUM(estimated_rows) FROM partition_estimates), 0)::bigint AS total_field_values_count,
          COALESCE((SELECT SUM(total_count)::bigint FROM summary_data_date_ranges), 0)::bigint AS summary_data_count
      )
      UPDATE field_values_summary fvs
      SET
        total_field_values_count = totals.total_field_values_count,
        summary_data_count = totals.summary_data_count
      FROM totals
      WHERE fvs.id = 1;
    `;

        // Run the query
        await pool.query(query);
        console.log('Field values summary updated successfully using fast estimates.');
    } catch (error) {
        console.error('Error updating field values summary:', error);
    }
}



const validateUUID = (uuid) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid);

// Endpoint to retrieve all servers regardless of status
app.get('/api/servers', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM servers ORDER BY name;');
        await await res.json(result.rows);
    } catch (error) {
        console.error('Failed to retrieve servers:', error);
        res.status(500).json({message: 'Failed to retrieve servers'});
    }
});

app.get('/api/servers/:serverId/tables', async (req, res) => {
    try {
        const {serverId} = req.params;

        if (!validateUUID(serverId)) {
            return res.status(400).json({error: 'Invalid server ID'});
        }

        // Fetch only necessary columns
        const query = `
      SELECT table_id, table_name, status
      FROM server_tables
      WHERE server_id = $1;
    `;
        const result = await pool.query(query, [serverId]);

        if (result.rowCount > 0) {
            await await res.json(result.rows);
        } else {
            res.status(404).json({message: 'No tables found for this server'});
        }
    } catch (error) {
        console.error('Failed to retrieve tables for server:', error);
        res.status(500).json({message: 'Failed to retrieve tables for server'});
    }
});

app.get('/api/tables/:tableId/info', async (req, res) => {
    const {tableId} = req.params;

    if (!validateUUID(tableId)) {
        return res.status(400).json({error: 'Invalid table ID'});
    }

    try {
        const query = `
      SELECT st.table_name AS tableName, s.name AS serverName
      FROM server_tables st
      JOIN servers s ON st.server_id = s.server_id
      WHERE st.table_id = $1
      LIMIT 1;
    `;

        const result = await pool.query(query, [tableId]);

        if (result.rowCount > 0) {
            await await res.json(result.rows[0]);
        } else {
            res.status(404).json({message: 'Table info not found'});
        }
    } catch (error) {
        console.error('Error fetching server and table info:', error);
        res.status(500).json({message: 'Failed to fetch server and table info'});
    }
});

// Endpoint to retrieve all fields for a specific table
app.get('/api/tables/:tableId/fields', async (req, res) => {
    try {
        const {tableId} = req.params;
        if (!validateUUID(tableId)) {
            return res.status(400).json({error: 'Invalid table ID'});
        }
        const result = await pool.query('SELECT field_id, field_name, units, status FROM server_table_fields WHERE table_id = $1', [tableId]);
        await await res.json(result.rows);
    } catch (error) {
        console.error('Failed to retrieve fields for table:', error);
        res.status(500).json({message: 'Failed to retrieve fields for table'});
    }
});



app.get('/api/tables/:tableId/values', async (req, res) => {
  const { tableId } = req.params;
  if (!validateUUID(tableId)) {
    return res.status(400).json({ error: 'Invalid table ID' });
  }

  const { startDate, endDate, page, pageSize } = req.query;

  const limit = parseInt(pageSize, 10) || 10; // Default page size to 10
  const offset = ((parseInt(page, 10) || 1) - 1) * limit; // Default page to 1

  // Convert and validate dates
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({ error: 'Invalid date format' });
  }

  const formattedStart = start.toISOString();
  const formattedEnd = end.toISOString();

  try {
    const valuesQuery = `
      SELECT
        timestamp,
        fields
      FROM pre_aggregated_table_values
      WHERE table_id = $1
        AND timestamp BETWEEN $2 AND $3
      ORDER BY timestamp DESC
      LIMIT $4 OFFSET $5;
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT timestamp) AS total_count
      FROM pre_aggregated_table_values
      WHERE table_id = $1
        AND timestamp BETWEEN $2 AND $3;
    `;

    const [result, totalCountResult] = await Promise.all([
      pool.query(valuesQuery, [tableId, formattedStart, formattedEnd, limit, offset]),
      pool.query(countQuery, [tableId, formattedStart, formattedEnd])
    ]);

    const totalRecords = parseInt(totalCountResult.rows[0].total_count, 10);
    const totalPages = Math.ceil(totalRecords / limit);

    await res.json({
      data: result.rows,
      totalRecords,
      totalPages,
      currentPage: parseInt(page || 1, 10),
      pageSize: limit
    });
  } catch (error) {
    console.error('Failed to retrieve values from materialized view:', error);
    res.status(500).json({ message: 'Failed to retrieve values for table' });
  }
});


app.post('/api/tables/date-ranges', async (req, res) => {
  const {tableIds} = req.body;

  if (!Array.isArray(tableIds) || tableIds.some((id) => !validateUUID(id))) {
    return res.status(400).json({error: 'Invalid table IDs'});
  }

  try {
    const query = `
      SELECT table_id, start_date, end_date
      FROM raw_data_date_ranges
      WHERE table_id = ANY($1::uuid[])
      ORDER BY table_id;
    `;
    const result = await pool.query(query, [tableIds]);

    if (result.rowCount > 0) {
      await res.json(result.rows);
    } else {
      res.status(404).json({message: 'No dates found for the provided tables.'});
    }
  } catch (error) {
    console.error('Failed to retrieve date ranges:', error);
    res.status(500).json({message: 'Failed to retrieve date ranges'});
  }
});

app.get('/api/tables/:tableId/date-range', async (req, res) => {
  const {tableId} = req.params;

  if (!validateUUID(tableId)) {
    return res.status(400).json({error: 'Invalid table ID'});
  }

  try {
    // Fetch pre-stored date ranges from the new table
    const query = `
      SELECT start_date, end_date
      FROM raw_data_date_ranges
      WHERE table_id = $1;
    `;
    const result = await pool.query(query, [tableId]);

    if (result.rowCount > 0) {
      await res.json(result.rows[0]);
    } else {
      res.status(404).json({message: 'No date ranges found for table.'});
    }
  } catch (error) {
    console.error('Failed to retrieve pre-stored date range:', error);
    res.status(500).json({message: 'Failed to retrieve pre-stored date range'});
  }
});



app.get('/api/tables/:tableId/download', async (req, res) => {
  const { tableId } = req.params;
  if (!validateUUID(tableId)) {
    return res.status(400).json({ error: 'Invalid table ID' });
  }

  try {
    const client = await pool.connect();

    // Retrieve the table name and site name based on the tableId
    const tableNameResult = await client.query(`
      SELECT st.table_name, s.name AS server_name
      FROM server_tables st
      JOIN servers s ON st.server_id = s.server_id
      WHERE st.table_id = $1
      LIMIT 1
    `, [tableId]);

    const tableName = tableNameResult.rows.length > 0 ? tableNameResult.rows[0].table_name : 'Unknown Table';
    const siteName = tableNameResult.rows.length > 0 ? tableNameResult.rows[0].server_name : 'Unknown Site';

    // Path to the pre-generated CSV file
    const csvDir = path.join(__dirname, 'csv_table_exports');
    const csvFilePath = path.join(csvDir, `${tableName}_${siteName}.csv`);

    // Check if the pre-generated CSV file exists
    if (fs.existsSync(csvFilePath)) {
      console.log(`Serving pre-generated CSV: ${csvFilePath}`);

      // Set headers and serve the pre-generated CSV
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${tableName}_${siteName}_data.csv"`);

      // Stream the pre-generated file to the client
      const readStream = fs.createReadStream(csvFilePath);
      return readStream.pipe(res);
    } else {
      console.log(`Pre-generated CSV not found, generating dynamically for table: ${tableName}, site: ${siteName}`);

      // Fetch date range (earliest and latest timestamp) for dynamic generation
      const dateRangeResult = await client.query(`
        SELECT
          MIN(fv.timestamp) AS start_date,
          MAX(fv.timestamp) AS end_date
        FROM field_values fv
        JOIN server_table_fields sf ON fv.field_id = sf.field_id
        WHERE sf.table_id = $1
      `, [tableId]);

      const { start_date: startDate, end_date: endDate } = dateRangeResult.rows[0];

      if (!startDate || !endDate) {
        return res.status(404).json({ message: 'No data available for the specified table.' });
      }

      const valuesQuery = `
        SELECT
          fv.timestamp,
          JSON_AGG(JSON_BUILD_OBJECT(
            'field_name', sf.field_name,
            'value', fv.value,
            'status', sf.status,
            'units', sf.units
          )) AS fields
        FROM field_values fv
        JOIN server_table_fields sf ON fv.field_id = sf.field_id
        WHERE sf.table_id = $1
        AND fv.timestamp BETWEEN $2 AND $3
        GROUP BY fv.timestamp
        ORDER BY fv.timestamp ASC;
      `;

      const query = new QueryStream(valuesQuery, [tableId, startDate, endDate]);
      const stream = client.query(query);

      res.setHeader('Content-Disposition', `attachment; filename="${tableName}_${siteName}_data.csv"`);
      res.setHeader('Content-Type', 'text/csv');

      let headersSet = false;
      let allFieldNames = new Set();
      let allFieldUnits = {};

      const csvTransform = new Transform({
        objectMode: true,
        transform(row, encoding, callback) {
          row.fields.forEach(field => {
            allFieldNames.add(field.field_name);
            allFieldUnits[field.field_name] = field.units;
          });

          const data = row.fields.reduce((acc, field) => {
            acc[field.field_name] = field.value;
            return acc;
          }, {});

          if (!headersSet) {
            headersSet = true;
            const sortedFieldNames = Array.from(allFieldNames).sort();
            const headerRow = ['timestamp', ...sortedFieldNames].join(',');
            const unitRow = ['', ...sortedFieldNames.map(field => allFieldUnits[field] || '')].join(',');
            this.push(headerRow + '\n' + unitRow + '\n');
          }

          const readableTimestamp = new Date(row.timestamp).toLocaleDateString('en-GB') + ' ' + new Date(row.timestamp).toLocaleTimeString('en-GB', { hour12: false });

          const sortedFieldNames = Array.from(allFieldNames).sort();
          const csvRow = [readableTimestamp, ...sortedFieldNames.map(field => data[field] || '')].join(',');
          callback(null, csvRow + '\n');
        }
      });

      stream.pipe(csvTransform).pipe(res);
      stream.on('end', () => client.release());
      stream.on('error', (error) => {
        console.error('Failed to stream data:', error);
        res.status(500).json({ message: 'Failed to download data' });
        client.release(); // Release the client in case of error
      });
    }

  } catch (error) {
    console.error('Failed to retrieve values for table:', error);
    res.status(500).json({ message: 'Failed to retrieve values for table' });
  }
});
// Endpoint to retrieve all values for a specific field
app.get('/api/fields/:fieldId/values', async (req, res) => {
    const {fieldId} = req.params;
    if (!validateUUID(fieldId)) {
        return res.status(400).json({error: 'Invalid field ID'});
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
    const before = req.query.before ? new Date(req.query.before) : null;
    const offset = parseInt(req.query.offset, 10) || 0;

    try {
        if (before && isNaN(before.getTime())) {
            return res.status(400).json({error: 'Invalid before cursor'});
        }

        const params = before
            ? [fieldId, before.toISOString(), limit]
            : [fieldId, limit, offset];
        const sql = before
            ? `SELECT id, field_id, "timestamp", value, status
               FROM field_values
               WHERE field_id = $1
                 AND "timestamp" < $2
               ORDER BY "timestamp" DESC
               LIMIT $3`
            : `SELECT id, field_id, "timestamp", value, status
               FROM field_values
               WHERE field_id = $1
               ORDER BY "timestamp" DESC
               LIMIT $2 OFFSET $3`;
        const result = await pool.query(sql, params);
        await res.json(result.rows);
    } catch (error) {
        console.error('Failed to retrieve values for field:', error);
        res.status(500).json({message: 'Failed to retrieve values for field'});
    }
});





const populateUnifiedMappingTable = async () => {
    const query = `
    INSERT INTO unified_mapping_table (
        server_id,
        current_server_name,
        display_server_name,
        table_id,
        current_table_name,
        display_table_name,
        field_id,
        current_field_name,
        display_field_name,
        current_units,
        display_units
    )
    SELECT
        s.server_id,
        s.name AS current_server_name,
        COALESCE(umt.display_server_name, s.name) AS display_server_name,
        st.table_id,
        st.table_name AS current_table_name,
        COALESCE(umt.display_table_name, st.table_name) AS display_table_name,
        stf.field_id,
        stf.field_name AS current_field_name,
        COALESCE(umt.display_field_name, stf.field_name) AS display_field_name,
        stf.units AS current_units,
        COALESCE(umt.display_units, stf.units) AS display_units
    FROM
        servers s
    JOIN
        server_tables st ON s.server_id = st.server_id
    JOIN
        server_table_fields stf ON st.table_id = stf.table_id
    LEFT JOIN
        unified_mapping_table umt ON s.server_id = umt.server_id AND st.table_id = umt.table_id AND stf.field_id = umt.field_id
    ON CONFLICT (server_id, table_id, field_id) DO UPDATE SET
        current_server_name = EXCLUDED.current_server_name,
        current_table_name = EXCLUDED.current_table_name,
        current_field_name = EXCLUDED.current_field_name,
        current_units = EXCLUDED.current_units;
  `;

    try {
        await pool.query('BEGIN');
        await pool.query(query);
        await pool.query('COMMIT');
        console.log('Unified mapping table populated successfully.');
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Failed to populate unified mapping table:', error);
    }
};

const insertIntoSummaryTable = async () => {
  const insertQuery = `
    WITH src AS (
      SELECT
        umt.field_id,
        umt.display_server_name,
        umt.display_table_name,
        umt.display_field_name,
        umt.display_units AS units,
        umt.latitude,
        umt.longitude,
        umt.aggregation_type,
        umt.multiplier
        -- If you have updated_at, include it here to prefer newest rows
        -- , umt.updated_at
      FROM unified_mapping_table umt
      WHERE umt.include_in_summary = TRUE
    ),
    deduped AS (
      SELECT DISTINCT ON (
        display_server_name, display_table_name, display_field_name, aggregation_type
      )
        field_id,
        display_server_name,
        display_table_name,
        display_field_name,
        units,
        latitude,
        longitude,
        aggregation_type,
        multiplier
      FROM src
      -- If you have updated_at, use: ORDER BY key..., updated_at DESC
      ORDER BY
        display_server_name, display_table_name, display_field_name, aggregation_type
    )
    INSERT INTO summary_table (
      id,
      field_id,
      display_server_name,
      display_table_name,
      display_field_name,
      units,
      latitude,
      longitude,
      aggregation_type,
      multiplier
    )
    SELECT
      uuid_generate_v4(),
      field_id,
      display_server_name,
      display_table_name,
      display_field_name,
      units,
      latitude,
      longitude,
      aggregation_type,
      multiplier
    FROM deduped;
  `;

  try {
    const result = await pool.query(insertQuery);
    console.log('Insert into summary_table successful.');
    console.log(`Inserted rows: ${result.rowCount}`);
    return result;
  } catch (error) {
    console.error('Failed to insert into summary_table:', error);
    throw error;
  }
};

const deleteFromSummaryTable = async () => {
    const deleteQuery = `
    DELETE FROM summary_table
    WHERE (display_server_name, display_table_name, display_field_name, aggregation_type, multiplier) IN (
      SELECT
        umt.display_server_name,
        umt.display_table_name,
        umt.display_field_name,
        umt.aggregation_type,
        umt.multiplier  -- Include multiplier in the subquery
      FROM unified_mapping_table umt
      WHERE umt.include_in_summary = false
    );
  `;

    try {
        const result = await pool.query(deleteQuery);
        console.log('Delete from summary table successful.');
        return result; // Return the result for logging
    } catch (error) {
        console.error('Failed to delete from summary table:', error);
        throw error;
    }
};

const populateSummaryTable = async () => {
    console.log('Starting to populate summary table...');

    try {
        await pool.query('BEGIN');
        console.log('Transaction begun.');

        console.log('Clearing summary table...');
        await clearSummaryTable();
        console.log('Summary table cleared successfully.');

        console.log('Inserting or updating data in summary table...');
        const insertResult = await insertIntoSummaryTable();
        console.log(`Inserted/Updated rows: ${insertResult.rowCount}`);

        await pool.query('COMMIT');
        console.log('Summary table population complete!');
        return {success: true};
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Failed to populate summary table:', error);
        return {success: false, error: error.message};
    }
};

const clearSummaryTable = async () => {
  try {
    const sql = `TRUNCATE TABLE summary_table RESTART IDENTITY`;
    const result = await pool.query(sql);
    console.log('Summary table truncated successfully.');
    return result;
  } catch (error) {
    console.error('Failed to truncate summary table:', error);
    throw error;
  }
};
// Function to format timestamps to SAST in ISO 8601 format
const formatToSAST = (timestamp) => {
    const date = new Date(timestamp); // Convert to Date object
    // Adjust for the SAST timezone using Intl.DateTimeFormat
    const formatter = new Intl.DateTimeFormat('en-ZA', {
        timeZone: 'Africa/Johannesburg', // SAST timezone
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
        hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    const hour = parts.find(p => p.type === 'hour').value;
    const minute = parts.find(p => p.type === 'minute').value;
    const second = parts.find(p => p.type === 'second').value;
    const milliseconds = parts.find(p => p.type === 'fractionalSecond').value;

    // Construct ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sss+02:00
    return `${year}-${month}-${day}T${hour}:${minute}:${second}.${milliseconds}+02:00`;
};

const calculateDataAvailability22 = async (startDate, endDate, serverName, tableName) => {
    const query = `
  WITH date_series AS (
    SELECT generate_series(
      date_trunc('day', $1::timestamptz AT TIME ZONE 'Africa/Johannesburg'),
      date_trunc('day', $2::timestamptz AT TIME ZONE 'Africa/Johannesburg'),
      interval '1 day'
    ) AS day
  ),
  relevant_fields AS (
    SELECT field_id, display_server_name, display_table_name, display_field_name, aggregation_type::integer
    FROM summary_table
    WHERE display_server_name = $3
      AND display_table_name = $4
  ),
  filtered_field_values AS (
    SELECT
      fv.field_id,
      fv.value,
      fv.timestamp AT TIME ZONE 'Africa/Johannesburg' AS timestamp_sast
    FROM field_values fv
    JOIN relevant_fields rf ON fv.field_id = rf.field_id
    WHERE fv.timestamp >= $1
      AND fv.timestamp < $2 + interval '1 day'
      AND (
        fv.value IS NULL
        OR (
          btrim(fv.value) <> ''
          AND upper(btrim(fv.value)) NOT IN ('NAN', 'NA', 'NULL', 'INF', 'INFINITY', '-INF', '-INFINITY')
        )
      )
  ),
  field_data AS (
    SELECT
      ds.day,
      rf.display_server_name,
      rf.display_table_name,
      rf.display_field_name,
      rf.aggregation_type,
      COALESCE(SUM(CASE
          WHEN ffv.value IS NOT NULL THEN 1 ELSE 0 END), 0) AS available_records,
      COUNT(ffv.timestamp_sast) AS total_records,
      (1440 / rf.aggregation_type) AS expected_records_per_day
    FROM
      date_series ds
    CROSS JOIN relevant_fields rf
    LEFT JOIN filtered_field_values ffv
      ON rf.field_id = ffv.field_id
      AND ffv.timestamp_sast >= ds.day
      AND ffv.timestamp_sast < ds.day + interval '1 day'
    GROUP BY
      ds.day, rf.display_server_name, rf.display_table_name, rf.display_field_name, rf.aggregation_type
  )
  SELECT
    display_server_name,
    display_table_name,
    display_field_name,
    day AS aggregated_timestamp,
    total_records,
    available_records,
    COALESCE((available_records::float / expected_records_per_day) * 100, 0) AS availability_percentage
  FROM
    field_data
  WHERE
    day >= date_trunc('day', $1::timestamptz AT TIME ZONE 'SAST')
    AND day <= date_trunc('day', $2::timestamptz AT TIME ZONE 'SAST')
  ORDER BY
    display_server_name,
    display_table_name,
    display_field_name,
    aggregated_timestamp;
`;

    try {
        const result = await pool.query(query, [startDate, endDate, serverName, tableName]);
        return result.rows;
    } catch (error) {
        console.error('Error calculating data availability:', error);
        throw error;
    }
};

app.post('/api/calculate-availability-test', async (req, res) => {
    const {startDate, endDate, serverName, tableName} = req.body;

    try {
        const availabilityData = await calculateDataAvailability22(startDate, endDate, serverName, tableName);
        const formattedData = availabilityData.map(row => ({
            ...row,
            aggregated_timestamp: formatToSAST(row.aggregated_timestamp) // Convert each timestamp to SAST format
        }));
        await res.json(formattedData);
    } catch (error) {
        res.status(500).json({error: 'Failed to calculate data availability', details: error.message});
    }
});

app.get('/api/aggregated-data-availability', async (req, res) => {
    const {startDate, endDate} = req.query;

    try {
        const query = `
      SELECT
        display_server_name,
        display_table_name,
        display_field_name,
        date AS aggregated_timestamp,
        total_records,
        available_records,
        AVG(availability_percentage) AS average_availability_percentage
      FROM daily_data_availability
      WHERE date >= $1
      AND date <= $2
      AND display_server_name IS NOT NULL
      AND btrim(display_server_name) <> ''
      AND display_table_name IS NOT NULL
      AND btrim(display_table_name) <> ''
      AND display_field_name IS NOT NULL
      AND btrim(display_field_name) <> ''
      AND availability_percentage BETWEEN 0 AND 100
      GROUP BY display_server_name, display_table_name, display_field_name, date, total_records, available_records
      ORDER BY date ASC;
    `;
        const values = [startDate, endDate];

        const result = await pool.query(query, values);
        await res.json(result.rows);
    } catch (error) {
        console.error("Error fetching aggregated data availability:", error);
        res.status(500).json({error: 'Internal server error'});
    }
});

app.get('/api/servers-with-tables', async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT display_server_name, display_table_name
      FROM summary_table
      ORDER BY display_server_name, display_table_name;
    `;

    const result = await pool.query(query);

    // Structure the response in the format you need
    const servers = {};

    result.rows.forEach(row => {
      if (!servers[row.display_server_name]) {
        servers[row.display_server_name] = [];
      }
      servers[row.display_server_name].push({
        display_table_name: row.display_table_name,
        interval: row.aggregation_type // Assuming `aggregation_type` contains the interval type
      });
    });

    res.json(servers);  // Send the structured data
  } catch (error) {
    console.error("Error fetching servers and tables:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.get('/api/filtered-aggregated-data-availability', async (req, res) => {
  const { startDate, endDate, servers } = req.query;

  // Ensure the necessary parameters are provided
  if (!startDate || !endDate || !servers) {
    return res.status(400).json({ error: 'Missing required query parameters.' });
  }

  try {
    const serverList = servers.split(',');

    const query = `
            SELECT display_server_name,
                    display_table_name,
                    to_char(date, 'YYYY-MM-DD') AS aggregated_timestamp,
                    AVG(availability_percentage) AS average_availability_percentage
            FROM daily_data_availability
            WHERE date >= $1::date
              AND date <= $2::date
              AND display_server_name = ANY($3::text[])
              AND display_table_name IS NOT NULL
              AND btrim(display_table_name) <> ''
              AND display_field_name IS NOT NULL
              AND btrim(display_field_name) <> ''
              AND availability_percentage BETWEEN 0 AND 100
            GROUP BY display_server_name, display_table_name, date
            ORDER BY date ASC;
        `;
    const values = [startDate, endDate, serverList];

    const result = await pool.query(query, values);
    setPublicCache(res, 300);
    await res.json(result.rows);
  } catch (error) {
    console.error('Error fetching filtered aggregated data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.get('/api/data-availability', async (req, res) => {
  const { serverName, tableName, startDate, endDate } = req.query;

  try {
    const query = `
    SELECT
      display_server_name,
      display_table_name,
      display_field_name,
      to_char(date, 'YYYY-MM-DD') AS aggregated_timestamp,
      total_records,
      available_records,
      availability_percentage
    FROM daily_data_availability
    WHERE display_server_name = $1
    AND display_table_name = $2
    AND date >= $3::date
    AND date <= $4::date
    AND display_field_name IS NOT NULL
    AND btrim(display_field_name) <> ''
    AND availability_percentage BETWEEN 0 AND 100
    ORDER BY date ASC;
    `;
    const values = [serverName, tableName, startDate, endDate];

    const result = await pool.query(query, values);
    setPublicCache(res, 300);
    await res.json(result.rows);
  } catch (error) {
    console.error("Error fetching data availability:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/summary_table/date-ranges', async (req, res) => {
  const {tables} = req.body;

  if (!Array.isArray(tables)) {
    return res.status(400).json({error: 'Invalid tables payload'});
  }

  const pairs = tables
    .filter((table) => table && typeof table.serverName === 'string' && typeof table.tableName === 'string')
    .map((table) => [table.serverName, table.tableName]);

  if (pairs.length === 0) {
    return res.json([]);
  }

  try {
    const query = `
      WITH wanted AS (
        SELECT *
        FROM unnest($1::text[], $2::text[]) AS wanted(server_name, table_name)
      )
      SELECT
        wanted.server_name,
        wanted.table_name,
        sdr.start_date,
        sdr.end_date
      FROM wanted
      LEFT JOIN summary_data_date_ranges sdr
        ON wanted.server_name = sdr.server_name
       AND wanted.table_name = sdr.table_name
      WHERE sdr.start_date IS NOT NULL
         OR sdr.end_date IS NOT NULL
      ORDER BY wanted.server_name, wanted.table_name;
    `;
    const result = await pool.query(query, [
      pairs.map(([serverName]) => serverName),
      pairs.map(([, tableName]) => tableName),
    ]);
    setPublicCache(res, 300);
    await res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch summary date ranges:', error);
    res.status(500).json({error: 'Internal server error'});
  }
});


app.get('/api/unified_mapping_table', async (req, res) => {
    const {serverName, tableName, fieldName, includeInSummary} = req.query;
    const page = Math.max(Number.parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '100', 10), 1), 500);
    const offset = (page - 1) * limit;

    let baseQuery = 'SELECT * FROM unified_mapping_table';
    let countQuery = 'SELECT COUNT(*) FROM unified_mapping_table';
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (serverName) {
        conditions.push(`current_server_name = $${paramIndex++}`);
        values.push(normalizeText(serverName));
    }
    if (tableName) {
        conditions.push(`current_table_name = $${paramIndex++}`);
        values.push(normalizeText(tableName));
    }
    if (fieldName) {
        conditions.push(`current_field_name = $${paramIndex++}`);
        values.push(normalizeText(fieldName));
    }
    if (includeInSummary !== undefined && includeInSummary !== '') {
        conditions.push(`include_in_summary = $${paramIndex++}`);
        values.push(includeInSummary === 'true');
    }

    if (conditions.length > 0) {
        const whereClause = ' WHERE ' + conditions.join(' AND ');
        baseQuery += whereClause;
        countQuery += whereClause;
    }

    baseQuery += ` ORDER BY current_server_name, current_table_name, current_field_name LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    values.push(limit, offset);

    try {
        const [dataResult, countResult] = await Promise.all([
            pool.query(baseQuery, values),
            pool.query(countQuery, values.slice(0, paramIndex - 2))
        ]);

        await res.json({
          rows: dataResult.rows,
          total: parseInt(countResult.rows[0].count, 10)
        });
    } catch (error) {
        res.status(500).send(error.toString());
    }
});

async function buildUnifiedMappingPreflight(client, values) {
  const {
    ids = [],
    displayServerName,
    displayTableName,
    displayFieldName,
    latitude,
    longitude,
    units,
    aggregationType,
    multiplier,
    includeInSummary
  } = values;

  const errors = [];
  const warnings = [];
  const normalized = {
    displayServerName: normalizeText(displayServerName),
    displayTableName: normalizeText(displayTableName),
    displayFieldName: normalizeText(displayFieldName),
    units: normalizeText(units),
    aggregationType: normalizeText(aggregationType),
    latitude: parseNullableNumber(latitude),
    longitude: parseNullableNumber(longitude),
    multiplier: parseNullableNumber(multiplier),
    includeInSummary: includeInSummary !== undefined ? !!includeInSummary : false
  };

  if (displayServerName !== undefined && displayServerName !== normalized.displayServerName) warnings.push('Display server name will be trimmed/normalized.');
  if (displayTableName !== undefined && displayTableName !== normalized.displayTableName) warnings.push('Display table name will be trimmed/normalized.');
  if (displayFieldName !== undefined && displayFieldName !== normalized.displayFieldName) warnings.push('Display field name will be trimmed/normalized.');
  if (units !== undefined && units !== normalized.units) warnings.push('Units will be trimmed/normalized.');

  if (normalized.includeInSummary) {
    if (!normalized.displayServerName) errors.push('Display server name is required before a row can go live.');
    if (!normalized.displayTableName) errors.push('Display table name is required before a row can go live.');
    if (!normalized.displayFieldName) errors.push('Display field name is required before a row can go live.');
    if (!normalized.units) errors.push('Units are required before a row can go live.');
    if (normalized.latitude === null) errors.push('Latitude is required before a row can go live.');
    if (normalized.longitude === null) errors.push('Longitude is required before a row can go live.');
  }

  errors.push(...validateLatLon(normalized.latitude, normalized.longitude));

  if (!normalized.aggregationType || Number.isNaN(Number(normalized.aggregationType))) {
    errors.push('Aggregation type must be numeric minutes.');
  }
  if (normalized.multiplier === null || Number.isNaN(normalized.multiplier)) {
    errors.push('Multiplier must be numeric.');
  }

  if (normalized.includeInSummary && errors.length === 0) {
    const duplicateResult = await client.query(`
      SELECT id, current_server_name, current_table_name, current_field_name
      FROM unified_mapping_table
      WHERE include_in_summary = TRUE
        AND btrim(display_server_name) = $1
        AND btrim(display_table_name) = $2
        AND btrim(display_field_name) = $3
        AND btrim(aggregation_type) = $4
        AND id <> ALL($5::uuid[])
      LIMIT 10
    `, [
      normalized.displayServerName,
      normalized.displayTableName,
      normalized.displayFieldName,
      normalized.aggregationType,
      Array.isArray(ids) ? ids : []
    ]);

    if (duplicateResult.rows.length > 0) {
      errors.push('Another live mapping already uses this display site/table/field/aggregation combination.');
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized
  };
}

app.post('/api/unified_mapping_table/preflight', async (req, res) => {
  if (!requireSuperUser(req, res)) return;

  const client = await pool.connect();
  try {
    const result = await buildUnifiedMappingPreflight(client, req.body || {});
    res.status(result.ok ? 200 : 400).json(result);
  } catch (error) {
    console.error('Unified mapping preflight failed:', error);
    res.status(500).json({message: 'Preflight failed.', error: error.message});
  } finally {
    client.release();
  }
});

app.get('/api/unified_mapping_table/health', async (req, res) => {
  if (!requireSuperUser(req, res)) return;

  try {
    const result = await pool.query(`
      WITH metrics AS (
        SELECT 'Unified rows' AS label, count(*)::int AS count FROM unified_mapping_table
        UNION ALL SELECT 'Live unified rows', count(*)::int FROM unified_mapping_table WHERE include_in_summary IS TRUE
        UNION ALL SELECT 'Blank live display server names', count(*)::int FROM unified_mapping_table WHERE include_in_summary IS TRUE AND (display_server_name IS NULL OR btrim(display_server_name) = '')
        UNION ALL SELECT 'Blank live display table names', count(*)::int FROM unified_mapping_table WHERE include_in_summary IS TRUE AND (display_table_name IS NULL OR btrim(display_table_name) = '')
        UNION ALL SELECT 'Blank live display field names', count(*)::int FROM unified_mapping_table WHERE include_in_summary IS TRUE AND (display_field_name IS NULL OR btrim(display_field_name) = '')
        UNION ALL SELECT 'Display server names needing trim', count(*)::int FROM unified_mapping_table WHERE include_in_summary IS TRUE AND display_server_name IS DISTINCT FROM btrim(display_server_name)
        UNION ALL SELECT 'Invalid live coordinates', count(*)::int FROM unified_mapping_table WHERE include_in_summary IS TRUE AND (latitude IS NULL OR longitude IS NULL OR latitude < -90 OR latitude > 90 OR longitude < -180 OR longitude > 180)
        UNION ALL SELECT 'Blank live site card display names', count(*)::int
          FROM site_mapping sm
          WHERE (sm.display_name IS NULL OR btrim(sm.display_name) = '')
            AND EXISTS (
              SELECT 1
              FROM unified_mapping_table umt
              WHERE umt.include_in_summary IS TRUE
                AND umt.current_server_name = sm.site_name
            )
        UNION ALL SELECT 'Live site card names needing trim', count(*)::int
          FROM site_mapping sm
          WHERE sm.display_name IS DISTINCT FROM btrim(sm.display_name)
            AND EXISTS (
              SELECT 1
              FROM unified_mapping_table umt
              WHERE umt.include_in_summary IS TRUE
                AND umt.current_server_name = sm.site_name
            )
      ),
      duplicate_keys AS (
        SELECT count(*)::int AS count
        FROM (
          SELECT btrim(display_server_name), btrim(display_table_name), btrim(display_field_name), btrim(aggregation_type), count(*)
          FROM unified_mapping_table
          WHERE include_in_summary IS TRUE
          GROUP BY 1,2,3,4
          HAVING count(*) > 1
        ) d
      )
      SELECT jsonb_build_object(
        'metrics', (SELECT jsonb_agg(metrics ORDER BY label) FROM metrics),
        'duplicateLiveKeys', (SELECT count FROM duplicate_keys),
        'examples', (
          SELECT jsonb_agg(to_jsonb(x))
          FROM (
            SELECT id, current_server_name, current_table_name, current_field_name,
                   display_server_name, display_table_name, display_field_name,
                   latitude, longitude, include_in_summary
            FROM unified_mapping_table
            WHERE (include_in_summary IS TRUE AND (
                    display_server_name IS NULL OR btrim(display_server_name) = ''
                 OR display_table_name IS NULL OR btrim(display_table_name) = ''
                 OR display_field_name IS NULL OR btrim(display_field_name) = ''
                 OR latitude IS NULL OR longitude IS NULL
                 OR latitude < -90 OR latitude > 90
                 OR longitude < -180 OR longitude > 180
                ))
               OR (include_in_summary IS TRUE AND display_server_name IS DISTINCT FROM btrim(display_server_name))
            ORDER BY include_in_summary DESC, current_server_name, current_table_name
            LIMIT 25
          ) x
        )
      ) AS health
    `);
    setPublicCache(res, 30);
    res.json(result.rows[0].health);
  } catch (error) {
    console.error('Unified mapping health failed:', error);
    res.status(500).json({message: 'Failed to calculate mapping health.', error: error.message});
  }
});

app.get('/api/unified_mapping_table/issues', async (req, res) => {
  if (!requireSuperUser(req, res)) return;

  const type = normalizeText(req.query.type);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit || '100', 10), 1), 500);

  const unifiedColumns = `
    id,
    current_server_name,
    current_table_name,
    current_field_name,
    display_server_name,
    display_table_name,
    display_field_name,
    display_units,
    latitude,
    longitude,
    aggregation_type,
    multiplier,
    include_in_summary
  `;
  const unifiedColumnsFromUmt = `
    umt.id,
    umt.current_server_name,
    umt.current_table_name,
    umt.current_field_name,
    umt.display_server_name,
    umt.display_table_name,
    umt.display_field_name,
    umt.display_units,
    umt.latitude,
    umt.longitude,
    umt.aggregation_type,
    umt.multiplier,
    umt.include_in_summary
  `;

  const issueQueries = {
    blank_live_display_field_names: {
      source: 'unified',
      sql: `
        SELECT ${unifiedColumns}
        FROM unified_mapping_table
        WHERE include_in_summary IS TRUE
          AND (display_field_name IS NULL OR btrim(display_field_name) = '')
        ORDER BY current_server_name, current_table_name, current_field_name
        LIMIT $1
      `
    },
    blank_live_display_server_names: {
      source: 'unified',
      sql: `
        SELECT ${unifiedColumns}
        FROM unified_mapping_table
        WHERE include_in_summary IS TRUE
          AND (display_server_name IS NULL OR btrim(display_server_name) = '')
        ORDER BY current_server_name, current_table_name, current_field_name
        LIMIT $1
      `
    },
    blank_live_display_table_names: {
      source: 'unified',
      sql: `
        SELECT ${unifiedColumns}
        FROM unified_mapping_table
        WHERE include_in_summary IS TRUE
          AND (display_table_name IS NULL OR btrim(display_table_name) = '')
        ORDER BY current_server_name, current_table_name, current_field_name
        LIMIT $1
      `
    },
    display_server_names_needing_trim: {
      source: 'unified',
      sql: `
        SELECT ${unifiedColumns}
        FROM unified_mapping_table
        WHERE include_in_summary IS TRUE
          AND display_server_name IS DISTINCT FROM btrim(display_server_name)
        ORDER BY include_in_summary DESC, current_server_name, current_table_name, current_field_name
        LIMIT $1
      `
    },
    invalid_live_coordinates: {
      source: 'unified',
      sql: `
        SELECT ${unifiedColumns}
        FROM unified_mapping_table
        WHERE include_in_summary IS TRUE
          AND (
            latitude IS NULL OR longitude IS NULL
            OR latitude < -90 OR latitude > 90
            OR longitude < -180 OR longitude > 180
          )
        ORDER BY current_server_name, current_table_name, current_field_name
        LIMIT $1
      `
    },
    duplicate_live_keys: {
      source: 'unified',
      sql: `
        WITH duplicate_keys AS (
          SELECT btrim(display_server_name) AS display_server_name,
                 btrim(display_table_name) AS display_table_name,
                 btrim(display_field_name) AS display_field_name,
                 btrim(aggregation_type) AS aggregation_type
          FROM unified_mapping_table
          WHERE include_in_summary IS TRUE
          GROUP BY 1, 2, 3, 4
          HAVING count(*) > 1
        )
        SELECT ${unifiedColumnsFromUmt}
        FROM unified_mapping_table umt
        JOIN duplicate_keys dk
          ON btrim(umt.display_server_name) = dk.display_server_name
         AND btrim(umt.display_table_name) = dk.display_table_name
         AND btrim(umt.display_field_name) = dk.display_field_name
         AND btrim(umt.aggregation_type) = dk.aggregation_type
        WHERE umt.include_in_summary IS TRUE
        ORDER BY umt.display_server_name, umt.display_table_name, umt.display_field_name, umt.current_server_name
        LIMIT $1
      `
    },
    blank_live_site_card_display_names: {
      source: 'site',
      sql: `
        SELECT site_id, site_name, display_name, latitude, longitude, image, citation, doi
        FROM site_mapping sm
        WHERE (display_name IS NULL OR btrim(display_name) = '')
          AND EXISTS (
            SELECT 1
            FROM unified_mapping_table umt
            WHERE umt.include_in_summary IS TRUE
              AND umt.current_server_name = sm.site_name
          )
        ORDER BY site_name
        LIMIT $1
      `
    },
    live_site_card_names_needing_trim: {
      source: 'site',
      sql: `
        SELECT site_id, site_name, display_name, latitude, longitude, image, citation, doi
        FROM site_mapping sm
        WHERE display_name IS DISTINCT FROM btrim(display_name)
          AND EXISTS (
            SELECT 1
            FROM unified_mapping_table umt
            WHERE umt.include_in_summary IS TRUE
              AND umt.current_server_name = sm.site_name
          )
        ORDER BY site_name
        LIMIT $1
      `
    }
  };

  const config = issueQueries[type];
  if (!config) {
    return res.status(400).json({message: 'Unknown issue type.'});
  }

  try {
    const {rows} = await pool.query(config.sql, [limit]);
    res.json({type, source: config.source, rows, count: rows.length, limit});
  } catch (error) {
    console.error('Unified mapping issues failed:', error);
    res.status(500).json({message: 'Failed to fetch mapping issues.', error: error.message});
  }
});


app.post('/api/unified_mapping_table/update', async (req, res) => {
  if (!requireSuperUser(req, res)) return;

  const {
    ids,
    displayServerName,
    displayTableName,
    displayFieldName,
    latitude,
    longitude,
    units,
    aggregationType,
    multiplier,
    includeInSummary
  } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({message: 'Select a mapping row before updating.'});
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Optional: serialize our own rebuilds (keeps two callers from racing)
    await client.query(`SELECT pg_advisory_lock(hashtext('summary_rebuild'))`);

    const preflight = await buildUnifiedMappingPreflight(client, {
      ids,
      displayServerName,
      displayTableName,
      displayFieldName,
      latitude,
      longitude,
      units,
      aggregationType,
      multiplier,
      includeInSummary
    });

    if (!preflight.ok) {
      await client.query('ROLLBACK');
      await client.query(`SELECT pg_advisory_unlock(hashtext('summary_rebuild'))`).catch(()=>{});
      return res.status(400).json({
        message: 'Mapping failed preflight checks.',
        errors: preflight.errors,
        warnings: preflight.warnings
      });
    }

    const {
      displayServerName: validDisplayServerName,
      displayTableName: validDisplayTableName,
      displayFieldName: validDisplayFieldName,
      latitude: validLatitude,
      longitude: validLongitude,
      units: validUnits,
      aggregationType: validAggregationType,
      multiplier: validMultiplier,
      includeInSummary: validIncludeInSummary
    } = preflight.normalized;

    // 2) Update selected mapping rows
    const updateMapSql = `
      UPDATE unified_mapping_table
      SET
        display_server_name = $1,
        display_table_name  = $2,
        display_field_name  = $3,
        latitude            = $4,
        longitude           = $5,
        display_units       = $6,
        aggregation_type    = $7,
        multiplier          = $8,
        include_in_summary  = $9
      WHERE id = ANY($10::uuid[])
    `;
    const upd = await client.query(updateMapSql, [
      validDisplayServerName, validDisplayTableName, validDisplayFieldName,
      validLatitude, validLongitude, validUnits,
      validAggregationType, validMultiplier, validIncludeInSummary,
      ids
    ]);
    if (upd.rowCount !== ids.length) {
      throw new Error(`Updated ${upd.rowCount}/${ids.length} mapping rows`);
    }

    // 3) Reconcile summary_table WITHOUT TRUNCATE (no AccessExclusive lock)
    //    - Build a de-duped “src” set of desired summary rows from unified_mapping_table where include_in_summary=TRUE
    //    - UPDATE existing rows to match src
    //    - INSERT rows that are in src but not in summary_table
    //    - DELETE rows from summary_table that are NOT in src (stale)

    const reconcileSql = `
      WITH src AS (
        SELECT DISTINCT ON (display_server_name, display_table_name, display_field_name, aggregation_type)
                umt.field_id,
                umt.display_server_name,
                umt.display_table_name,
                umt.display_field_name,
                umt.display_units      AS units,
                umt.latitude,
                umt.longitude,
                umt.aggregation_type,
                umt.multiplier
        FROM unified_mapping_table umt
        WHERE umt.include_in_summary = TRUE
          AND btrim(umt.display_server_name) <> ''
          AND btrim(umt.display_table_name) <> ''
          AND btrim(umt.display_field_name) <> ''
          AND umt.latitude IS NOT NULL
          AND umt.longitude IS NOT NULL
        ORDER BY
          umt.display_server_name, umt.display_table_name, umt.display_field_name, umt.aggregation_type
      ),

      -- UPDATE existing rows to match src (only when values differ)
      upd AS (
        UPDATE summary_table t
        SET field_id        = s.field_id,
            units           = s.units,
            latitude        = s.latitude,
            longitude       = s.longitude,
            aggregation_type= s.aggregation_type,
            multiplier      = s.multiplier
        FROM src s
        WHERE t.display_server_name = s.display_server_name
          AND t.display_table_name  = s.display_table_name
          AND t.display_field_name  = s.display_field_name
          AND t.aggregation_type    = s.aggregation_type
          AND (t.field_id, t.units, t.latitude, t.longitude, t.aggregation_type, t.multiplier)
              IS DISTINCT FROM
              (s.field_id, s.units, s.latitude, s.longitude, s.aggregation_type, s.multiplier)
        RETURNING t.display_server_name, t.display_table_name, t.display_field_name, t.aggregation_type
      ),

      -- INSERT rows that are in src but not in summary_table
      ins AS (
        INSERT INTO summary_table (
          id, field_id, display_server_name, display_table_name, display_field_name,
          units, latitude, longitude, aggregation_type, multiplier
        )
        SELECT
          uuid_generate_v4(), s.field_id, s.display_server_name, s.display_table_name, s.display_field_name,
          s.units, s.latitude, s.longitude, s.aggregation_type, s.multiplier
        FROM src s
        LEFT JOIN summary_table t
          ON t.display_server_name = s.display_server_name
          AND t.display_table_name  = s.display_table_name
          AND t.display_field_name  = s.display_field_name
          AND t.aggregation_type    = s.aggregation_type
        WHERE t.display_server_name IS NULL
        RETURNING 1
      )

      -- DELETE rows in summary_table that no longer have a source in src (stale)
      DELETE FROM summary_table t
      WHERE NOT EXISTS (
        SELECT 1 FROM src s
        WHERE t.display_server_name = s.display_server_name
          AND t.display_table_name  = s.display_table_name
          AND t.display_field_name  = s.display_field_name
          AND t.aggregation_type    = s.aggregation_type
      );
    `;

    await client.query(reconcileSql);

    await client.query('COMMIT');
    await client.query(`SELECT pg_advisory_unlock(hashtext('summary_rebuild'))`);
    return res.status(200).json({
      message: 'Update successful. Summary table reconciled.',
      warnings: preflight.warnings
    });

  } catch (error) {
    await client.query('ROLLBACK');
    await client.query(`SELECT pg_advisory_unlock(hashtext('summary_rebuild'))`).catch(()=>{});
    console.error('Update failed:', error);
    return res.status(500).json({ message: 'Update failed.', error: error.message });
  } finally {
    client.release();
  }
});

//app.post('/api/unified_mapping_table/update', async (req, res) => {
//  const {
//      ids,
//      displayServerName,
//      displayTableName,
//      displayFieldName,
//      latitude,
//      longitude,
//      units,
//      aggregationType,
//      multiplier, // Add multiplier here
//      includeInSummary
//  } = req.body;
//
//  // Input validation
//  if (!Array.isArray(ids) || ids.length === 0 || !displayServerName || !displayTableName || !displayFieldName || !units || aggregationType === undefined || multiplier === undefined) {
//      return res.status(400).json({message: 'Invalid or incomplete request data.'});
//  }
//
//  // Validate numeric fields
//  const validLatitude = latitude !== undefined ? parseFloat(latitude) : null;
//  const validLongitude = longitude !== undefined ? parseFloat(longitude) : null;
//  const validMultiplier = multiplier !== undefined ? parseFloat(multiplier) : null; // Validate multiplier
//
//  if (isNaN(validLatitude) || isNaN(validLongitude) || isNaN(aggregationType) || isNaN(validMultiplier)) {
//      return res.status(400).json({message: 'Latitude, Longitude, Aggregation Type, and Multiplier must be numeric.'});
//  }
//
//  // Assume false if not specified
//  const validIncludeInSummary = includeInSummary !== undefined ? includeInSummary : false;
//
//  try {
//      // Check for duplicates before proceeding with the update
//      const duplicateCheckQuery = `
//    SELECT
//      display_server_name, display_table_name, display_field_name, aggregation_type, COUNT(*)
//    FROM
//      unified_mapping_table
//    WHERE
//      display_server_name = $1 AND
//      display_table_name = $2 AND
//      display_field_name = $3 AND
//      aggregation_type = $4 AND
//      include_in_summary = true
//    GROUP BY
//      display_server_name, display_table_name, display_field_name, aggregation_type
//    HAVING COUNT(*) > 1;
//  `;
//
//      const duplicateResult = await pool.query(duplicateCheckQuery, [displayServerName, displayTableName, displayFieldName, aggregationType]);
//      if (duplicateResult.rows.length > 0) {
//          return res.status(409).json({
//              message: 'Duplicate entries found, update aborted.',
//              duplicates: duplicateResult.rows
//          });
//      }
//
//      await pool.query('BEGIN');
//
//      const updateQuery = `
//    UPDATE unified_mapping_table
//    SET
//      display_server_name = $1,
//      display_table_name = $2,
//      display_field_name = $3,
//      latitude = $4,
//      longitude = $5,
//      display_units = $6,
//      aggregation_type = $7,
//      multiplier = $8,  -- Add multiplier update here
//      include_in_summary = $9
//    WHERE id = ANY($10::uuid[])
//  `;
//
//      const result = await pool.query(updateQuery, [
//          displayServerName,
//          displayTableName,
//          displayFieldName,
//          validLatitude,
//          validLongitude,
//          units,
//          aggregationType,
//          validMultiplier, // Include multiplier in the query
//          validIncludeInSummary,
//          ids
//      ]);
//
//      if (result.rowCount !== ids.length) {
//          throw new Error(`Update successful for ${result.rowCount} out of ${ids.length} rows.`);
//      }
//
//      const summaryResult = await populateSummaryTable();
//      if (!summaryResult.success) {
//          throw new Error(`Summary table update failed: ${summaryResult.error}`);
//      }
//
//      await pool.query('COMMIT');
//      res.status(200).json({message: 'Update successful. Summary table updated.'});
//  } catch (error) {
//      await pool.query('ROLLBACK');
//      const errorMessage = error.message.includes('Duplicate entries found')
//          ? 'Duplicate entries found, update aborted.'
//          : error.message.includes('ON CONFLICT DO UPDATE command cannot affect row a second time')
//              ? 'Summary table update failed due to conflict resolution issue.'
//              : 'Update failed.';
//
//      console.error('Error updating rows:', error); // Detailed error logging
//      res.status(500).json({message: errorMessage, error: error.message}); // Detailed error feedback
//  }
//});

app.post('/api/unified_mapping_table/check_duplicates', async (req, res) => {
    if (!requireSuperUser(req, res)) return;

    const {displayServerName, displayTableName, displayFieldName, aggregationType, multiplier} = req.body; // Include multiplier
    const cleaned = {
      displayServerName: normalizeText(displayServerName),
      displayTableName: normalizeText(displayTableName),
      displayFieldName: normalizeText(displayFieldName),
      aggregationType: normalizeText(aggregationType),
      multiplier: parseNullableNumber(multiplier)
    };

    // Corrected validation check
    if (!cleaned.displayServerName || !cleaned.displayTableName || !cleaned.displayFieldName || !cleaned.aggregationType || cleaned.multiplier === null || Number.isNaN(cleaned.multiplier)) {
        return res.status(400).json({message: 'Missing required fields'});
    }
    try {
        const duplicateCheckQuery = `
      SELECT
        display_server_name,
        display_table_name,
        display_field_name,
        aggregation_type,
        multiplier,
        COUNT(*)
      FROM
        unified_mapping_table
      WHERE
        btrim(display_server_name) = $1 AND
        btrim(display_table_name) = $2 AND
        btrim(display_field_name) = $3 AND
        btrim(aggregation_type) = $4 AND
        multiplier = $5 AND
        include_in_summary = true
      GROUP BY
        display_server_name, display_table_name, display_field_name, aggregation_type, multiplier
      HAVING COUNT(*) > 1;
    `;

        const result = await pool.query(duplicateCheckQuery, [
          cleaned.displayServerName,
          cleaned.displayTableName,
          cleaned.displayFieldName,
          cleaned.aggregationType,
          cleaned.multiplier
        ]);
        if (result.rows.length > 0) {
            return res.status(409).json({message: 'Duplicate entries found', duplicates: result.rows});
        } else {
            return res.status(200).json({message: 'No duplicates found'});
        }
    } catch (error) {
        console.error('Error checking for duplicates:', error);
        res.status(500).json({message: 'Error checking for duplicates', error: error.message});
    }
});

app.get('/api/unified_mapping_table/sankey_with_status', async (req, res) => {
    const selectedServer = req.query.selectedServer;

    if (!selectedServer) {
        return res.status(400).json({error: 'Server selection is required.'});
    }

    try {
        const query = `
    SELECT
    u.display_server_name,
    u.display_table_name,
    u.display_field_name,
    u.end_date
    FROM
    unified_mapping_table u
    WHERE
    u.display_server_name = $1
    AND u.include_in_summary = true;
    `;

        const result = await pool.query(query, [selectedServer]);

        if (result.rows.length === 0) {
            return await res.json({nodes: [], links: []});
        }

        const nodes = [];
        const links = [];
        const nodeMap = {};

        result.rows.forEach((row) => {
            if (!nodeMap[row.display_server_name]) {
                nodes.push({name: row.display_server_name, end_date: row.end_date});
                nodeMap[row.display_server_name] = true;
            }

            if (!nodeMap[row.display_table_name]) {
                nodes.push({name: row.display_table_name, end_date: row.end_date});
                nodeMap[row.display_table_name] = true;
            }

            if (!nodeMap[row.display_field_name]) {
                nodes.push({name: row.display_field_name, end_date: row.end_date});
                nodeMap[row.display_field_name] = true;
            }

            links.push({
                source: row.display_server_name,
                target: row.display_table_name,
                value: 1,
            });

            links.push({
                source: row.display_table_name,
                target: row.display_field_name,
                value: 1,
            });
        });

        setPublicCache(res, 300);
        await res.json({nodes, links});
    } catch (error) {
        console.error('Error fetching Sankey data:', error);
        res.status(500).json({error: 'Server Error'});
    }
});

app.get('/api/site_metadata', async (req, res) => {
    const {displayName} = req.query;

    if (!displayName) {
        return res.status(400).json({error: 'Display name is required'});
    }

    try {
        const result = await pool.query(
            `SELECT citation, doi FROM site_mapping WHERE display_name = $1`,
            [displayName]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({error: 'Site not found'});
        }

        setPublicCache(res, 300);
        await res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching site metadata:', err);
        res.status(500).json({error: 'Internal server error'});
    }
});

app.post('/api/site_metadata/bulk', async (req, res) => {
    const displayNames = Array.isArray(req.body?.displayNames)
      ? [...new Set(req.body.displayNames.map((name) => normalizeText(name)).filter(Boolean))]
      : [];

    if (displayNames.length === 0) {
        return res.json([]);
    }

    try {
        const result = await pool.query(
            `
              SELECT display_name, citation, doi
              FROM site_mapping
              WHERE display_name = ANY($1::text[])
              ORDER BY display_name
            `,
            [displayNames]
        );

        setPublicCache(res, 300);
        await res.json(result.rows);
    } catch (err) {
        console.error('Error fetching bulk site metadata:', err);
        res.status(500).json({error: 'Internal server error'});
    }
});

app.get('/api/public/site_disclaimer', async (req, res) => {
  try {
    const serverName = (req.query.serverName || '').trim();
    if (!serverName) return res.status(400).json({error: 'serverName is required'});

    const {rows} = await pool.query(
      `
        SELECT
          display_name AS "siteName",
          disclaimer_message AS "message",
          disclaimer_contact_email AS "contactEmail",
          COALESCE(disclaimer_require_ack, TRUE) AS "requireAck"
        FROM site_mapping
        WHERE disclaimer_is_active = TRUE
          AND LOWER(display_name) = LOWER($1)
        LIMIT 1
      `,
      [serverName]
    );

    if (!rows.length || !rows[0].message) return res.status(204).send();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.json(rows[0]);
  } catch (error) {
    console.error('/api/public/site_disclaimer error:', error);
    return res.status(500).json({error: 'Failed to fetch site disclaimer'});
  }
});

app.get('/api/public/site_requirements', async (req, res) => {
  try {
    const serverName = (req.query.serverName || '').trim();
    if (!serverName) return res.status(400).json({error: 'serverName is required'});

    const {rows} = await pool.query(
      `
        SELECT
          site_id,
          display_name,
          require_extra_user_info AS "requireExtra",
          COALESCE(
            CASE
              WHEN jsonb_typeof(extra_info_fields) = 'array' THEN extra_info_fields
              ELSE extra_info_fields -> 'fields'
            END,
            '[]'::jsonb
          ) AS "fields"
        FROM site_mapping
        WHERE LOWER(display_name) = LOWER($1)
        LIMIT 1
      `,
      [serverName]
    );

    if (!rows.length) return res.status(404).json({error: 'Site not found'});
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.json(rows[0]);
  } catch (error) {
    console.error('/api/public/site_requirements error:', error);
    return res.status(500).json({error: 'Failed to fetch site requirements'});
  }
});

const getSessionUserId = (req) => req.session?.user?.id || null;

app.get('/api/public/user_site_info', async (req, res) => {
  try {
    const userId = getSessionUserId(req);
    const serverName = (req.query.serverName || '').trim();

    if (!userId) return res.status(401).json({error: 'Not signed in'});
    if (!serverName) return res.status(400).json({error: 'serverName is required'});

    const exact = await pool.query(
      `
        SELECT data, popia_consent, updated_at, site_display_name
        FROM user_site_info
        WHERE user_id = $1 AND site_display_name = $2
        LIMIT 1
      `,
      [userId, serverName]
    );

    const row = exact.rows[0];
    if (row) {
      return res.json({
        data: row.data || {},
        popia_consent: row.popia_consent || false,
        updated_at: row.updated_at,
        fromSite: row.site_display_name,
        isFallback: false,
      });
    }

    const fallback = await pool.query(
      `
        SELECT data, popia_consent, updated_at, site_display_name
        FROM user_site_info
        WHERE user_id = $1
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [userId]
    );

    const fallbackRow = fallback.rows[0];
    if (!fallbackRow) return res.status(204).send();

    return res.json({
      data: fallbackRow.data || {},
      popia_consent: fallbackRow.popia_consent || false,
      updated_at: fallbackRow.updated_at,
      fromSite: fallbackRow.site_display_name,
      isFallback: true,
    });
  } catch (error) {
    console.error('/api/public/user_site_info[GET] error:', error);
    return res.status(500).json({error: 'Failed to fetch user site info'});
  }
});

app.post('/api/public/user_site_info', async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = getSessionUserId(req);
    const {serverName, data, popia_consent} = req.body || {};

    if (!userId) return res.status(401).json({error: 'Not signed in'});
    if (!serverName) return res.status(400).json({error: 'serverName is required'});
    if (data && typeof data !== 'object') return res.status(400).json({error: 'data must be an object'});

    await client.query('BEGIN');

    const current = await client.query(
      `
        INSERT INTO user_site_info (user_id, site_display_name, data, popia_consent, updated_at)
        VALUES ($1, $2, $3::jsonb, $4::boolean, NOW())
        ON CONFLICT (user_id, site_display_name)
        DO UPDATE SET
          data = EXCLUDED.data,
          popia_consent = EXCLUDED.popia_consent,
          updated_at = NOW()
        RETURNING user_id, site_display_name, data, popia_consent, updated_at
      `,
      [userId, serverName, data || {}, !!popia_consent]
    );

    await client.query('COMMIT');
    return res.json(current.rows[0]);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('/api/public/user_site_info[POST] error:', error);
    return res.status(500).json({error: 'Failed to save user site info'});
  } finally {
    client.release();
  }
});

app.get('/api/unified_mapping_table/servers', async (req, res) => {
    try {
        const result = await pool.query('SELECT DISTINCT current_server_name FROM unified_mapping_table');
        await res.json(result.rows.map(row => row.current_server_name));
    } catch (error) {
        res.status(500).send(error.toString());
    }
});

app.get('/api/unified_mapping_table/display_servers', async (req, res) => {
    try {
        const result = await pool.query(`
      SELECT DISTINCT display_server_name
      FROM unified_mapping_table
      WHERE include_in_summary = true
    `);
        setPublicCache(res, 300);
        await res.json(result.rows.map(row => row.display_server_name));
    } catch (error) {
        res.status(500).send(error.toString());
    }
});

app.get('/api/unified_mapping_table/tables', async (req, res) => {
    const {serverName} = req.query;
    try {
        const result = await pool.query(
            'SELECT DISTINCT current_table_name FROM unified_mapping_table WHERE current_server_name = $1',
            [serverName]
        );
        await res.json(result.rows.map(row => row.current_table_name));
    } catch (error) {
        res.status(500).send(error.toString());
    }
});

app.get('/api/unified_mapping_table/fields', async (req, res) => {
    const {serverName, tableName} = req.query;
    try {
        const result = await pool.query(
            'SELECT DISTINCT current_field_name FROM unified_mapping_table WHERE current_server_name = $1 AND current_table_name = $2',
            [serverName, tableName]
        );
        await res.json(result.rows.map(row => row.current_field_name));
    } catch (error) {
        res.status(500).send(error.toString());
    }
});

app.post('/api/summary_table/clear', async (req, res) => {
    try {
        await pool.query('DELETE FROM summary_table');
        res.status(200).json({message: 'Summary table cleared.'});
    } catch (error) {
        console.error('Failed to clear summary table:', error);
        res.status(500).json({message: 'Failed to clear summary table.'});
    }
});



//app.get("/api/summary_table/servers", async (req, res) => {
//try {
//  const result = await pool.query(`
//      SELECT DISTINCT display_server_name
//      FROM summary_table
//      ORDER BY display_server_name
//    `);
//  //  console.log('Servers fetched:', result.rows);
//  await res.json(result.rows);
//} catch (err) {
//  console.error(err);
//  res.status(500).json({error: "Internal server error"});
//}
//});

app.get("/api/summary_table/servers", async (req, res) => {
  try {
    // If you gate this by auth, uncomment:
    // if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const visibilityCondition = await getSummaryVisibilityCondition();
    let { rows } = await pool.query(`
      SELECT DISTINCT TRIM(display_server_name) AS display_server_name
      FROM summary_table
      WHERE display_server_name IS NOT NULL
        AND TRIM(display_server_name) <> ''
        ${visibilityCondition}
      ORDER BY TRIM(display_server_name)
    `);
    if (rows.length === 0 && visibilityCondition) {
      ({ rows } = await pool.query(`
        SELECT DISTINCT TRIM(display_server_name) AS display_server_name
        FROM summary_table
        WHERE display_server_name IS NOT NULL
          AND TRIM(display_server_name) <> ''
        ORDER BY TRIM(display_server_name)
      `));
    }

    // return as objects to match your current frontend reduce() logic
    setNoStore(res);
    res.json(rows);
  } catch (err) {
    console.error("GET /api/summary_table/servers failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/summary_table/tables", async (req, res) => {
  const {serverName} = req.query;
  if (!serverName) {
    return res.status(400).json({error: "serverName is required"});
  }

  try {
    const visibilityCondition = await getSummaryVisibilityCondition();
    const fetchRows = (whereVisibilityCondition) => pool.query(
      `
        WITH table_names AS (
          SELECT DISTINCT btrim(display_table_name) AS display_table_name
          FROM summary_table
          WHERE btrim(display_server_name) = btrim($1)
            ${whereVisibilityCondition}
            AND display_table_name IS NOT NULL
            AND btrim(display_table_name) <> ''
        )
        SELECT
          tn.display_table_name,
          sdr.start_date,
          sdr.end_date
        FROM table_names tn
        LEFT JOIN summary_data_date_ranges sdr
          ON btrim(sdr.server_name) = btrim($1)
         AND sdr.table_name = tn.display_table_name
        ORDER BY tn.display_table_name
      `,
      [serverName],
    );
    let result = await fetchRows(visibilityCondition);
    if (result.rows.length === 0 && visibilityCondition) {
      result = await fetchRows('');
    }
    //  console.log(`Tables fetched for ${serverName}:`, result.rows);
    setNoStore(res);
    await res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({error: "Internal server error"});
  }
});



app.get("/api/summary_table/values", async (req, res) => {
  const {tableName, serverName, startDate, endDate, page, pageSize} = req.query;

  if (!tableName || !serverName || !startDate || !endDate) {
    return res.status(400).json({error: "tableName, serverName, startDate and endDate are required"});
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return res.status(400).json({error: "Dates must use YYYY-MM-DD"});
  }

  const requestedLimit = parseInt(pageSize, 10) || 100;
  const limit = Math.min(Math.max(requestedLimit, 1), 500);
  const offset = ((parseInt(page, 10) || 1) - 1) * limit;

  try {
    const totalCountQuery = pool.query(`
          SELECT COUNT(DISTINCT timestamp) AS total_count
          FROM pre_aggregated_field_values
          WHERE display_table_name = $1
            AND display_server_name = $2
            AND timestamp >= ($3::date::timestamp AT TIME ZONE 'Africa/Johannesburg')
            AND timestamp < (($4::date + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg')
        `, [tableName, serverName, startDate, endDate]);

    const optimizedQuery = `
          SELECT
            timestamp,
            field_values,
            latitude,
            longitude
          FROM pre_aggregated_field_values
          WHERE display_table_name = $1
            AND display_server_name = $2
            AND timestamp >= ($3::date::timestamp AT TIME ZONE 'Africa/Johannesburg')
            AND timestamp < (($4::date + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg')
          ORDER BY timestamp DESC
          LIMIT $5 OFFSET $6;
        `;

    const [totalCountResult, result] = await Promise.all([
      totalCountQuery,
      pool.query(optimizedQuery, [tableName, serverName, startDate, endDate, limit, offset])
    ]);

    const totalRecords = totalCountResult.rows.length > 0 ? parseInt(totalCountResult.rows[0].total_count, 10) : 0;
    const totalPages = Math.ceil(totalRecords / limit);

    setPublicCache(res, 120);
    setPublicCache(res, 300);
    res.json({
      rows: result.rows,
      total: totalRecords,
      totalPages: totalPages,
      currentPage: parseInt(page || 1, 10),
      pageSize: limit,
      startDate,
      endDate,
    });
  } catch (error) {
    console.error("Failed to retrieve values from materialized view:", error);
    res.status(500).json({message: "Failed to retrieve values from materialized view"});
  }
});




//const { pipeline } = require('stream');
//const path = require('path');
app.get('/api/summary_table/download', async (req, res) => {
  const tableName = normalizeText(req.query.tableName);
  const serverName = normalizeText(req.query.serverName);
  const startDate = queryDateOnly(req, 'startDate', 'start');
  const endDate = queryDateOnly(req, 'endDate', 'end');

  try {
    if (!tableName || !serverName) {
      return res.status(400).json({ error: 'tableName and serverName are required' });
    }

    const hasDateRange = Boolean(startDate && endDate);
    if ((startDate || endDate) && !hasDateRange) {
      return res.status(400).json({ error: 'Both startDate and endDate are required when filtering downloads by date.' });
    }
    if (hasDateRange) {
      const parsedStart = parseDateOnly(startDate);
      const parsedEnd = parseDateOnly(endDate);
      if (!parsedStart || !parsedEnd || parsedEnd < parsedStart) {
        return res.status(400).json({ error: 'Dates must use YYYY-MM-DD and endDate must be on or after startDate.' });
      }
      if (daySpan(parsedStart, parsedEnd) > getCsvDownloadLimitDays(tableName)) {
        return res.status(400).json({
          error: csvDownloadLimitMessage(tableName),
        });
      }
    }

    // Define the path where the pre-generated CSV is stored
    const csvDir = path.join(__dirname, 'csv_exports');
    const csvFilePath = path.join(csvDir, `${tableName}_${serverName}.csv`);

    if (hasDateRange && /^\d{4}-\d{2}-01$/.test(startDate)) {
      const requestedStart = new Date(`${startDate}T00:00:00Z`);
      const requestedEnd = new Date(`${endDate}T00:00:00Z`);
      const monthEnd = new Date(Date.UTC(requestedStart.getUTCFullYear(), requestedStart.getUTCMonth() + 1, 0));

      if (!Number.isNaN(requestedEnd.getTime()) && requestedEnd.toISOString().slice(0, 10) === monthEnd.toISOString().slice(0, 10)) {
        const cached = await pool.query(
          `
            SELECT file_path, file_size_bytes
            FROM csv_export_manifest
            WHERE display_server_name = $1
              AND display_table_name = $2
              AND period_start = $3::date
              AND period_end = $4::date
              AND status = 'ready'
            LIMIT 1
          `,
          [serverName, tableName, startDate, endDate]
        );

        const cachedPath = cached.rows[0]?.file_path;
        if (cachedPath) {
          const resolvedRoot = path.resolve(csvDir);
          const resolvedFile = path.resolve(csvDir, cachedPath);
          if (resolvedFile.startsWith(resolvedRoot + path.sep) && fs.existsSync(resolvedFile)) {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${tableName}_${serverName}_${startDate}_${endDate}.csv"`);
            res.setHeader('Content-Length', fs.statSync(resolvedFile).size);
            res.setHeader('X-CSV-Cache', 'hit');
            res.setHeader('X-CSV-Source', 'cached-monthly');
            res.setHeader('X-CSV-Date-Range', `${startDate} to ${endDate} (SAST)`);
            return pipeline(fs.createReadStream(resolvedFile, { highWaterMark: 64 * 1024 }), res, (err) => {
              if (err) console.error('Error streaming cached monthly CSV:', err);
            });
          }
        }
      }
    }

    // Legacy full-archive CSVs can become stale; keep them opt-in and stream canonical data by default.
    const usePreparedFullArchive = process.env.ENABLE_PREPARED_FULL_ARCHIVE_CSV === 'true';
    if (usePreparedFullArchive && !hasDateRange && fs.existsSync(csvFilePath)) {
      console.log(`Serving pre-generated CSV: ${csvFilePath}`);

      // Get the file stats to retrieve the size
      const stat = fs.statSync(csvFilePath);
      const fileSize = stat.size;  // Total size of the file in bytes

      // Set headers to initiate the file download, including the total file size
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${tableName}_${serverName}_data.csv"`);
      res.setHeader('Content-Length', fileSize);  // Send the total file size
      res.setHeader('X-CSV-Source', 'prepared-full-archive');
      console.log('Content-Length', fileSize);
      // Stream the file in chunks (e.g., 64KB)
      const readStream = fs.createReadStream(csvFilePath, { highWaterMark: 64 * 1024 });

      // Use pipeline for error handling during streaming
      pipeline(readStream, res, (err) => {
        if (err) {
          console.error('Error during streaming:', err);
          if (!res.headersSent) {
            res.status(500).send('Error while processing the download.');
          }
        }
      });
    } else {
      let formattedStartDate = startDate;
      let formattedEndDate = endDate;

      if (!hasDateRange) {
        const rangeResult = await pool.query(
          `SELECT start_date, end_date
           FROM summary_data_date_ranges
           WHERE server_name = $1 AND table_name = $2`,
          [serverName, tableName]
        );
        formattedStartDate = formatDateOnlyValue(rangeResult.rows[0]?.start_date);
        formattedEndDate = formatDateOnlyValue(rangeResult.rows[0]?.end_date);
      }

      if (!formattedStartDate || !formattedEndDate) {
        return res.status(400).json({ error: 'startDate and endDate are required for dynamic downloads' });
      }

      const startDateOnly = formatDateOnlyValue(formattedStartDate);
      const endDateOnly = formatDateOnlyValue(formattedEndDate);
      const parsedStartDateOnly = parseDateOnly(startDateOnly);
      const parsedEndDateOnly = parseDateOnly(endDateOnly);
      if (!startDateOnly || !endDateOnly || !parsedStartDateOnly || !parsedEndDateOnly || parsedEndDateOnly < parsedStartDateOnly) {
        return res.status(400).json({ error: 'No valid date range is available for this download.' });
      }
      if (daySpan(parsedStartDateOnly, parsedEndDateOnly) > getCsvDownloadLimitDays(tableName)) {
        return res.status(400).json({
          error: csvDownloadLimitMessage(tableName),
        });
      }

      // Fetch the DOI for the site from the site_mapping table
      const doiResult = await pool.query(
        `SELECT doi FROM site_mapping WHERE display_name = $1`,
        [serverName]
      );

      const doi = doiResult.rows[0]?.doi || 'DOI not available';

      // Set the response headers for CSV
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${tableName}_${serverName}_data.csv"`
      );
      res.setHeader('X-CSV-Source', hasDateRange ? 'dynamic-canonical-range' : 'dynamic-canonical-full-archive');
      res.setHeader('X-CSV-Date-Range', `${startDateOnly} to ${endDateOnly} (SAST)`);

      // Send the DOI first
      res.write(`# Citation link: ${doi}\n`);
      res.write(`# Data for ${tableName} on ${serverName}\n`);

      const escapeCsv = (value) => {
        if (value === null || value === undefined) return '';
        const text = String(value);
        return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      };

      // Build the CSV schema from the public mapping. Full archive downloads can span years, so
      // pre-scanning field_values for distinct fields makes the browser wait before headers arrive.
      const fieldsResult = await pool.query(
        `
          SELECT
            display_field_name,
            MIN(units) AS units
          FROM summary_table
          WHERE display_table_name = $1
            AND display_server_name = $2
            AND display_field_name IS NOT NULL
            AND btrim(display_field_name) <> ''
          GROUP BY display_field_name
          ORDER BY display_field_name ASC
        `,
        [tableName, serverName]
      );

      const fields = fieldsResult.rows.map((row) => row.display_field_name);
      const unitsMap = {};
      fieldsResult.rows.forEach((row) => {
        unitsMap[row.display_field_name] = row.units || '';
      });

      // Write headers
      const headers = ['Timestamp', ...fields, 'Latitude', 'Longitude'];
      res.write(`${headers.join(',')}\n`);

      // Write units
      const unitsRow = ['', ...fields.map((field) => unitsMap[field]), '', ''];
      res.write(`${unitsRow.join(',')}\n`);
      if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
      }

      // Start a query stream over one pre-aggregated row per timestamp.
      const client = await pool.connect(); // Get a client from the pool
      let clientReleased = false;
      const releaseClient = () => {
        if (!clientReleased) {
          clientReleased = true;
          client.release();
        }
      };

      try {
        const queryStream = new QueryStream(
          `
            SELECT
              TO_CHAR(fv."timestamp" AT TIME ZONE 'Africa/Johannesburg', 'YYYY-MM-DD"T"HH24:MI:SS') AS timestamp,
              st.display_field_name,
              CASE
                WHEN fv.value ~ '^[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?$'
                  AND st.multiplier IS NOT NULL
                  THEN (fv.value::numeric * st.multiplier::numeric)::text
                ELSE fv.value
              END AS field_value,
              st.latitude,
              st.longitude
            FROM summary_table st
            JOIN field_values fv ON fv.field_id = st.field_id
            WHERE st.display_table_name = $1
              AND st.display_server_name = $2
              AND fv."timestamp" >= ($3::date::timestamp AT TIME ZONE 'Africa/Johannesburg')
              AND fv."timestamp" < (($4::date + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg')
              AND st.display_field_name IS NOT NULL
              AND btrim(st.display_field_name) <> ''
              AND fv.value IS NOT NULL
              AND btrim(fv.value) <> ''
              AND upper(btrim(fv.value)) NOT IN ('NAN', 'NA', 'NULL', 'INF', 'INFINITY', '-INF', '-INFINITY')
            ORDER BY fv."timestamp" ASC, st.display_field_name ASC
          `,
          [tableName, serverName, startDateOnly, endDateOnly]
        );

        // Execute the query as a stream using pipeline
        const stream = client.query(queryStream);

        let currentTimestamp = null;
        let currentValuesByField = {};
        let currentLatitude = '';
        let currentLongitude = '';

        const serializeCurrentTimestamp = () => {
          if (!currentTimestamp) return '';
          const csvRow = [
            currentTimestamp,
            ...fields.map((field) => currentValuesByField[field] ?? ''),
            currentLatitude,
            currentLongitude,
          ];
          return `${csvRow.map(escapeCsv).join(',')}\n`;
        };

        const csvTransform = new Transform({
          objectMode: true,
          transform(row, encoding, callback) {
            let output = '';

            if (currentTimestamp && row.timestamp !== currentTimestamp) {
              output = serializeCurrentTimestamp();
              currentValuesByField = {};
              currentLatitude = '';
              currentLongitude = '';
            }

            currentTimestamp = row.timestamp;
            if (row.display_field_name && isUsableDataValue(row.field_value)) {
              currentValuesByField[row.display_field_name] = row.field_value;
            }
            if (currentLatitude === '' && row.latitude !== null && row.latitude !== undefined) {
              currentLatitude = row.latitude;
            }
            if (currentLongitude === '' && row.longitude !== null && row.longitude !== undefined) {
              currentLongitude = row.longitude;
            }

            callback(null, output);
          },
          flush(callback) {
            callback(null, serializeCurrentTimestamp());
          }
        });

        pipeline(stream, csvTransform, res, (err) => {
          if (err) {
            const message = err.code === 'ERR_STREAM_PREMATURE_CLOSE'
              ? 'Dynamic CSV stream closed before completion.'
              : 'Pipeline failed while dynamically generating CSV.';
            console.error(message, err);
            if (!res.headersSent) {
              res.status(500).send('Error while processing the request.');
            }
          } else {
            console.log('Pipeline succeeded for dynamic CSV generation.');
          }
          releaseClient();
        });
      } catch (err) {
        console.error('Error while executing query:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal server error' });
        }
        releaseClient();
      }
    }
  } catch (err) {
    console.error('Error while handling download request:', err);
    if (res.headersSent) {
      res.destroy(err);
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});




app.get('/api/summary_table/date_range', async (req, res) => {
    const {serverName, tableName} = req.query;

    try {
        // Query to fetch the date range directly from the pre-calculated table
        const result = await pool.query(`
      SELECT start_date, end_date
      FROM summary_data_date_ranges
      WHERE server_name = $1 AND table_name = $2
    `, [serverName, tableName]);

        // Check if any result is returned
        setPublicCache(res, 300);
        if (result.rows.length > 0 && result.rows[0].start_date && result.rows[0].end_date) {
            await res.json({
              start_date: new Date(result.rows[0].start_date).toISOString(),
              end_date: new Date(result.rows[0].end_date).toISOString()
            });
        } else {
            await res.json({start_date: null, end_date: null});
        }
    } catch (err) {
        console.error('Failed to fetch date range:', err);
        res.status(500).json({error: 'Internal server error'});
    }
});


// API to get field metadata
app.get('/api/field-metadata', async (req, res) => {
  try {
    // Add ORDER BY to sort results alphabetically
    const namesQuery = 'SELECT display_field_name, description FROM field_metadata_names ORDER BY display_field_name ASC;';
    const unitsQuery = 'SELECT units, units_description FROM field_metadata_units ORDER BY units ASC;';

    const fieldNames = await pool.query(namesQuery);
    const fieldUnits = await pool.query(unitsQuery);

    setPublicCache(res, 300);
    res.json({
      fieldNames: fieldNames.rows,
      fieldUnits: fieldUnits.rows
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});


app.get('/api/summary_table/locations', async (req, res) => {
    try {
        setPublicCache(res, 300);
        const result = await pool.query(`
            WITH public_sites AS (
                SELECT DISTINCT btrim(display_server_name) AS display_server_name
                FROM summary_table
                WHERE display_server_name IS NOT NULL
                  AND btrim(display_server_name) <> ''
            )
            SELECT
                public_sites.display_server_name,
                sm.latitude::double precision AS latitude,
                sm.longitude::double precision AS longitude
            FROM public_sites
            JOIN site_mapping sm
              ON btrim(sm.display_name) = public_sites.display_server_name
            WHERE sm.latitude IS NOT NULL
              AND sm.longitude IS NOT NULL
            ORDER BY public_sites.display_server_name
        `);
        res.set('X-Map-Location-Source', 'public-data-with-site-mapping');
        await res.json(result.rows);
    } catch (err) {
        console.error('Error executing query', err.stack);
        res.status(500).json({error: 'Internal Server Error'});
    }
});

app.get('/api/summary_table/location-gaps', async (req, res) => {
    try {
        setPublicCache(res, 300);
        const result = await pool.query(`
            WITH mapped AS (
                SELECT site_name, btrim(display_name) AS display_name, latitude, longitude
                FROM site_mapping
                WHERE display_name IS NOT NULL
                  AND btrim(display_name) <> ''
                  AND latitude IS NOT NULL
                  AND longitude IS NOT NULL
            ),
            public_sites AS (
                SELECT DISTINCT btrim(display_server_name) AS display_name
                FROM summary_table
                WHERE display_server_name IS NOT NULL
                  AND btrim(display_server_name) <> ''
            )
            SELECT
                'mapped_without_public_data' AS issue,
                mapped.site_name,
                mapped.display_name,
                mapped.latitude,
                mapped.longitude
            FROM mapped
            LEFT JOIN public_sites USING (display_name)
            WHERE public_sites.display_name IS NULL
            UNION ALL
            SELECT
                'public_data_without_mapped_location' AS issue,
                NULL AS site_name,
                public_sites.display_name,
                NULL AS latitude,
                NULL AS longitude
            FROM public_sites
            LEFT JOIN mapped USING (display_name)
            WHERE mapped.display_name IS NULL
            ORDER BY issue, display_name
        `);
        await res.json({
            count: result.rows.length,
            items: result.rows,
        });
    } catch (err) {
        console.error('Error executing location gap query', err.stack);
        res.status(500).json({error: 'Internal Server Error'});
    }
});

app.get('/api/summary_table/all-mapped-locations', async (req, res) => {
    try {
        setPublicCache(res, 300);
        const result = await pool.query(`
            SELECT
                btrim(display_name) AS display_server_name,
                latitude::double precision AS latitude,
                longitude::double precision AS longitude
            FROM site_mapping
            WHERE display_name IS NOT NULL
              AND btrim(display_name) <> ''
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
            ORDER BY btrim(display_name)
        `);
        await res.json(result.rows);
    } catch (err) {
        console.error('Error executing query', err.stack);
        res.status(500).json({error: 'Internal Server Error'});
    }
});

app.get('/api/site_mappings', async (req, res) => {
    try {
        setPublicCache(res, 300);
        if (req.query.scope === 'assets') {
            if (!requireSuperUser(req, res)) return;
            const result = await pool.query(`
                SELECT
                    site_id,
                    site_name,
                    display_name,
                    longitude,
                    latitude,
                    altitude,
                    description,
                    image,
                    website_url,
                    modal_content,
                    citation,
                    doi,
                    disclaimer_message,
                    disclaimer_contact_email,
                    disclaimer_require_ack,
                    disclaimer_is_active,
                    require_extra_user_info,
                    extra_info_fields,
                    CASE
                        WHEN display_name IS NULL OR btrim(display_name) = '' THEN 'asset_only'
                        WHEN image IS NULL OR btrim(image) = '' THEN 'needs_image'
                        WHEN latitude IS NULL OR longitude IS NULL THEN 'needs_coordinates'
                        ELSE 'publish_ready'
                    END AS publish_status
                FROM site_mapping
                ORDER BY site_name
            `);
            return res.json(result.rows);
        }

        const result = await pool.query(`
            SELECT
                site_id,
                site_name,
                COALESCE(NULLIF(btrim(display_name), ''), site_name) AS display_name,
                longitude,
                latitude,
                altitude,
                COALESCE(NULLIF(description, ''), 'No description available.') AS description,
                image,
                website_url,
                modal_content,
                citation,
                doi,
                disclaimer_message,
                disclaimer_contact_email,
                disclaimer_require_ack,
                disclaimer_is_active,
                require_extra_user_info,
                extra_info_fields
            FROM site_mapping
            WHERE display_name IS NOT NULL
              AND btrim(display_name) <> ''
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
            ORDER BY COALESCE(NULLIF(btrim(display_name), ''), site_name)
        `);
        await res.json(result.rows);
    } catch (err) {
        console.error('Error fetching site mappings:', err);
        res.status(500).json({message: 'Error fetching site mappings'});
    }
});

app.post('/api/site_mappings/update', async (req, res) => {
  if (!requireSuperUser(req, res)) return;

  let client;
  try {
    const { siteMappings } = req.body;

    if (!Array.isArray(siteMappings) || siteMappings.length === 0) {
      return res.status(400).json({ message: 'Invalid or missing siteMappings data.' });
    }

    const validSiteMappings = siteMappings
      .filter((site) => site.site_id && site.site_name)
      .map((site) => ({
        site_id: Number(site.site_id),
        site_name: normalizeText(site.site_name),
        display_name: normalizeOptionalText(site.display_name),
        longitude: parseNullableNumber(site.longitude),
        latitude: parseNullableNumber(site.latitude),
        altitude: parseNullableNumber(site.altitude),
        description: normalizeOptionalText(site.description),
        image: normalizeOptionalText(site.image),
        website_url: normalizeOptionalText(site.website_url),
        modal_content: normalizeOptionalText(site.modal_content),
        citation: normalizeOptionalText(site.citation),
        doi: normalizeOptionalText(site.doi)
      }));
    if (validSiteMappings.length === 0) {
      return res.status(400).json({ message: 'No valid site mappings supplied.' });
    }

    const validationErrors = [];
    for (const site of validSiteMappings) {
      if (Number.isNaN(site.latitude) || Number.isNaN(site.longitude) || Number.isNaN(site.altitude)) {
        validationErrors.push(`${site.site_name}: latitude, longitude, and altitude must be numeric when supplied.`);
      }
	      validationErrors.push(...validateLatLon(site.latitude, site.longitude).map((message) => `${site.site_name}: ${message}`));
	      if (site.display_name && !site.image) {
	        validationErrors.push(
	          `${site.site_name}: this row has a Display name, which means it is intended to be published as a live public site card. Add an image filename/URL before saving, or remove the Display name to keep this site unpublished until the required assets are ready.`
	        );
	      }
	    }
    if (validationErrors.length > 0) {
      return res.status(400).json({message: 'Site mapping validation failed.', errors: validationErrors});
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const siteMappingResult = await client.query(`
      WITH input AS (
        SELECT *
        FROM jsonb_to_recordset($1::jsonb) AS x(
          site_id int,
          site_name text,
          display_name text,
          longitude numeric,
          latitude numeric,
          altitude numeric,
          description text,
          image text,
          website_url text,
          modal_content text,
          citation text,
          doi text
        )
      )
      UPDATE site_mapping sm
      SET
        display_name = input.display_name,
        longitude = input.longitude,
        latitude = input.latitude,
        altitude = input.altitude,
        description = input.description,
        image = input.image,
        website_url = input.website_url,
        modal_content = input.modal_content,
        citation = input.citation,
        doi = input.doi
      FROM input
      WHERE sm.site_id = input.site_id
    `, [JSON.stringify(validSiteMappings)]);

    const unifiedMappingResult = await client.query(`
      WITH input AS (
        SELECT *
        FROM jsonb_to_recordset($1::jsonb) AS x(
          site_name text,
          display_name text,
          longitude numeric,
          latitude numeric
        )
      )
      UPDATE unified_mapping_table umt
      SET
        display_server_name = input.display_name,
        latitude = input.latitude,
        longitude = input.longitude
      FROM input
      WHERE umt.current_server_name = input.site_name
        AND umt.current_server_name != '__Statistics__'
    `, [JSON.stringify(validSiteMappings)]);

    await client.query('COMMIT');
    res.status(200).json({
      message: 'Site mappings and unified mapping table updated successfully.',
      siteMappingsUpdated: siteMappingResult.rowCount,
      unifiedMappingsUpdated: unifiedMappingResult.rowCount
    });
  } catch (err) {
    console.error('Error during site mappings update:', err.message, err.stack);
    if (client) await client.query('ROLLBACK');
    res.status(500).json({ message: 'Error updating site mappings and unified mapping table.', error: err.message });
  } finally {
    if (client) client.release();
  }
});

// Endpoint to get units mappings
app.get('/api/units_mappings', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM units_mapping ORDER BY uz_phen_name');
        await res.json(result.rows);
    } catch (err) {
        console.error('Error fetching units mappings:', err);
        res.status(500).json({message: 'Error fetching units mappings'});
    }
});

// Endpoint to update units mappings
app.post('/api/units_mappings/update', async (req, res) => {
    if (!requireSuperUser(req, res)) return;

    let client;
    try {
        const {unitsMappings} = req.body;
        if (!Array.isArray(unitsMappings) || unitsMappings.length === 0) {
            return res.status(400).json({message: 'Invalid or missing unitsMappings data.'});
        }

        const validUnitsMappings = unitsMappings
          .filter((unit) => unit.id && unit.uz_phen_name)
          .map((unit) => ({
            id: Number(unit.id),
            phen_name_full: normalizeOptionalText(unit.phen_name_full),
            phen_type: normalizeOptionalText(unit.phen_type),
            phen_name: normalizeOptionalText(unit.phen_name),
            units: normalizeOptionalText(unit.units),
            measure: normalizeOptionalText(unit.measure),
            offset: normalizeOptionalText(unit.offset),
            var_type: normalizeOptionalText(unit.var_type),
            uz_phen_name: normalizeText(unit.uz_phen_name),
            uz_units: normalizeOptionalText(unit.uz_units),
            uz_measure: normalizeOptionalText(unit.uz_measure)
          }));
        if (validUnitsMappings.length === 0) {
            return res.status(400).json({message: 'No valid units mappings supplied.'});
        }

        const invalidUnits = validUnitsMappings
          .filter((unit) => !unit.phen_name || !unit.units)
          .map((unit) => unit.uz_phen_name);
        if (invalidUnits.length > 0) {
          return res.status(400).json({
            message: 'Units mapping validation failed.',
            errors: invalidUnits.slice(0, 25).map((name) => `${name}: Phen name and units are required.`)
          });
        }

        client = await pool.connect();
        await client.query('BEGIN');

        const unitsMappingResult = await client.query(`
          WITH input AS (
            SELECT *
            FROM jsonb_to_recordset($1::jsonb) AS x(
              id int,
              phen_name_full text,
              phen_type text,
              phen_name text,
              units text,
              measure text,
              "offset" text,
              var_type text,
              uz_phen_name text,
              uz_units text,
              uz_measure text
            )
          )
          UPDATE units_mapping um
          SET
            phen_name_full = input.phen_name_full,
            phen_type = input.phen_type,
            phen_name = input.phen_name,
            units = input.units,
            measure = input.measure,
            "offset" = input."offset",
            var_type = input.var_type,
            uz_units = input.uz_units,
            uz_measure = input.uz_measure
          FROM input
          WHERE um.id = input.id
        `, [JSON.stringify(validUnitsMappings)]);

        const unifiedMappingResult = await client.query(`
          WITH input AS (
            SELECT *
            FROM jsonb_to_recordset($1::jsonb) AS x(
              uz_phen_name text,
              phen_name text,
              units text
            )
          )
          UPDATE unified_mapping_table umt
          SET
            display_field_name = input.phen_name,
            display_units = input.units
          FROM input
          WHERE umt.current_field_name = input.uz_phen_name
        `, [JSON.stringify(validUnitsMappings)]);

        await client.query('COMMIT');
        res.status(200).json({
            message: 'Units mappings and unified mapping table updated successfully',
            unitsMappingsUpdated: unitsMappingResult.rowCount,
            unifiedMappingsUpdated: unifiedMappingResult.rowCount
        });
    } catch (err) {
        console.error('Error updating units mappings and unified mapping table:', err);
        if (client) await client.query('ROLLBACK');
        res.status(500).json({message: 'Error updating units mappings and unified mapping table'});
    } finally {
        if (client) {
            client.release();
        }
    }
});

const updateSiteMappings2 = async () => {
    setLoading(true);
    try {
        await axios.post('/api/site_mappings/update', siteMappings);
        alert('Site mappings updated successfully.');
    } catch (error) {
        console.error('Failed to update site mappings:', error);
        alert('Failed to update site mappings.');
    } finally {
        setLoading(false);
    }
};

const updateSiteMapping = async () => {
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Upsert data into site_mapping table
        const upsertQuery = `
      INSERT INTO site_mapping (site_name)
      SELECT DISTINCT name
      FROM servers
      ORDER BY name
      ON CONFLICT (site_name) DO NOTHING
    `;
        await client.query(upsertQuery);

        await client.query('COMMIT');
        console.log('Site mapping updated successfully.');
    } catch (err) {
        console.error('Error updating site mapping:', err);
        await client.query('ROLLBACK');
    } finally {
        if (client) {
            client.release();
        }
    }
};

const updateUnitsMapping = async () => {
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Correctly formatted upsert data into units_mapping table
        const upsertQuery = `
      INSERT INTO units_mapping (uz_phen_name)
      SELECT DISTINCT field_name FROM server_table_fields
      ORDER BY field_name
      ON CONFLICT (uz_phen_name) DO NOTHING
    `;
        await client.query(upsertQuery);

        await client.query('COMMIT');
        console.log('Units mapping updated successfully.');
    } catch (err) {
        console.error('Error updating units mapping:', err);
        await client.query('ROLLBACK');
    } finally {
        if (client) {
            client.release();
        }
    }
};

// Function to calculate and store average data availability
const calculateAndStoreAverageDataAvailability = async () => {
    try {
        // Fetch all periods from the availability_periods table
        const {rows: periods} = await pool.query(`
      SELECT id, period_name, start_date, end_date
      FROM availability_periods
    `);

        // Fetch all unique display_server_name and display_table_name combinations
        const {rows: serverTableCombinations} = await pool.query(`
      SELECT DISTINCT display_server_name, display_table_name
      FROM summary_table
    `);

        for (const period of periods) {
            const {start_date, end_date} = period;

            for (const {display_server_name, display_table_name} of serverTableCombinations) {
                const availabilityData = await calculateDataAvailability22(
                    start_date.toISOString().split('T')[0],
                    end_date.toISOString().split('T')[0],
                    display_server_name,
                    display_table_name
                );

                if (availabilityData.length > 0) {
                    const totalAvailability = availabilityData.reduce((sum, record) => sum + record.availability_percentage, 0);
                    const avgAvailability = totalAvailability / availabilityData.length;

                    // Store the average availability in the average_data_availability table, with conflict handling
                    await pool.query(`
            INSERT INTO average_data_availability (display_server_name, display_table_name, period_start_date, period_end_date, average_availability)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (display_server_name, display_table_name, period_start_date, period_end_date)
            DO UPDATE SET average_availability = EXCLUDED.average_availability, calculated_at = current_timestamp;
          `, [display_server_name, display_table_name, start_date, end_date, avgAvailability]);

                    console.log(`Stored average availability for ${display_server_name} - ${display_table_name} for period ${period.period_name}`);
                } else {
                    console.log(`No data available for ${display_server_name} - ${display_table_name} during period ${period.period_name}`);
                }
            }
        }

        console.log('Average data availability calculated and stored successfully.');
    } catch (error) {
        console.error('Error calculating and storing average data availability:', error);
    }
};




// Function to generate and store all CSV files
async function generateCSVFiles() {
  try {
    // Fetch all server and table names
    const serversTablesResult = await pool.query(`
      SELECT DISTINCT st.display_server_name, st.display_table_name
      FROM summary_table st
    `);

    const serversTables = serversTablesResult.rows;

    // Directory where the CSV files will be saved
    const csvDir = path.join(__dirname, 'csv_exports');
    if (!fs.existsSync(csvDir)) {
      fs.mkdirSync(csvDir); // Create the directory if it doesn't exist
      console.log(`Directory created at: ${csvDir}`);
    }

    // Loop over each server and table combination to generate CSVs
    for (const { display_server_name: serverName, display_table_name: tableName } of serversTables) {
      const csvFilePath = path.join(csvDir, `${tableName}_${serverName}.csv`);

      // Open a writable stream to store the CSV file
      const writeStream = fs.createWriteStream(csvFilePath);

      // Fetch the DOI for the site from the site_mapping table
      const doiResult = await pool.query(
        `SELECT doi FROM site_mapping WHERE display_name = $1`,
        [serverName]
      );
      const doi = doiResult.rows[0]?.doi || 'DOI not available';

      // Write DOI as the first line
      writeStream.write(`# Citation link: ${doi}\n`);

      // Write CSV headers for each file
      writeStream.write(`# Data for ${tableName} on ${serverName}\n`);

      // Fetch unique field names and units
      const fieldsResult = await pool.query(
        `
        SELECT DISTINCT st.display_field_name, st.units
        FROM summary_table st
        JOIN field_values fv ON fv.field_id = st.field_id
        WHERE st.display_table_name = $1
          AND st.display_server_name = $2
        ORDER BY st.display_field_name ASC
        `,
        [tableName, serverName]
      );

      const fields = fieldsResult.rows.map((row) => row.display_field_name);
      const unitsMap = {};
      fieldsResult.rows.forEach((row) => {
        unitsMap[row.display_field_name] = row.units || '';
      });

      // Write CSV headers (fields)
      const headers = ['Timestamp', ...fields, 'Latitude', 'Longitude'];
      writeStream.write(`${headers.join(',')}\n`);

      // Write units row
      const unitsRow = ['', ...fields.map((field) => unitsMap[field]), '', ''];
      writeStream.write(`${unitsRow.join(',')}\n`);

      // Start a query stream for fetching field values and details from the database
      const client = await pool.connect();
      try {
        const queryStream = new QueryStream(
          `
          SELECT
            TO_CHAR(fv.timestamp AT TIME ZONE 'Africa/Johannesburg', 'YYYY-MM-DD"T"HH24:MI:SS') AS timestamp,
            CASE
              WHEN fv.value ~ '^[0-9]+(\\.[0-9]*)?$' THEN
                (CAST((CAST(fv.value AS numeric) * CAST(st.multiplier AS numeric)) AS text))
              ELSE fv.value
            END AS field_value,
            st.display_field_name,
            st.latitude,
            st.longitude
          FROM field_values fv
          JOIN summary_table st ON fv.field_id = st.field_id
          WHERE st.display_table_name = $1
            AND st.display_server_name = $2
          ORDER BY fv.timestamp ASC, st.display_field_name ASC
          `,
          [tableName, serverName]
        );

        const stream = client.query(queryStream);
        let currentTimestamp = null;
        let currentEntry = null;

        stream.on('data', (row) => {
          const timestamp = row.timestamp;

          if (currentTimestamp === null) {
            currentTimestamp = timestamp;
            currentEntry = {
              timestamp,
              latitude: row.latitude,
              longitude: row.longitude,
              fields: {},
            };
          }

          if (timestamp !== currentTimestamp) {
            writeCurrentEntry2(writeStream, currentEntry, fields);
            currentTimestamp = timestamp;
            currentEntry = {
              timestamp,
              latitude: row.latitude,
              longitude: row.longitude,
              fields: {},
            };
          }

          currentEntry.fields[row.display_field_name] = row.field_value;
        });

        stream.on('end', () => {
          if (currentEntry) {
            writeCurrentEntry2(writeStream, currentEntry, fields);
          }
          writeStream.end(); // Close the write stream when done
          console.log(`CSV file generated: ${csvFilePath}`);
          client.release(); // Release client back to the pool
        });

        stream.on('error', (err) => {
          console.error('Error while streaming data:', err);
          client.release(); // Release client in case of error
        });

      } catch (err) {
        console.error('Error while generating CSV:', err);
        client.release(); // Release client in case of error
      }
    }

    console.log('All CSV files have been generated and stored on the server.');

  } catch (err) {
    console.error('Error while handling download request:', err);
  }
}

// Helper function to write the current entry to the CSV file
function writeCurrentEntry2(writeStream, currentEntry, fields) {
  const dataRow = [
    currentEntry.timestamp,
    ...fields.map((field) => currentEntry.fields[field] || ''),
    currentEntry.latitude,
    currentEntry.longitude,
  ].join(',') + '\n';

  writeStream.write(dataRow);
}






// Function to pre-generate CSV files for all tables
async function preGenerateCSVFiles() {
  try {
    const client = await pool.connect();

    // Retrieve all table IDs, table names, and server names
    const tablesResult = await client.query(`
      SELECT st.table_id, st.table_name, s.name AS server_name
      FROM server_tables st
      JOIN servers s ON st.server_id = s.server_id
    `);

    const tables = tablesResult.rows;

    // Directory where the CSV files will be saved (adjust path as needed)
    const csvDir = path.join(__dirname, 'csv_table_exports');
    if (!fs.existsSync(csvDir)) {
      fs.mkdirSync(csvDir); // Create the directory if it doesn't exist
      console.log(`Directory created at: ${csvDir}`);
    }

    // Loop through each table and generate a CSV for it
    for (const { table_id: tableId, table_name: tableName, server_name: serverName } of tables) {
      console.log(`Processing table: ${tableName}, site: ${serverName}`);

      // Fetch the date range (earliest and latest timestamp) for the current table
      const dateRangeResult = await client.query(`
        SELECT
          MIN(fv.timestamp) AS start_date,
          MAX(fv.timestamp) AS end_date
        FROM field_values fv
        JOIN server_table_fields sf ON fv.field_id = sf.field_id
        WHERE sf.table_id = $1
      `, [tableId]);

      const { start_date: startDate, end_date: endDate } = dateRangeResult.rows[0];

      if (!startDate || !endDate) {
        console.log(`No data found for table: ${tableName}, site: ${serverName}`);
        continue;
      }

      // Create the file name without date components
      const csvFileName = `${tableName}_${serverName}.csv`;
      const csvFilePath = path.join(csvDir, csvFileName);

      console.log(`Writing CSV to: ${csvFilePath}`);

      // Start the process to generate the CSV for the table
      await generateCSVForTable(client, tableId, tableName, serverName, startDate, endDate, csvFilePath);
    }

    client.release();
    console.log('Pre-generation of all CSV files completed successfully.');

  } catch (error) {
    console.error('Error during pre-generation of CSV files:', error);
  }
}

// Helper function to generate a CSV for a specific table
async function generateCSVForTable(client, tableId, tableName, serverName, startDate, endDate, csvFilePath) {
  try {
    const valuesQuery = `
      SELECT
        fv.timestamp,
        JSON_AGG(JSON_BUILD_OBJECT(
          'field_name', sf.field_name,
          'value', fv.value,
          'status', sf.status,
          'units', sf.units
        )) AS fields
      FROM field_values fv
      JOIN server_table_fields sf ON fv.field_id = sf.field_id
      WHERE sf.table_id = $1
      AND fv.timestamp BETWEEN $2 AND $3
      GROUP BY fv.timestamp
      ORDER BY fv.timestamp ASC;
    `;

    const query = new QueryStream(valuesQuery, [tableId, startDate, endDate]);
    const stream = client.query(query);

    // Open a writable stream to save the CSV file
    const writeStream = fs.createWriteStream(csvFilePath);

    let headersSet = false;
    let allFieldNames = new Set();
    let allFieldUnits = {};

    const csvTransform = new Transform({
      objectMode: true,
      transform(row, encoding, callback) {
        row.fields.forEach(field => {
          allFieldNames.add(field.field_name);
          allFieldUnits[field.field_name] = field.units;
        });

        const data = row.fields.reduce((acc, field) => {
          acc[field.field_name] = field.value;
          return acc;
        }, {});

        if (!headersSet) {
          headersSet = true;
          const sortedFieldNames = Array.from(allFieldNames).sort();
          const headerRow = ['timestamp', ...sortedFieldNames].join(',');
          const unitRow = ['', ...sortedFieldNames.map(field => allFieldUnits[field] || '')].join(',');
          this.push(headerRow + '\n' + unitRow + '\n');
        }

        const readableTimestamp = new Date(row.timestamp).toLocaleDateString('en-GB') + ' ' + new Date(row.timestamp).toLocaleTimeString('en-GB', {hour12: false});

        const sortedFieldNames = Array.from(allFieldNames).sort();
        const csvRow = [readableTimestamp, ...sortedFieldNames.map(field => data[field] || '')].join(',');
        callback(null, csvRow + '\n');
      }
    });

    // Stream query results into CSV
    stream.pipe(csvTransform).pipe(writeStream);

    return new Promise((resolve, reject) => {
      stream.on('end', () => {
        console.log(`CSV generated successfully for table: ${tableName}, site: ${serverName}`);
        resolve();
      });

      stream.on('error', (error) => {
        console.error(`Error generating CSV for table: ${tableName}, site: ${serverName}`, error);
        reject(error);
      });
    });
  } catch (error) {
    console.error(`Failed to generate CSV for table: ${tableName}, site: ${serverName}`, error);
    throw error;
  }
}








const advanceSummaryDateRangesFromAvailability = async () => {
  const lane = activeBackgroundLane && backgroundStatus[activeBackgroundLane]
    ? backgroundStatus[activeBackgroundLane]
    : null;

  if (lane) {
    lane.detail = 'Advancing public table date ranges from availability cache';
  }

  const {rows} = await pool.query(`
    WITH latest AS (
      SELECT
        display_server_name AS server_name,
        display_table_name AS table_name,
        MAX(date)::timestamptz AS latest_available_date
      FROM daily_data_availability
      WHERE available_records > 0
        AND display_server_name IS NOT NULL
        AND btrim(display_server_name) <> ''
        AND display_table_name IS NOT NULL
        AND btrim(display_table_name) <> ''
      GROUP BY display_server_name, display_table_name
    ),
    updated AS (
      UPDATE summary_data_date_ranges sdr
      SET
        start_date = COALESCE(sdr.start_date, latest.latest_available_date),
        end_date = GREATEST(COALESCE(sdr.end_date, latest.latest_available_date), latest.latest_available_date),
        updated_at = NOW()
      FROM latest
      WHERE sdr.server_name = latest.server_name
        AND sdr.table_name = latest.table_name
        AND latest.latest_available_date > COALESCE(sdr.end_date, '-infinity'::timestamptz)
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count
    FROM updated;
  `);

  const advancedCount = rows[0]?.count || 0;
  if (lane) {
    lane.detail = `Advanced ${advancedCount} public table date ranges from availability cache`;
  }
  console.log(`[AVAILABILITY] Advanced ${advancedCount} summary date ranges from availability cache.`);
  return advancedCount;
};

const calculateDailyDataAvailabilityWindow = async (monthsBack = 3) => {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - monthsBack);

  const startDateString = startDate.toISOString().split('T')[0];
  const endDateString = endDate.toISOString().split('T')[0];

  const query = `
    WITH bounds AS (
      SELECT
        $1::date AS start_date,
        $2::date AS end_date,
        ($1::date::timestamp AT TIME ZONE 'Africa/Johannesburg') AS start_ts,
        (($2::date + 1)::timestamp AT TIME ZONE 'Africa/Johannesburg') AS end_ts
    ),
    date_series AS (
      SELECT generate_series(start_date, end_date, interval '1 day')::date AS date
      FROM bounds
    ),
    relevant_fields AS (
      SELECT DISTINCT
        field_id,
        display_server_name,
        display_table_name,
        display_field_name,
        NULLIF(aggregation_type, '')::integer AS aggregation_minutes
      FROM summary_table
      WHERE field_id IS NOT NULL
        AND display_server_name IS NOT NULL
        AND display_table_name IS NOT NULL
        AND display_field_name IS NOT NULL
        AND aggregation_type ~ '^\\d+$'
        AND NULLIF(aggregation_type, '')::integer > 0
    ),
    field_counts AS (
      SELECT
        fv.field_id,
        (fv.timestamp AT TIME ZONE 'Africa/Johannesburg')::date AS date,
        COUNT(*)::bigint AS total_records,
        COUNT(*) FILTER (
          WHERE fv.value IS NOT NULL
            AND btrim(fv.value) <> ''
            AND upper(btrim(fv.value)) NOT IN ('NAN', 'NA', 'NULL', 'INF', 'INFINITY', '-INF', '-INFINITY')
        )::bigint AS available_records
      FROM field_values fv
      JOIN relevant_fields rf ON rf.field_id = fv.field_id
      CROSS JOIN bounds b
      WHERE fv.timestamp >= b.start_ts
        AND fv.timestamp < b.end_ts
      GROUP BY fv.field_id, (fv.timestamp AT TIME ZONE 'Africa/Johannesburg')::date
    ),
    availability AS (
      SELECT
        rf.display_server_name,
        rf.display_table_name,
        rf.display_field_name,
        ds.date,
        COALESCE(fc.total_records, 0)::bigint AS total_records,
        COALESCE(fc.available_records, 0)::bigint AS available_records,
        LEAST(
          100,
          COALESCE((COALESCE(fc.available_records, 0)::numeric / (1440.0 / rf.aggregation_minutes)) * 100, 0)
        ) AS availability_percentage
      FROM date_series ds
      CROSS JOIN relevant_fields rf
      LEFT JOIN field_counts fc
        ON fc.field_id = rf.field_id
       AND fc.date = ds.date
    )
    INSERT INTO daily_data_availability (
      display_server_name,
      display_table_name,
      display_field_name,
      date,
      total_records,
      available_records,
      availability_percentage,
      calculated_at
    )
    SELECT
      display_server_name,
      display_table_name,
      display_field_name,
      date,
      total_records,
      available_records,
      availability_percentage,
      NOW()
    FROM availability
    ON CONFLICT (display_server_name, display_table_name, display_field_name, date)
    DO UPDATE SET
      total_records = EXCLUDED.total_records,
      available_records = EXCLUDED.available_records,
      availability_percentage = EXCLUDED.availability_percentage,
      calculated_at = EXCLUDED.calculated_at;
  `;

  const client = await pool.connect();
  let committed = false;
  try {
    const lane = activeBackgroundLane && backgroundStatus[activeBackgroundLane]
      ? backgroundStatus[activeBackgroundLane]
      : null;
    if (lane) {
      lane.detail = `Refreshing availability from ${startDateString} to ${endDateString}`;
    }

    await client.query('BEGIN');
    await client.query('SET LOCAL jit = off');
    await client.query("SET LOCAL work_mem = '128MB'");

    const result = await client.query(query, [startDateString, endDateString]);
    if (lane) {
      lane.detail = `Availability rows touched: ${result.rowCount} (${startDateString} to ${endDateString})`;
    }

    await client.query(`
      INSERT INTO last_synced (id, last_data_availability_sync_time)
      VALUES (1, CURRENT_TIMESTAMP)
      ON CONFLICT (id)
      DO UPDATE SET
        last_data_availability_sync_time = EXCLUDED.last_data_availability_sync_time;
    `);

    await client.query('COMMIT');
    committed = true;
    console.log(`Daily data availability updated for ${startDateString} to ${endDateString}. Rows touched: ${result.rowCount}.`);
    await advanceSummaryDateRangesFromAvailability();
  } catch (error) {
    if (!committed) {
      await client.query('ROLLBACK');
    }
    throw error;
  } finally {
    client.release();
  }
};

const calculateDailyDataAvailability = async () => {
  try {
    const monthsBack = Math.max(1, Number(process.env.DAILY_AVAILABILITY_MONTHS || 1));
    await calculateDailyDataAvailabilityWindow(monthsBack);
  } catch (error) {
    console.error('Error calculating and storing daily data availability:', error);
    throw error;
  }
};


const calculateDailyDataAvailability25 = async () => {
  try {
    await calculateDailyDataAvailabilityWindow(60);
  } catch (error) {
    console.error('Error calculating and storing extended daily data availability:', error);
    throw error;
  }
};

const aggregateWeeklyDataAvailability = async () => {
    try {
        const endDate = new Date(); // Set the end date to today

        const {rows: weeks} = await pool.query(`
      SELECT DISTINCT date_trunc('week', date) as week_start_date
      FROM daily_data_availability
      WHERE date <= $1
    `, [endDate]);

        for (const {week_start_date} of weeks) {
            const {rows: aggregates} = await pool.query(`
        SELECT
          display_server_name,
          display_table_name,
          display_field_name,
          AVG(availability_percentage) as availability_percentage
        FROM daily_data_availability
        WHERE date_trunc('week', date) = $1
        GROUP BY display_server_name, display_table_name, display_field_name;
      `, [week_start_date]);

            // Process each aggregate sequentially
            for (const aggregate of aggregates) {
                const availabilityPercentage = aggregate.availability_percentage || 0;

                await pool.query(`
          INSERT INTO weekly_data_availability (display_server_name, display_table_name, display_field_name, week_start_date, availability_percentage)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (display_server_name, display_table_name, display_field_name, week_start_date)
          DO UPDATE SET availability_percentage = EXCLUDED.availability_percentage, calculated_at = current_timestamp;
        `, [aggregate.display_server_name, aggregate.display_table_name, aggregate.display_field_name, week_start_date, availabilityPercentage]);
            }

//    console.log(`Stored weekly availability for week starting ${week_start_date}`);
        }

        console.log('Weekly data availability aggregated and stored successfully.');
    } catch (error) {
        console.error('Error aggregating and storing weekly data availability:', error);
    }
};

const aggregateMonthlyDataAvailability = async () => {
    try {
        const endDate = new Date(); // Set the end date to today

        const {rows: months} = await pool.query(`
      SELECT DISTINCT date_trunc('month', date) as month_start_date
      FROM daily_data_availability
      WHERE date <= $1
    `, [endDate]);

        for (const {month_start_date} of months) {
            const {rows: aggregates} = await pool.query(`
        SELECT
          display_server_name,
          display_table_name,
          display_field_name,
          AVG(availability_percentage) as availability_percentage
        FROM daily_data_availability
        WHERE date_trunc('month', date) = $1
        GROUP BY display_server_name, display_table_name, display_field_name;
      `, [month_start_date]);

            // Process each aggregate sequentially
            for (const aggregate of aggregates) {
                const availabilityPercentage = aggregate.availability_percentage || 0;

                await pool.query(`
          INSERT INTO monthly_data_availability (display_server_name, display_table_name, display_field_name, month_start_date, availability_percentage)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (display_server_name, display_table_name, display_field_name, month_start_date)
          DO UPDATE SET availability_percentage = EXCLUDED.availability_percentage, calculated_at = current_timestamp;
        `, [aggregate.display_server_name, aggregate.display_table_name, aggregate.display_field_name, month_start_date, availabilityPercentage]);
            }

//    console.log(`Stored monthly availability for month starting ${month_start_date}`);
        }

        console.log('Monthly data availability aggregated and stored successfully.');
    } catch (error) {
        console.error('Error aggregating and storing monthly data availability:', error);
    }
};

const aggregateYearlyDataAvailability = async () => {
    try {
        const endDate = new Date(); // Set the end date to today

        const {rows: years} = await pool.query(`
      SELECT DISTINCT date_trunc('year', date) as year_start_date
      FROM daily_data_availability
      WHERE date <= $1
    `, [endDate]);

        for (const {year_start_date} of years) {
            const {rows: aggregates} = await pool.query(`
        SELECT
          display_server_name,
          display_table_name,
          display_field_name,
          AVG(availability_percentage) as availability_percentage
        FROM daily_data_availability
        WHERE date_trunc('year', date) = $1
        GROUP BY display_server_name, display_table_name, display_field_name;
      `, [year_start_date]);

            // Process each aggregate sequentially
            for (const aggregate of aggregates) {
                const availabilityPercentage = aggregate.availability_percentage || 0;

                await pool.query(`
          INSERT INTO yearly_data_availability (display_server_name, display_table_name, display_field_name, year_start_date, availability_percentage)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (display_server_name, display_table_name, display_field_name, year_start_date)
          DO UPDATE SET availability_percentage = EXCLUDED.availability_percentage, calculated_at = current_timestamp;
        `, [aggregate.display_server_name, aggregate.display_table_name, aggregate.display_field_name, year_start_date, availabilityPercentage]);
            }

//    console.log(`Stored yearly availability for year starting ${year_start_date}`);
        }

        console.log('Yearly data availability aggregated and stored successfully.');
    } catch (error) {
        console.error('Error aggregating and storing yearly data availability:', error);
    }
};

const truncateAvailabilityTables = async () => {
    try {
        await pool.query(`
      TRUNCATE TABLE weekly_data_availability, monthly_data_availability, yearly_data_availability;
    `);
        console.log('Availability tables truncated successfully.');
    } catch (error) {
        console.error('Error truncating availability tables:', error);
    }
};

// Endpoint to get the last synced date
app.get('/api/last-synced', async (req, res) => {
    try {
        const result = await pool.query('SELECT sync_time, last_data_availability_sync_time FROM last_synced WHERE id = 1;');

        if (result.rows.length > 0) {
            await res.json({
              lastSynced: result.rows[0].sync_time,
              lastDataAvailabilitySyncTime: result.rows[0].last_data_availability_sync_time
            });
        } else {
            res.status(404).json({error: 'No sync time found'});
        }
    } catch (error) {
        console.error('Error fetching last synced date:', error);
        res.status(500).json({error: 'Internal Server Error'});
    }
});

app.get('/api/rainfall-data', async (req, res) => {
    try {
        setPublicCache(res, 300);
        // Extract query parameters with default values
        const fieldName = req.query.field_name ? req.query.field_name.toLowerCase() : 'rain_tot';
        const tableName = req.query.table_name ? req.query.table_name.toLowerCase() : 'daily';

        const query = `
            WITH weekly_rainfall AS (
                SELECT
                    s.display_server_name,
                    s.display_table_name,
                    s.display_field_name,
                    fv.timestamp,
                    fv.value,
                    ROW_NUMBER() OVER (
                        PARTITION BY s.display_server_name, s.display_table_name
                        ORDER BY fv.timestamp DESC
                    ) AS rn
                FROM summary_table s
                JOIN field_values fv ON s.field_id = fv.field_id
                WHERE LOWER(s.display_field_name) = $1
                  AND LOWER(s.display_table_name) = $2
                  AND fv.timestamp >= NOW() - INTERVAL '30 days'
            )
            SELECT
                display_server_name,
                display_table_name,
                display_field_name,
                timestamp,
                value
            FROM weekly_rainfall;
        `;

        // Execute the query with parameters
        const {rows} = await pool.query(query, [fieldName, tableName]);
        await res.json(rows);
    } catch (err) {
        console.error('Error fetching rainfall data', err);
        res.status(500).json({error: 'Internal server error'});
    }
});

const updateDateRanges = async () => {
    const client = await pool.connect();
    try {
        console.log('Starting to update date ranges...');

        // Normal SQL query to insert or update date ranges
        const query = `
      INSERT INTO raw_data_date_ranges (table_id, start_date, end_date, updated_at)
      SELECT sf.table_id,
              MIN(fv.timestamp) AS start_date,
              MAX(fv.timestamp) AS end_date,
              NOW() AS updated_at
      FROM field_values fv
      JOIN server_table_fields sf ON fv.field_id = sf.field_id
      GROUP BY sf.table_id
      ON CONFLICT (table_id)
      DO UPDATE SET
          start_date = EXCLUDED.start_date,
          end_date = EXCLUDED.end_date,
          updated_at = EXCLUDED.updated_at;
    `;

        await client.query(query);
        console.log('Date ranges updated successfully.');
    } catch (error) {
        console.error('Failed to update date ranges:', error);
    } finally {
        client.release();
    }
};

const runCleanupAndSummaryUpdate = async () => {
  try {
    // Start a transaction to ensure atomic operations
    await pool.query('BEGIN');

    // Step 1: Delete invalid data
    const cleanupQuery = `
      WITH cleanup AS (
        SELECT
          NOW() + INTERVAL '1 day' AS tomorrow,
          '2010-01-01'::date AS year_2010
      )
      -- Delete records that are older than 2010 or in the future
      DELETE FROM field_values
      WHERE timestamp > (SELECT tomorrow FROM cleanup)
      OR timestamp < (SELECT year_2010 FROM cleanup)::timestamptz;
    `;
    await pool.query(cleanupQuery);
    console.log("Old and future records deleted.");

    // Commit the transaction
    await pool.query('COMMIT');
    console.log("Cleanup transaction committed successfully.");

  } catch (error) {
    // If there is an error, rollback the transaction
    await pool.query('ROLLBACK');
    console.error("Error during cleanup and summary update:", error);
  }
};

const updateSummaryDateRanges = async () => {
    const client = await pool.connect();
    try {
        console.log('Starting to update summary data date ranges...');
        const visibilityCondition = await getSummaryVisibilityCondition('st');

        // SQL query to insert or update date ranges with total count
        const query = `
      INSERT INTO summary_data_date_ranges (server_name, table_name, start_date, end_date, total_count, updated_at)
      SELECT
          btrim(st.display_server_name) AS server_name,
          btrim(st.display_table_name) AS table_name,
          MIN(fv.timestamp) AS start_date,
          MAX(fv.timestamp) AS end_date,
          COUNT(*) AS total_count,  -- Calculate total count of records
          NOW() AS updated_at
      FROM field_values fv
      JOIN summary_table st ON fv.field_id = st.field_id
      WHERE 1 = 1
        ${visibilityCondition}
        AND NULLIF(btrim(st.display_server_name), '') IS NOT NULL
        AND NULLIF(btrim(st.display_table_name), '') IS NOT NULL
      GROUP BY btrim(st.display_server_name), btrim(st.display_table_name)
      ON CONFLICT (server_name, table_name)
      DO UPDATE SET
          start_date = EXCLUDED.start_date,
          end_date = EXCLUDED.end_date,
          total_count = EXCLUDED.total_count,  -- Update total count
          updated_at = EXCLUDED.updated_at;
    `;

        await client.query(query);
        console.log('Summary data date ranges and total count updated successfully.');
    } catch (error) {
        console.error('Failed to update summary data date ranges and total count:', error);
    } finally {
        client.release();
    }
};

const cleanUpDailyDataAvailability = async () => {
  try {
    // Step 1: Retrieve distinct table names from summary_table
    const getDistinctTablesQuery = `
      SELECT DISTINCT display_table_name
      FROM summary_table
      ORDER BY display_table_name;
    `;
    const distinctTablesResult = await pool.query(getDistinctTablesQuery);

    const distinctTableNames = distinctTablesResult.rows.map(row => row.display_table_name);

    // Step 2: Retrieve all table names from daily_data_availability
    const getDailyDataTablesQuery = `
      SELECT DISTINCT display_table_name
      FROM daily_data_availability;
    `;
    const dailyDataTablesResult = await pool.query(getDailyDataTablesQuery);

    const dailyDataTableNames = dailyDataTablesResult.rows.map(row => row.display_table_name);

    // Step 3: Find table names in daily_data_availability that are not in summary_table
    const tablesToDelete = dailyDataTableNames.filter(name => !distinctTableNames.includes(name));

    if (tablesToDelete.length === 0) {
      console.log('No tables to delete.');
      return { message: 'No tables to delete.' };
    }

    // Step 4: Delete non-matching tables from daily_data_availability
    const deleteQuery = `
      DELETE FROM daily_data_availability
      WHERE display_table_name = ANY($1::text[]);
    `;
    await pool.query(deleteQuery, [tablesToDelete]);

    console.log(`Deleted ${tablesToDelete.length} table(s) from daily_data_availability.`);
    return { message: `Deleted ${tablesToDelete.length} table(s) from daily_data_availability.` };

  } catch (error) {
    console.error('Error cleaning up daily_data_availability:', error);
    throw new Error('Internal server error');
  }
};

// Example usage in an Express route (if needed):
app.delete('/api/clean-up-daily-data', async (req, res) => {
  try {
    const result = await cleanUpDailyDataAvailability();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Function to calculate one month ago date
function calculateOneMonthAgoDate() {
    const today = new Date();
    const oneMonthAgo = new Date(today.setMonth(today.getMonth() - 1));
    const year = oneMonthAgo.getFullYear();
    const month = String(oneMonthAgo.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
    const day = String(oneMonthAgo.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}




const syncFieldMetadata = async () => {
  try {
    // Insert new field names that are in summary_table but not in field_metadata_names
    await pool.query(`
      INSERT INTO field_metadata_names (display_field_name)
      SELECT DISTINCT display_field_name
      FROM summary_table
      WHERE display_field_name IS NOT NULL
      ON CONFLICT (display_field_name) DO NOTHING;
    `);

    // Insert new units that are in summary_table but not in field_metadata_units
    await pool.query(`
      INSERT INTO field_metadata_units (units)
      SELECT DISTINCT units
      FROM summary_table
      WHERE units IS NOT NULL
      ON CONFLICT (units) DO NOTHING;
    `);

    // Remove descriptions for field names that no longer exist in summary_table
    await pool.query(`
      UPDATE field_metadata_names
      SET description = NULL
      WHERE display_field_name NOT IN (
        SELECT DISTINCT display_field_name
        FROM summary_table
      );
    `);

    // Remove descriptions for units that no longer exist in summary_table
    await pool.query(`
      UPDATE field_metadata_units
      SET units_description = NULL
      WHERE units NOT IN (
        SELECT DISTINCT units
        FROM summary_table
      );
    `);

    // Delete field names that no longer exist in summary_table
    await pool.query(`
      DELETE FROM field_metadata_names
      WHERE display_field_name NOT IN (
        SELECT DISTINCT display_field_name
        FROM summary_table
      );
    `);

    // Delete units that no longer exist in summary_table
    await pool.query(`
      DELETE FROM field_metadata_units
      WHERE units NOT IN (
        SELECT DISTINCT units
        FROM summary_table
      );
    `);

    console.log("Field metadata synced successfully.");
  } catch (error) {
    console.error("Error syncing field metadata:", error);
  }
};



function calculatethreeMonthAgoDate() {
  const today = new Date();
  const oneMonthAgo = new Date(today.setMonth(today.getMonth() - 3));
  const year = oneMonthAgo.getFullYear();
  const month = String(oneMonthAgo.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
  const day = String(oneMonthAgo.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Function to calculate one year ago date
function calculateOneYearAgoDate() {
    const today = new Date();
    const oneYearAgo = new Date(today.setFullYear(today.getFullYear() - 1));
    const year = oneYearAgo.getFullYear();
    const month = String(oneYearAgo.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
    const day = String(oneYearAgo.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function calculateSixMonthsAgoDate() {
    const today = new Date();
    const sixMonthsAgo = new Date(today.setMonth(today.getMonth() - 6));
    const year = sixMonthsAgo.getFullYear();
    const month = String(sixMonthsAgo.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
    const day = String(sixMonthsAgo.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function calculateTwoDaysAgoDate() {
  const today = new Date();
  const twoDaysAgo = new Date(today.setDate(today.getDate() - 2)); // Subtract 2 days
  const year = twoDaysAgo.getFullYear();
  const month = String(twoDaysAgo.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
  const day = String(twoDaysAgo.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Calculate dates
const p1 = calculateOneMonthAgoDate(); // One month ago
const p2 = calculateSixMonthsAgoDate();  // six months ago
const p3 = calculatethreeMonthAgoDate();  // three months ago
const p4 = calculateTwoDaysAgoDate();  // 2 days ago





app.get('/api/field_metadata_names', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM field_metadata_names ORDER BY display_field_name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching variable descriptions:', error);
    res.status(500).send('Server error');
  }
});

app.get('/api/field_metadata_units', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM field_metadata_units ORDER BY units');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching unit descriptions:', error);
    res.status(500).send('Server error');
  }
});

app.post('/api/field_metadata_names/update', async (req, res) => {
  const { variableDescriptions } = req.body;

  if (!Array.isArray(variableDescriptions) || variableDescriptions.length === 0) {
    return res.status(400).json({message: 'Invalid or missing variableDescriptions data.'});
  }

  try {
    const result = await pool.query(`
      WITH input AS (
        SELECT *
        FROM jsonb_to_recordset($1::jsonb) AS x(
          display_field_name text,
          description text
        )
        WHERE display_field_name IS NOT NULL
      )
      UPDATE field_metadata_names fmn
      SET description = input.description
      FROM input
      WHERE fmn.display_field_name = input.display_field_name
    `, [JSON.stringify(variableDescriptions)]);
    res.json({message: 'Variable descriptions updated successfully', updated: result.rowCount});
  } catch (error) {
    console.error('Error updating variable descriptions:', error);
    res.status(500).send('Server error');
  }
});

app.post('/api/field_metadata_units/update', async (req, res) => {
  const { unitDescriptions } = req.body;

  if (!Array.isArray(unitDescriptions) || unitDescriptions.length === 0) {
    return res.status(400).json({message: 'Invalid or missing unitDescriptions data.'});
  }

  try {
    const result = await pool.query(`
      WITH input AS (
        SELECT *
        FROM jsonb_to_recordset($1::jsonb) AS x(
          units text,
          units_description text
        )
        WHERE units IS NOT NULL
      )
      UPDATE field_metadata_units fmu
      SET units_description = input.units_description
      FROM input
      WHERE fmu.units = input.units
    `, [JSON.stringify(unitDescriptions)]);
    res.json({message: 'Unit descriptions updated successfully', updated: result.rowCount});
  } catch (error) {
    console.error('Error updating unit descriptions:', error);
    res.status(500).send('Server error');
  }
});


//cleanUpDailyDataAvailability();

const scheduleJob = (time, jobName, fn) => {
  cron.schedule(time, async () => {
    try {
      console.log(`Starting ${jobName}...`);
      await fn();
      console.log(`${jobName} completed successfully.`);
    } catch (error) {
      console.error(`Error during ${jobName}:`, error);
    }
  });
};

// Function to refresh materialized view
const refreshMaterializedView = async () => {
  try {
    const result = await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY pre_aggregated_field_values');
    console.log('Materialized view refreshed successfully.');
  } catch (error) {
    console.error('Error refreshing materialized view:', error);
  }
};

// Function to refresh the materialized view for table values
const refreshTableMaterializedView = async () => {
  try {
    const result = await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY pre_aggregated_table_values');
    console.log('Materialized view "pre_aggregated_table_values" refreshed successfully.');
  } catch (error) {
    console.error('Error refreshing materialized view "pre_aggregated_table_values":', error);
  }
};



// Endpoint to get the latest interactions for each unique user
app.get('/api/interactions', async (req, res) => {
  if (!requireSuperUser(req, res)) return;

  try {
    const query = `
      SELECT
        ui.user_id,
        ui.id AS interaction_id,
        ui.interaction_type,
        ui.request_path,
        ui.timestamp,
        u.first_name,
        u.last_name
      FROM (
        SELECT
          *,
          ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY timestamp DESC) AS rn
        FROM
          user_interactions
        WHERE
          user_id IS NOT NULL
      ) ui
      LEFT JOIN
        users u ON ui.user_id = u.id
      WHERE
        ui.rn = 1
      ORDER BY
        ui.timestamp DESC,
        ui.user_id
      LIMIT 10;
    `;

    // Use `pool.query` here
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching interactions:', error);
    res.status(500).send('Server Error');
  }
});



// Helper function for retry with exponential backoff
// Transient error classifier
function isRetryableError(err) {
  // Postgres error codes
  var pg = err && err.code;
  if (pg === '40P01') return true;   // deadlock_detected
  if (pg === '40001') return true;   // serialization_failure
  if (pg === '55P03') return true;   // lock_not_available
  if (pg === '57014') return true;   // query_canceled (e.g., statement_timeout)
  if (pg === '53300') return true;   // too_many_connections

  // Node system/transport errors
  var sys = err && err.code;
  if (sys === 'ECONNRESET' || sys === 'ETIMEDOUT' || sys === 'EAI_AGAIN' ||
    sys === 'EHOSTUNREACH' || sys === 'ENETUNREACH' || sys === 'ENOTFOUND' ||
    sys === 'EPIPE') return true;

  // Axios/network
  var isAxios = err && err.isAxiosError;
  var status = isAxios && err.response ? err.response.status : null;

  // No response -> network issue
  if (isAxios && !err.response) return true;

  // Retry select HTTP statuses
  if (status === 408 || status === 425 || status === 429 ||
    status === 500 || status === 502 || status === 503 || status === 504) {
      return true;
    }

  return false;
}

// Exponential backoff with jitter and optional rollback hook
async function retryWithBackoff(fn, opts) {
  opts = opts || {};
  var retries = opts.retries != null ? opts.retries : 5;
  var baseDelayMs = opts.baseDelayMs != null ? opts.baseDelayMs : 500;
  var maxDelayMs  = opts.maxDelayMs  != null ? opts.maxDelayMs  : 10000;
  var factor      = opts.factor      != null ? opts.factor      : 2;
  var jitterFrac  = opts.jitterFrac  != null ? opts.jitterFrac  : 0.2; // +/-20%
  var onRetry     = typeof opts.onRetry === 'function' ? opts.onRetry : null;
  var rollbackFn  = typeof opts.rollback === 'function' ? opts.rollback : null;

  var attempt = 0;
  // We allow retries times; total attempts = retries + 1
  // (attempt counts starts at 0 for the first try)
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      var retryable = isRetryableError(err);
      if (attempt >= retries || !retryable) {
        throw err;
      }

      // If we are in an aborted transaction on a pinned client, caller can pass rollback()
      // Also useful if pool/client has 25P02 (in_failed_sql_transaction)
      if (rollbackFn) {
        try { await rollbackFn(err); } catch (e) { /* swallow */ }
      }

      attempt += 1;
      var delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(factor, attempt - 1));
      var jitter = Math.floor(delay * (Math.random() * 2 * jitterFrac - jitterFrac));
      var sleep = delay + jitter;

      if (onRetry) {
        try { onRetry({ attempt: attempt, retries: retries, delayMs: sleep, error: err }); } catch (e) {}
      } else {
        console.warn('Retrying after ' + sleep + 'ms... (' + attempt + '/' + retries + ') - ' +
          (err && err.message ? err.message : String(err)));
      }

      await new Promise(function (r) { setTimeout(r, sleep); });
    }
  }
}

// --- helper: decide whether to skip a server entirely (ASCII only) ---
function shouldSkipServer(s) {
  if (!s) return true;
  var name = typeof s.name === 'string' ? s.name : '';
  var uri  = typeof s.uri  === 'string' ? s.uri  : '';
  var type = typeof s.type === 'number' ? s.type : NaN;

  // Skip the special Statistics server
  if (name === '__Statistics__' || uri.slice(-15) === ':__Statistics__') return true;
  // Only ingest type 4 devices; skip anything else (e.g., type 5)
  if (type !== 4) return true;

  return false;
}



// Concurrency limiter
function limitConcurrency(limit) {
  let active = 0, q = [];
  const runNext = () => {
    if (active >= limit || !q.length) return;
    active++;
    const { fn, resolve, reject } = q.shift();
    Promise.resolve().then(fn)
    .then(v => resolve(v))
    .catch(reject)
    .finally(() => { active--; runNext(); });
  };
  return (fn) => new Promise((resolve, reject) => { q.push({ fn, resolve, reject }); runNext(); });
}

// Global axios defaults (keep-alive)
//const https = require('https');
//const agent = new https.Agent({ keepAlive: true, maxSockets: 50 });  reuse sockets, raise as needed
var REQUEST_TIMEOUT_MS = 120000;


// --- entry point: fetch servers, filter, and sync (ASCII quotes, no backticks) ---
async function syncServers(p1) {
  try {
    console.log('Starting server synchronization...');

    const res = await axios.get(
      'https://lognet.saeon.ac.za/?command=browsesymbols&uri=Server&format=json',
      { httpsAgent: agent, timeout: REQUEST_TIMEOUT_MS }
    );

    const allServers = Array.isArray(res && res.data && res.data.symbols) ? res.data.symbols : [];
    const servers = allServers.filter(function (s) { return !shouldSkipServer(s); });

    if (!servers.length) {
      console.log('No servers to sync (after filtering).');
      return;
    }

    console.log('Found ' + servers.length + ' servers to sync (filtered).');

    const run = limitConcurrency(3); // tune 2–4
    const results = await Promise.allSettled(
      servers.map(function (server) {
        return run(function () {
          return retryWithBackoff(function () { return syncSingleServer(server, p1); },
            { retries: 5, baseDelayMs: 500, maxDelayMs: 8000 });
        });
      })
    );

    const lastSyncedSql = [
      'INSERT INTO last_synced (id, sync_time)',
      'VALUES (1, CURRENT_TIMESTAMP)',
      'ON CONFLICT (id) DO UPDATE SET sync_time = EXCLUDED.sync_time;'
    ].join(' ');
    await pool.query(lastSyncedSql);

    const ok = results.filter(function (r) { return r.status === 'fulfilled'; }).length;
    const fail = results.length - ok;
    console.log('Sync completed successfully. ' + ok + ' ok, ' + fail + ' failed.');
  } catch (error) {
    console.error('Failed to sync servers:', error && error.message ? error.message : error);
  }
}

async function syncSingleServer(server, p1) {
  if (shouldSkipServer(server)) {
    console.log('Skipping server: ' + (server && server.name ? server.name : '(unknown)'));
    return;
  }

  const name = server.name;
  const uri = server.uri;
  const type = server.type;
  const is_enabled = server.is_enabled;
  const is_read_only = server.is_read_only;
  const can_expand = server.can_expand;

  console.log('Syncing server: ' + name);

  try {
    // Upsert server row (short statement; no outer transaction)
    const upsertServerSql = [
      'INSERT INTO servers (name, uri, type, is_enabled, is_read_only, can_expand)',
      'VALUES ($1, $2, $3, $4, $5, $6)',
      'ON CONFLICT (name) DO UPDATE SET',
      'uri = EXCLUDED.uri,',
      'type = EXCLUDED.type,',
      'is_enabled = EXCLUDED.is_enabled,',
      'is_read_only = EXCLUDED.is_read_only,',
      'can_expand = EXCLUDED.can_expand'
    ].join(' ');
    await pool.query(upsertServerSql, [name, uri, type, is_enabled, is_read_only, can_expand]);

    // Fetch server ID
    const serverResult = await pool.query('SELECT server_id FROM servers WHERE name = $1', [name]);
    const serverId = serverResult.rows && serverResult.rows[0] ? serverResult.rows[0].server_id : null;
    if (!serverId) throw new Error('Server ID not found for server: ' + name);

    // Tables: fetch + update inside one retry
    await retryWithBackoff(async function () {
      console.log('Fetching tables for server: ' + name);
      const tables = await fetchTablesForServer(uri);
      console.log('Found ' + tables.length + ' tables for server: ' + name);
      await updateTablesForServer(serverId, tables);
    }, { retries: 5, baseDelayMs: 500, maxDelayMs: 8000 });

    // Pull table ids
    const tableResult = await pool.query('SELECT table_id, uri FROM server_tables WHERE server_id = $1 AND status = $2', [serverId, 'active']);

    for (const table of tableResult.rows) {
      console.log('Fetching fields for table: ' + table.uri);

      // Fields: fetch + update together (retry as a unit)
      await retryWithBackoff(async function () {
        const fields = await fetchFieldsForTable(table.uri, p1);
        await updateFieldsForTable(table.table_id, fields);
      }, { retries: 5, baseDelayMs: 500, maxDelayMs: 8000 });

      // Values: limited parallelism per table
      const fieldResult = await pool.query(
        'SELECT field_id, uri FROM server_table_fields WHERE table_id = $1 AND status = $2',
        [table.table_id, 'active']
      );

      const vrun = limitConcurrency(4); // tune 4–6
      const tasks = fieldResult.rows.map(function (field) {
        return vrun(function () {
          return retryWithBackoff(async function () {
            const values = await fetchValuesForField(field.uri, p1);
            await updateValuesForField(field.field_id, values); // ensure this does bulk upsert
          }, { retries: 5, baseDelayMs: 500, maxDelayMs: 8000 });
        });
      });

      await Promise.allSettled(tasks);
    }

    console.log('Server sync complete: ' + name);
  } catch (error) {
    console.error('Failed to sync server ' + name + ':', error && error.message ? error.message : error);
    throw error;
  }
}


async function updateTablesForServer(serverId, tables) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Normalize input
    tables = Array.isArray(tables) ? tables : [];

    // If there are no tables for this server, mark all inactive (original behavior).
    // Because fetchTablesForServer now throws on API errors, an empty list should mean "genuinely none".
    if (tables.length === 0) {
      await client.query("UPDATE server_tables SET status = 'inactive' WHERE server_id = $1", [serverId]);
      await client.query('COMMIT');
      return;
    }

    // 1) Bulk UPSERT all current tables as 'active'
    var cols = ['server_id','table_name','uri','type','is_read_only','can_expand','status'];
    var values = [];
    var placeholders = [];
    var paramIndex = 1;

    for (var i = 0; i < tables.length; i++) {
      var t = tables[i];
      // Push values for this row
      values.push(
        serverId,
        t.name,
        t.uri,
        t.type,
        t.is_read_only,
        t.can_expand,
        'active'
      );
      // Build placeholders like ($1,$2,...)
      var rowPlaceholders = [];
      for (var j = 0; j < cols.length; j++) {
        rowPlaceholders.push('$' + (paramIndex++));
      }
      placeholders.push('(' + rowPlaceholders.join(',') + ')');
    }

    var upsertSql =
    'INSERT INTO server_tables (' + cols.join(',') + ') ' +
    'VALUES ' + placeholders.join(',') + ' ' +
    'ON CONFLICT (server_id, table_name) DO UPDATE SET ' +
    'uri = EXCLUDED.uri, ' +
    'type = EXCLUDED.type, ' +
    'is_read_only = EXCLUDED.is_read_only, ' +
    'can_expand = EXCLUDED.can_expand, ' +
    "status = EXCLUDED.status";

    await client.query(upsertSql, values);

    // 2) Deactivate any rows not in the current set
    var currentNames = tables.map(function (t) { return t.name; });
    await client.query(
      "UPDATE server_tables SET status = 'inactive' " +
      "WHERE server_id = $1 AND NOT (table_name = ANY($2))",
      [serverId, currentNames]
    );

    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e2) {}
    console.error('Failed to update tables for server:', serverId, err && err.message ? err.message : err);
    throw err;
  } finally {
    client.release();
  }
}

async function fetchTablesForServer(serverUri) {
  // Belt-and-braces: never touch __Statistics__ by URI
  if (isStatisticsUri(serverUri)) return [];

  try {
    var url = 'https://lognet.saeon.ac.za/?command=browsesymbols&uri=' +
    encodeURIComponent(serverUri) + '&format=json';

    var response = await axios.get(url, { httpsAgent: agent, timeout: REQUEST_TIMEOUT_MS });

    var symbols = (response && response.data && Array.isArray(response.data.symbols))
    ? response.data.symbols
    : null;

    if (!symbols) {
      throw new Error('Malformed response: missing symbols array');
    }

    // Only enabled tables (type === 6)
    var tables = symbols.filter(function (s) {
      return s && s.type === 6 && s.is_enabled === true;
    });

    return tables;
  } catch (err) {
    // IMPORTANT: throw so your outer retry/backoff handles it.
    // Returning [] could cause downstream code to deactivate everything.
    throw new Error('fetchTablesForServer failed for ' + serverUri + ': ' + (err.message || String(err)));
  }
}






// ---- fetchFieldsForTable (hardened) ----
async function fetchFieldsForTable(tableUri, p1) {
  // Belt-and-braces: never touch __Statistics__
  if (isStatisticsUri(tableUri)) return [];

  try {
    var symbolsUrl = 'https://lognet.saeon.ac.za/?command=browsesymbols&uri=' +
    encodeURIComponent(tableUri) + '&format=json';

    // p1=1 is enough to get schema in head.fields; keep most-recent
    var dataQueryUrl = 'https://lognet.saeon.ac.za/?command=dataquery&uri=' +
    encodeURIComponent(tableUri) + '&format=json&mode=most-recent&p1=1';

    var cfg = { httpsAgent: agent, timeout: REQUEST_TIMEOUT_MS };

    // Concurrent requests
    var results = await Promise.all([
      axios.get(symbolsUrl, cfg),
      axios.get(dataQueryUrl, cfg)
    ]);

    var symbolsResponse   = results[0];
    var dataQueryResponse = results[1];

    var symbols = (symbolsResponse &&
      symbolsResponse.data &&
      Array.isArray(symbolsResponse.data.symbols))
    ? symbolsResponse.data.symbols
    : null;

    if (!symbols) {
      throw new Error('Malformed response: missing symbols array');
    }

    // Base field list: enabled data fields (type === 8)
    var fields = symbols.filter(function (s) {
      return s && s.type === 8 && s.is_enabled === true;
    });

    // Enrich from head.fields if available
    var headFields = (dataQueryResponse &&
      dataQueryResponse.data &&
      dataQueryResponse.data.head &&
      Array.isArray(dataQueryResponse.data.head.fields))
    ? dataQueryResponse.data.head.fields
    : [];

    if (headFields.length) {
      var byName = {};
      for (var i = 0; i < headFields.length; i++) {
        var hf = headFields[i];
        byName[hf.name] = hf;
      }
      fields = fields.map(function (f) {
        var extra = byName[f.name];
        return {
          name: f.name,
          uri: f.uri,
          type: f.type,
          is_read_only: f.is_read_only,
          can_expand: f.can_expand,
          data_type:  extra ? (extra.type || null)    : null,
          units:      extra ? (extra.units || null)   : null,
          process:    extra ? (extra.process || null) : null,
          is_settable:extra ? (extra.settable || null): null
        };
      });
    }

    return fields;
  } catch (err) {
    // Prefer throwing so the caller can retry; avoids mass deactivation on transient errors
    throw new Error('fetchFieldsForTable failed for ' + tableUri + ': ' + (err && err.message ? err.message : String(err)));
  }
}

async function updateFieldsForTable(tableId, fields) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    fields = Array.isArray(fields) ? fields : [];

    // If truly no fields, mark all inactive (matches your original behavior).
    // If you prefer to skip deactivation on empty, replace this block with a simple COMMIT+return.
    if (fields.length === 0) {
      await client.query("UPDATE server_table_fields SET status='inactive' WHERE table_id=$1", [tableId]);
      await client.query('COMMIT');
      console.log('Updated fields for table ID: ' + tableId + ' (all inactive)');
      return;
    }

    // 1) Bulk UPSERT current fields as 'active'
    var cols = [
      'table_id','field_name','uri','type','is_read_only','can_expand','status',
      'data_type','units','process','is_settable'
    ];
    var values = [];
    var placeholders = [];
    var paramIndex = 1;

    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      values.push(
        tableId,
        f.name,
        f.uri,
        f.type,
        f.is_read_only,
        f.can_expand,
        'active',
        (f.data_type != null ? f.data_type : null),
        (f.units != null ? f.units : null),
        (f.process != null ? f.process : null),
        (f.is_settable != null ? f.is_settable : null)
      );
      var rowPh = [];
      for (var j = 0; j < cols.length; j++) rowPh.push('$' + (paramIndex++));
      placeholders.push('(' + rowPh.join(',') + ')');
    }

    var upsertSql =
    'INSERT INTO server_table_fields (' + cols.join(',') + ') ' +
    'VALUES ' + placeholders.join(',') + ' ' +
    'ON CONFLICT (table_id, field_name) DO UPDATE SET ' +
    'uri=EXCLUDED.uri, type=EXCLUDED.type, is_read_only=EXCLUDED.is_read_only, ' +
    'can_expand=EXCLUDED.can_expand, status=EXCLUDED.status, ' +
    'data_type=EXCLUDED.data_type, units=EXCLUDED.units, ' +
    'process=EXCLUDED.process, is_settable=EXCLUDED.is_settable';

    await client.query(upsertSql, values);

    // 2) Deactivate any rows not in the current set
    var currentNames = fields.map(function (f) { return f.name; });
    await client.query(
      "UPDATE server_table_fields SET status='inactive' " +
      "WHERE table_id=$1 AND NOT (field_name = ANY($2))",
      [tableId, currentNames]
    );

    await client.query('COMMIT');
    console.log('Updated fields for table ID: ' + tableId);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e2) {}
    console.error('Failed to update fields for table:', tableId, (err && err.message) ? err.message : err);
    throw err;
  } finally {
    client.release();
  }
}


// assumes REQUEST_TIMEOUT_MS and isStatisticsUri(u) are defined as before

async function fetchValuesForField(fieldUri, p1) {
  // Belt-and-braces: never touch __Statistics__
  if (isStatisticsUri(fieldUri)) return [];

  try {
    var url = 'https://lognet.saeon.ac.za/?command=dataquery&uri=' +
    encodeURIComponent(fieldUri) +
    '&format=json&mode=since-time&p1=' + encodeURIComponent(p1);

    var res = await axios.get(url, { httpsAgent: agent, timeout: REQUEST_TIMEOUT_MS });

    // Validate shape; fall back to empty array
    var data = (res && res.data && Array.isArray(res.data.data)) ? res.data.data : [];
    return data;
  } catch (err) {
    // Be tolerant for values: log & return []
    var status = err && err.response ? err.response.status : null;
    var code   = err && err.code ? err.code : null;
    console.error('Failed to fetch values for field:', fieldUri, 'status=', status, 'code=', code);
    return [];
  }
}

async function fetchValuesForTable(tableUri, p1) {
  if (isStatisticsUri(tableUri)) return {fields: [], data: []};

  try {
    const url = 'https://lognet.saeon.ac.za/?command=dataquery&uri=' +
      encodeURIComponent(tableUri) +
      '&format=json&mode=since-time&p1=' + encodeURIComponent(p1);

    const res = await axios.get(url, { httpsAgent: agent, timeout: TABLE_VALUE_REQUEST_TIMEOUT_MS });
    const fields = (res?.data?.head && Array.isArray(res.data.head.fields)) ? res.data.head.fields : [];
    const data = Array.isArray(res?.data?.data) ? res.data.data : [];
    return {fields, data};
  } catch (err) {
    const status = err && err.response ? err.response.status : null;
    const code = err && err.code ? err.code : null;
    const message = err && err.message ? err.message : String(err);
    console.error(
      'Failed to fetch values for table:',
      tableUri,
      'status=', status,
      'code=', code,
      'timeoutMs=', TABLE_VALUE_REQUEST_TIMEOUT_MS
    );
    const fetchError = new Error(
      'LoggerNet table fetch failed for ' + tableUri +
      ' status=' + status +
      ' code=' + code +
      ' timeoutMs=' + TABLE_VALUE_REQUEST_TIMEOUT_MS +
      ' message=' + message
    );
    fetchError.status = status;
    fetchError.code = code;
    fetchError.tableUri = tableUri;
    throw fetchError;
  }
}

// Tune these:
var BATCH_SIZE = 5000;          // try 5k–20k depending on memory/WAL
var REQUEST_TIMEOUT_MS = 300000;
var TABLE_VALUE_REQUEST_TIMEOUT_MS = Number(process.env.TABLE_VALUE_REQUEST_TIMEOUT_MS || 90000);
var BAD_FIELD_VALUE_STRINGS = new Set(['', 'NAN', 'NA', 'NULL', 'INF', 'INFINITY', '-INF', '-INFINITY']);

// Unique index needed for ON CONFLICT below (run once, outside app):
// CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_field_values_field_ts
//   ON public.field_values(field_id, "timestamp");
// And a lookup index you already added helps:
// CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_field_values_field_id
//   ON public.field_values(field_id);

// Normalize API payload -> rows: [fieldId, jsDate, numericValue]
//function normalizeValueRows(fieldId, values) {
//var out = [];
//if (!Array.isArray(values)) return out;
//
//for (var i = 0; i < values.length; i++) {
//  var r = values[i];
//  // Based on your example: r.time and r.vals[0]
//  var t = r && (r.time != null ? r.time : (r.timestamp || r.t));
//  var v = r && r.vals && r.vals.length ? r.vals[0] : (r.value != null ? r.value : null);
//  if (t == null || v == null) continue;
//
//  // Convert time to Date so pg can cast to timestamptz cleanly
//  var d = (t instanceof Date) ? t : new Date(t);
//  // Keep value numeric if your column is numeric; if TEXT, String(v) is fine
//  var val = typeof v === 'number' ? v : Number(v);
//  if (Number.isNaN(val)) continue;
//
//  out.push([fieldId, d, val]);
//}
//return out;
//}

function normalizeValueRows(fieldId, values) {
  const out = [];
  if (!Array.isArray(values)) return out;

  for (const r of values) {
    if (!r) continue;

    // Time: prefer r.time, fall back to r.timestamp / r.t
    const rawTime = (r.time != null) ? r.time : (r.timestamp || r.t);
    if (!rawTime) continue;

    // Normalize timestamp → JS Date
    const d = (rawTime instanceof Date) ? rawTime : new Date(rawTime);
    if (isNaN(d.getTime())) continue;

    // Pick value (single or array)
    const rawVal = (r.vals && r.vals.length) ? r.vals[0] : r.value;
    if (rawVal == null) continue;

    // --- VALUE NORMALIZATION ---
    let val;

    if (typeof rawVal === "number") {
      if (!Number.isFinite(rawVal)) continue;
      val = rawVal;                            // keep numbers as numbers
    } else if (typeof rawVal === "string") {
      val = rawVal.trim();                     // keep strings as strings
    } else if (rawVal instanceof Date) {
      val = rawVal.toISOString();              // Date → ISO string
    } else if (typeof rawVal === "boolean") {
      val = rawVal ? "true" : "false";
    } else {
      // fallback for arrays/objects → JSON stringify
      try {
        val = JSON.stringify(rawVal);
      } catch (e) {
        continue; // skip values that cannot be represented
      }
    }

    if (typeof val === "string" && BAD_FIELD_VALUE_STRINGS.has(val.trim().toUpperCase())) continue;

    out.push([fieldId, d, val]);
  }

  return out;
}

async function updateValuesForField(fieldId, values) {
  const rows = normalizeValueRows(fieldId, values);
  if (rows.length === 0) return;

  const client = await pool.connect();
  try {
    for (var start = 0; start < rows.length; start += BATCH_SIZE) {
      var slice = rows.slice(start, start + BATCH_SIZE);

      // Begin a short txn per batch (keeps locks/WAL windows small)
      await client.query('BEGIN');
      // Faster commits per batch (session-safe)
      await client.query('SET LOCAL synchronous_commit = OFF');

      // Build VALUES (...) list
      var placeholders = [];
      var params = [];
      var p = 1;
      for (var i = 0; i < slice.length; i++) {
        var r = slice[i]; // [fieldId, Date, value]
        params.push(r[0], r[1], r[2]);
        placeholders.push('($' + (p++) + ', $' + (p++) + ', $' + (p++) + ", 'active')");
      }

      // Note: quoting "timestamp" because it is a type name; safer as a column id
      var sql =
      'INSERT INTO public.field_values (field_id, "timestamp", value, status) ' +
      'VALUES ' + placeholders.join(',') + ' ' +
      'ON CONFLICT (field_id, "timestamp") DO UPDATE SET ' +
      "value = EXCLUDED.value, status = 'active' " +
      "WHERE field_values.value IS DISTINCT FROM EXCLUDED.value " +
      "OR field_values.status IS DISTINCT FROM 'active'";

      await client.query(sql, params);
      await client.query('COMMIT');
    }
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    throw err;
  } finally {
    client.release();
  }
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

function normalizeTableValueRows(dbFieldsByName, payload) {
  const out = [];
  const apiFields = Array.isArray(payload?.fields) ? payload.fields : [];
  const data = Array.isArray(payload?.data) ? payload.data : [];
  if (!apiFields.length || !data.length) return out;

  const fieldIdsByPosition = apiFields.map((field) => {
    const name = field?.name;
    return name && dbFieldsByName.has(name) ? dbFieldsByName.get(name) : null;
  });

  for (const row of data) {
    if (!row) continue;
    const rawTime = row.time != null ? row.time : (row.timestamp || row.t);
    if (!rawTime) continue;
    const timestamp = rawTime instanceof Date ? rawTime : new Date(rawTime);
    if (Number.isNaN(timestamp.getTime())) continue;

    const vals = Array.isArray(row.vals) ? row.vals : [];
    for (let i = 0; i < fieldIdsByPosition.length; i += 1) {
      const fieldId = fieldIdsByPosition[i];
      if (!fieldId) continue;
      const val = normalizeOneValue(vals[i]);
      if (val == null) continue;
      out.push([fieldId, timestamp, val]);
    }
  }

  return out;
}

async function bulkUpsertFieldValueRows(rows) {
  if (!rows.length) return 0;

  const client = await pool.connect();
  let inserted = 0;
  try {
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const slice = rows.slice(start, start + BATCH_SIZE);
      await client.query('BEGIN');
      await client.query('SET LOCAL synchronous_commit = OFF');

      const placeholders = [];
      const params = [];
      let p = 1;
      for (const row of slice) {
        params.push(row[0], row[1], row[2]);
        placeholders.push('($' + (p++) + ', $' + (p++) + ', $' + (p++) + ", 'active')");
      }

      const sql =
        'INSERT INTO public.field_values (field_id, "timestamp", value, status) ' +
        'VALUES ' + placeholders.join(',') + ' ' +
        'ON CONFLICT (field_id, "timestamp") DO UPDATE SET ' +
        "value = EXCLUDED.value, status = 'active' " +
        "WHERE field_values.value IS DISTINCT FROM EXCLUDED.value " +
        "OR field_values.status IS DISTINCT FROM 'active'";

      const result = await client.query(sql, params);
      inserted += result.rowCount || 0;
      await client.query('COMMIT');
    }
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    throw err;
  } finally {
    client.release();
  }

  return inserted;
}

async function syncActiveTableValues(p1) {
  console.log('[SYNC] Starting table-level incremental value sync from ' + p1);

  const {rows: tables} = await pool.query(`
    SELECT
      st.table_id,
      st.uri,
      st.table_name,
      s.name AS server_name
    FROM server_tables st
    JOIN servers s ON s.server_id = st.server_id
    WHERE st.status = 'active'
      AND st.uri IS NOT NULL
      AND st.uri NOT ILIKE '%__Statistics__%'
    ORDER BY s.name, st.table_name
  `);

  console.log('[SYNC] Found ' + tables.length + ' active tables for table-level value sync.');
  const run = limitConcurrency(Number(process.env.DAILY_TABLE_SYNC_CONCURRENCY || 3));
  let totalRowsTouched = 0;
  let tablesWithData = 0;
  let failedTables = 0;
  let completedTables = 0;
  const lane = activeBackgroundLane && backgroundStatus[activeBackgroundLane]
    ? backgroundStatus[activeBackgroundLane]
    : null;
  if (lane) {
    lane.subStepIndex = 0;
    lane.subStepTotal = tables.length;
    lane.detail = 'Checking table 0 of ' + tables.length;
    lane.tablesCheckedThisRun = 0;
    lane.tablesWithDataThisRun = 0;
    lane.tablesFailedThisRun = 0;
    lane.rowsTouchedThisRun = 0;
    lane.lastSuccessfulTable = null;
    lane.lastFailedTable = null;
  }

  const results = await Promise.allSettled(tables.map((table) => run(async () => {
    try {
      const {rows: fields} = await pool.query(
        `
          SELECT field_id, field_name
          FROM server_table_fields
          WHERE table_id = $1
            AND status = 'active'
            AND field_name IS NOT NULL
        `,
        [table.table_id]
      );

      if (!fields.length) return {table: table.table_name, rowsTouched: 0};

      const fieldsByName = new Map(fields.map((field) => [field.field_name, field.field_id]));
      const payload = await retryWithBackoff(
        () => fetchValuesForTable(table.uri, p1),
        { retries: 3, baseDelayMs: 500, maxDelayMs: 5000 }
      );
      const rows = normalizeTableValueRows(fieldsByName, payload);
      if (!rows.length) return {table: table.table_name, rowsTouched: 0};

      const rowsTouched = await bulkUpsertFieldValueRows(rows);
      totalRowsTouched += rowsTouched;
      if (rowsTouched > 0) {
        tablesWithData += 1;
        if (lane) lane.lastSuccessfulTable = table.server_name + ' / ' + table.table_name;
      }
      if (lane) {
        lane.rowsTouchedThisRun = totalRowsTouched;
        lane.tablesWithDataThisRun = tablesWithData;
      }
      return {table: table.table_name, rowsTouched};
    } catch (error) {
      failedTables += 1;
      if (lane) {
        lane.tablesFailedThisRun = failedTables;
        lane.lastFailedTable = table.server_name + ' / ' + table.table_name;
      }
      throw error;
    } finally {
      completedTables += 1;
      if (lane) {
        lane.subStepIndex = completedTables;
        lane.subStepTotal = tables.length;
        lane.tablesCheckedThisRun = completedTables;
        lane.detail = 'Checked table ' + completedTables + ' of ' + tables.length +
          '; rows touched ' + totalRowsTouched +
          '; with data ' + tablesWithData +
          '; failed ' + failedTables;
      }
      if (completedTables % 25 === 0 || completedTables === tables.length) {
        console.log('[SYNC] Checked table ' + completedTables + ' of ' + tables.length +
          '. Rows touched: ' + totalRowsTouched +
          ', tables with data: ' + tablesWithData +
          ', failed: ' + failedTables + '.');
      }
    }
  })));

  for (const result of results) {
    if (result.status === 'rejected') {
      console.error('[SYNC] Table-level value sync task failed:', result.reason?.message || result.reason);
    }
  }

  const ok = results.filter((result) => result.status === 'fulfilled').length;
  const fail = results.length - ok;
  const maxFailureRate = Math.min(1, Math.max(0, Number(process.env.DAILY_TABLE_SYNC_MAX_FAILURE_RATE || 0.5)));
  const failureRate = results.length ? fail / results.length : 0;

  if (!results.length || ok === 0 || failureRate > maxFailureRate) {
    throw new Error(
      '[SYNC] Table-level incremental value sync aborted before marking last_synced. ' +
      'Successful tables: ' + ok + '/' + results.length +
      ', failed tables: ' + fail +
      ', rows touched: ' + totalRowsTouched +
      ', failure rate: ' + Math.round(failureRate * 100) + '%'
    );
  }

  await pool.query(`
    INSERT INTO last_synced (id, sync_time)
    VALUES (1, CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO UPDATE SET sync_time = EXCLUDED.sync_time;
  `);

  console.log('[SYNC] Table-level incremental value sync complete. Tables with data: ' +
    tablesWithData + '/' + tables.length + ', rows touched: ' + totalRowsTouched +
    ', failed tables: ' + fail + '/' + results.length + '.');
}

//// Helper once at top (keeps logs tidy and ensures each task awaits)
//const step = async (label, fn) => {
//const t0 = Date.now();
//console.log(`[CRON] → ${label}…`);
//await Promise.resolve().then(fn);
//console.log(`[CRON] ✓ ${label} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
//};
//
//// ==============================
//// Mon–Sat nightly (22:00) — p1
//// ==============================
//scheduleJob('0 22 * * 1-6', 'Nightly pipeline (Mon–Sat, 22:00)', async () => {
//console.log('[CRON] === Nightly pipeline (Mon–Sat) starting ===');
//
//// Server sync first so later steps see fresh data (month-ago set)
//await step('Sync servers (p1)',                () => syncServers(p1));
//await step('Generate CSV files',               generateCSVFiles);
//await step('Pre-generate CSV files',           preGenerateCSVFiles);
//await step('Pre-generate CSV files',           populateUnifiedMappingTable);
//await step('Populate summary table',           populateSummaryTable);
//await step('Cleanup + summary update',         runCleanupAndSummaryUpdate);
//await step('Update units mapping',             updateUnitsMapping);
//await step('Update site mapping',              updateSiteMapping);
//await step('Calculate daily data availability', calculateDailyDataAvailability);
//await step('Daily data availability cleanup',  cleanUpDailyDataAvailability);
//await step('Sync field metadata',              syncFieldMetadata);
//await step('Refresh live table MV',            refreshTableMaterializedView);
//await step('Refresh data MV',                  refreshMaterializedView);
//await step('Update date ranges',               updateDateRanges);
//await step('Update summary date ranges',       updateSummaryDateRanges);
//// update the counts
//await step('Update field values summary',      updateFieldValuesSummary);
//
//console.log('[CRON] === Nightly pipeline (Mon–Sat) finished ===');
//});
//
//// ==============================
//// Sunday extended (20:00) — p2
//// ==============================
//scheduleJob('0 20 * * 0', 'Extended pipeline (Sun, 20:00)', async () => {
//console.log('[CRON] === Extended pipeline (Sunday) starting ===');
//
//// Server sync first so later steps see fresh data (month-ago set)
//await step('Sync servers (p1)',                () => syncServers(p2));
//await step('Generate CSV files',               generateCSVFiles);
//await step('Pre-generate CSV files',           preGenerateCSVFiles);
//await step('populate unified mapping table',           populateUnifiedMappingTable);
//await step('Populate summary table',           populateSummaryTable);
//await step('Cleanup + summary update',         runCleanupAndSummaryUpdate);
//await step('Update units mapping',             updateUnitsMapping);
//await step('Update site mapping',              updateSiteMapping);
//await step('Calculate daily data availability', calculateDailyDataAvailability);
//await step('Daily data availability cleanup',  cleanUpDailyDataAvailability);
//await step('Sync field metadata',              syncFieldMetadata);
//await step('Refresh live table MV',            refreshTableMaterializedView);
//await step('Refresh data MV',                  refreshMaterializedView);
//await step('Update date ranges',               updateDateRanges);
//await step('Update summary date ranges',       updateSummaryDateRanges);
//// update the counts
//await step('Update field values summary',      updateFieldValuesSummary);
//
//console.log('[CRON] === Extended pipeline (Sunday) finished ===');
//});



// =================== Common helpers ===================

const sleep = ms => new Promise(r => setTimeout(r, ms));
const AFRICA_JHB_TZ = 'Africa/Johannesburg';

// Unified step logger
const step = async (label, fn, index = null, total = null) => {
  const t0 = Date.now();
  const lane = activeBackgroundLane && backgroundStatus[activeBackgroundLane]
    ? backgroundStatus[activeBackgroundLane]
    : null;
  if (lane) {
    lane.currentStep = label;
    lane.detail = null;
    lane.subStepIndex = 0;
    lane.subStepTotal = 0;
    if (Number.isInteger(index)) lane.currentStepIndex = index;
    if (Number.isInteger(total)) lane.totalSteps = total;
  }
  console.log(`[PIPE] → ${label}…`);
  try {
    await Promise.resolve().then(fn);
    if (lane) lane.lastCompletedStep = label;
    console.log(`[PIPE] ✓ ${label} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } finally {
    if (lane && lane.currentStep === label) lane.currentStep = null;
  }
};

async function runTaskList(tasks) {
  const total = tasks.length;
  const lane = activeBackgroundLane && backgroundStatus[activeBackgroundLane]
    ? backgroundStatus[activeBackgroundLane]
    : null;
  if (lane) {
    lane.currentStepIndex = 0;
    lane.totalSteps = total;
    lane.lastCompletedStep = null;
  }

  for (const [index, task] of tasks.entries()) {
    await step(task.label, task.run, index + 1, total);
  }
}

// Optional small pool if you ever want to parallelize read tasks
function limitConcurrency(limit) {
  let active = 0, q = [];
  const runNext = () => {
    if (active >= limit || q.length === 0) return;
    active++;
    const { fn, resolve, reject } = q.shift();
    Promise.resolve().then(fn)
    .then(v => resolve(v))
    .catch(reject)
    .finally(() => { active--; runNext(); });
  };
  return fn => new Promise((resolve, reject) => { q.push({ fn, resolve, reject }); runNext(); });
}

// Hold a Postgres advisory lock for the entire run using a dedicated client
async function withAdvisoryLock(lockA, lockB, run) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1,$2) AS got', [lockA, lockB]);
    if (!rows[0].got) {
      console.log(`[LOCK] Another writer cycle is running; skipping this iteration (keys ${lockA},${lockB}).`);
      return;
    }
    console.log(`[LOCK] Writer lock acquired (${lockA},${lockB})`);
    return await run();
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1,$2)', [lockA, lockB]);
      console.log(`[LOCK] Writer lock released (${lockA},${lockB})`);
    } catch (_) {}
    client.release();
  }
}

// Time helpers (with Africa/Johannesburg timezone)
function tzPartsNow(tz = AFRICA_JHB_TZ) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short'
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map(p => [p.type, p.value]));
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,     // YYYY-MM-DD
    weekday: parts.weekday,                               // Mon/Tue/.../Sun (short)
    hour: parseInt(parts.hour, 10),
    minute: parseInt(parts.minute, 10)
  };
}

// Fallback windows if p1/p2 aren’t defined elsewhere in your code
function calculateTwoWeeksAgoDate() {
  const d = new Date();
  d.setDate(d.getDate() - 14);
  const yyyy = d.getFullYear(), mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function formatYmd(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
async function getIncrementalSyncStartDate() {
  const fallback = calculateTwoWeeksAgoDate();
  const overlapDays = Math.max(1, Number(process.env.DAILY_SYNC_OVERLAP_DAYS || 1));
  const maxLookbackDays = Math.max(overlapDays, Number(process.env.DAILY_SYNC_MAX_LOOKBACK_DAYS || 14));

  try {
    const {rows} = await pool.query('SELECT sync_time FROM last_synced WHERE id = 1');
    const lastSync = rows[0]?.sync_time ? new Date(rows[0].sync_time) : null;
    if (!lastSync || Number.isNaN(lastSync.getTime())) return fallback;

    const start = new Date(lastSync);
    start.setDate(start.getDate() - overlapDays);

    const floor = new Date();
    floor.setDate(floor.getDate() - maxLookbackDays);

    return formatYmd(start < floor ? floor : start);
  } catch (error) {
    console.warn('[SYNC] Could not read last sync time; using fallback window:', error.message || error);
    return fallback;
  }
}
function calculateOneMonthAgoDate() {
  const d = new Date();
  d.setMonth(d.getMonth() - 2);
  const yyyy = d.getFullYear(), mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Resolve p1/p2 from your existing globals if present, else fallback
function getP1() { return (typeof p1 !== 'undefined' ? p1 : calculateTwoWeeksAgoDate()); }
function getP2() { return (typeof p2 !== 'undefined' ? p2 : calculateOneMonthAgoDate()); }

// =================== Task lanes ===================

// READ-ONLY lane (safe to run while writers operate)
async function runMonthlyCsvCache() {
  const monthsBack = Math.max(1, Math.min(Number(process.env.CSV_CACHE_MONTHS_BACK || 2), 24));
  const scriptPath = path.join(__dirname, 'scripts', 'generate-monthly-csv-cache.js');

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, `--months-back=${monthsBack}`], {
      cwd: __dirname,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => {
      process.stdout.write('[CSV] ' + chunk.toString());
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write('[CSV] ' + chunk.toString());
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Monthly CSV cache exited with code ${code}`));
      }
    });
  });
}

async function runReaderTasks() {
  await runTaskList([
    { label: 'Generate monthly CSV cache', run: runMonthlyCsvCache },
  ]);
  // If you add more read-only tasks later:
  // const run = limitConcurrency(2);
  // await Promise.allSettled([ () => step('A', A), () => step('B', B) ].map(fn => run(fn)));
}

// WRITER lane (DB mutations) — normal daily run
async function runWriterTasksDaily() {
  const p = await getIncrementalSyncStartDate();
  await runTaskList([
    { label: `Sync active table values since ${p}`, run: () => syncActiveTableValues(p) },
    { label: 'Populate unified mapping table', run: populateUnifiedMappingTable },
    { label: 'Update units mapping', run: updateUnitsMapping },
    { label: 'Update site mapping', run: updateSiteMapping },
    { label: 'Populate summary table', run: populateSummaryTable },
    { label: 'Cleanup invalid timestamps', run: runCleanupAndSummaryUpdate },
    { label: 'Calculate daily data availability', run: calculateDailyDataAvailability },
    { label: 'Daily data availability cleanup', run: cleanUpDailyDataAvailability },
    { label: 'Refresh live table MV', run: refreshTableMaterializedView },
    { label: 'Refresh data MV', run: refreshMaterializedView },
    { label: 'Update date ranges', run: updateDateRanges },
    { label: 'Update summary date ranges', run: updateSummaryDateRanges },
    { label: 'Update field values summary', run: updateFieldValuesSummary },
  ]);
}

// WRITER lane — Sunday extended run (p2)
async function runWriterTasksExtended() {
  const p = getP2(); // month window by default, or your existing p2
  await runTaskList([
    { label: 'Sync servers (extended, p2)', run: () => syncServers(p) },
    { label: 'Populate unified mapping table', run: populateUnifiedMappingTable },
    { label: 'Update units mapping', run: updateUnitsMapping },
    { label: 'Update site mapping', run: updateSiteMapping },
    { label: 'Sync field metadata', run: syncFieldMetadata },
    { label: 'Populate summary table', run: populateSummaryTable },
    { label: 'Cleanup invalid timestamps', run: runCleanupAndSummaryUpdate },
    { label: 'Calculate daily data availability', run: calculateDailyDataAvailability },
    { label: 'Daily data availability cleanup', run: cleanUpDailyDataAvailability },
    { label: 'Refresh live table MV', run: refreshTableMaterializedView },
    { label: 'Refresh data MV', run: refreshMaterializedView },
    { label: 'Update date ranges', run: updateDateRanges },
    { label: 'Update summary date ranges', run: updateSummaryDateRanges },
    { label: 'Update field values summary', run: updateFieldValuesSummary },
  ]);
}

async function runAvailabilityTasks() {
  await runTaskList([
    { label: 'Calculate daily data availability', run: calculateDailyDataAvailability },
    { label: 'Daily data availability cleanup', run: cleanUpDailyDataAvailability },
    { label: 'Update summary date ranges', run: updateSummaryDateRanges },
    { label: 'Update field values summary', run: updateFieldValuesSummary },
  ]);
}

// =================== Scheduled background jobs (SAST) ===================

const BACKGROUND_CRON_OPTIONS = { timezone: AFRICA_JHB_TZ };
const FAST_SYNC_WEEKDAY_HOURS = [6, 14, 22];
const FAST_SYNC_SUNDAY_HOURS = [6, 14];

// Reentrancy guards (no overlap within each lane in-process)
let readerRunning = false;
let writerRunning = false;

// Stable lock keys for writer lane (avoid overlap across PM2 processes/hosts)
const WRITER_LOCK_A = 42;
const WRITER_LOCK_B = 999;



// Track Sunday extended so it runs ONCE per Sunday after 20:00 (Africa/Johannesburg)
let lastExtendedRunYmd = null;

function nextSastOccurrenceIso({ hour, minute = 0, daysOfWeek = null }) {
  const nowUtc = new Date();
  const nowSastMs = nowUtc.getTime() + 2 * 60 * 60 * 1000;
  const nowSast = new Date(nowSastMs);
  const startDaySastMs = Date.UTC(
    nowSast.getUTCFullYear(),
    nowSast.getUTCMonth(),
    nowSast.getUTCDate()
  );

  for (let offset = 0; offset <= 14; offset++) {
    const candidateSastMs = startDaySastMs + offset * 24 * 60 * 60 * 1000 + hour * 60 * 60 * 1000 + minute * 60 * 1000;
    const candidateSast = new Date(candidateSastMs);
    const day = candidateSast.getUTCDay(); // 0 Sunday ... 6 Saturday, evaluated in SAST wall time
    if (daysOfWeek && !daysOfWeek.includes(day)) continue;
    const candidateUtcMs = candidateSastMs - 2 * 60 * 60 * 1000;
    if (candidateUtcMs > nowUtc.getTime()) return new Date(candidateUtcMs).toISOString();
  }

  return null;
}

function refreshScheduledNextRuns() {
  backgroundStatus.reader.nextRunAt = nextSastOccurrenceIso({ hour: 0, minute: 15 });
  const nextWeekdayFast = FAST_SYNC_WEEKDAY_HOURS.map((hour) =>
    nextSastOccurrenceIso({ hour, minute: 0, daysOfWeek: [1, 2, 3, 4, 5, 6] })
  );
  const nextSundayFast = FAST_SYNC_SUNDAY_HOURS.map((hour) =>
    nextSastOccurrenceIso({ hour, minute: 0, daysOfWeek: [0] })
  );
  const nextExtended = nextSastOccurrenceIso({ hour: 20, minute: 0, daysOfWeek: [0] });
  backgroundStatus.writer.nextRunAt = [...nextWeekdayFast, ...nextSundayFast, nextExtended].filter(Boolean).sort()[0] || null;
}

async function runScheduledReaderJob() {
  const start = Date.now();
  if (readerRunning) {
    console.log('[READER] Previous scheduled job still running; skipping.');
    return;
  }

  readerRunning = true;
  Object.assign(backgroundStatus.reader, {
    running: true,
    currentStep: 'Starting CSV preparation',
    currentStepIndex: 0,
    totalSteps: 1,
    lastCompletedStep: null,
    lastStartedAt: new Date(start).toISOString(),
    lastFinishedAt: null,
    lastError: null,
    lastDurationSeconds: null,
  });

  try {
    console.log('[READER] === scheduled CSV preparation start ===');
    activeBackgroundLane = 'reader';
    await runReaderTasks();
    console.log('[READER] === scheduled CSV preparation end ===');
  } catch (err) {
    backgroundStatus.reader.lastError = err?.message || String(err);
    console.error('[READER] scheduled job failed:', err);
  } finally {
    activeBackgroundLane = null;
    readerRunning = false;
    backgroundStatus.reader.running = false;
    backgroundStatus.reader.currentStep = null;
    backgroundStatus.reader.currentStepIndex = backgroundStatus.reader.lastError ? backgroundStatus.reader.currentStepIndex : backgroundStatus.reader.totalSteps;
    backgroundStatus.reader.lastFinishedAt = new Date().toISOString();
    backgroundStatus.reader.lastDurationSeconds = Number(((Date.now() - start) / 1000).toFixed(1));
    refreshScheduledNextRuns();
  }
}

async function runScheduledWriterJob({ extended = false } = {}) {
  const start = Date.now();
  if (writerRunning) {
    console.log('[WRITER] Previous scheduled job still running; skipping.');
    return;
  }

  writerRunning = true;
  Object.assign(backgroundStatus.writer, {
    running: true,
    currentStep: extended ? 'Starting Sunday extended sync' : 'Starting nightly sync',
    currentStepIndex: 0,
    totalSteps: extended ? 14 : 13,
    lastCompletedStep: null,
    lastStartedAt: new Date(start).toISOString(),
    lastFinishedAt: null,
    lastError: null,
    lastDurationSeconds: null,
  });

  try {
    const now = tzPartsNow(AFRICA_JHB_TZ);
    console.log('[WRITER] === scheduled iteration start ===',
      `(local ${AFRICA_JHB_TZ}: ${now.weekday} ${now.ymd} ${String(now.hour).padStart(2,'0')}:${String(now.minute).padStart(2,'0')})`);

    await withAdvisoryLock(WRITER_LOCK_A, WRITER_LOCK_B, async () => {
      activeBackgroundLane = 'writer';
      if (extended) {
        await runWriterTasksExtended();
        lastExtendedRunYmd = now.ymd;
      } else {
        await runWriterTasksDaily();
      }
    });

    console.log('[WRITER] === scheduled iteration end ===');
  } catch (err) {
    backgroundStatus.writer.lastError = err?.message || String(err);
    console.error('[WRITER] scheduled job failed:', err);
  } finally {
    activeBackgroundLane = null;
    writerRunning = false;
    backgroundStatus.writer.running = false;
    backgroundStatus.writer.currentStep = null;
    backgroundStatus.writer.currentStepIndex = backgroundStatus.writer.lastError ? backgroundStatus.writer.currentStepIndex : backgroundStatus.writer.totalSteps;
    backgroundStatus.writer.lastFinishedAt = new Date().toISOString();
    backgroundStatus.writer.lastDurationSeconds = Number(((Date.now() - start) / 1000).toFixed(1));
    refreshScheduledNextRuns();
  }
}

async function runManualAvailabilityJob() {
  const start = Date.now();
  if (writerRunning) {
    console.log('[AVAILABILITY] Writer lane is already running; skipping manual availability refresh.');
    return false;
  }

  writerRunning = true;
  Object.assign(backgroundStatus.writer, {
    running: true,
    currentStep: 'Starting availability refresh',
    currentStepIndex: 0,
    totalSteps: 4,
    lastCompletedStep: null,
    lastStartedAt: new Date(start).toISOString(),
    lastFinishedAt: null,
    lastError: null,
    lastDurationSeconds: null,
  });

  try {
    console.log('[AVAILABILITY] === manual availability refresh start ===');
    await withAdvisoryLock(WRITER_LOCK_A, WRITER_LOCK_B, async () => {
      activeBackgroundLane = 'writer';
      await runAvailabilityTasks();
    });
    console.log('[AVAILABILITY] === manual availability refresh end ===');
  } catch (err) {
    backgroundStatus.writer.lastError = err?.message || String(err);
    console.error('[AVAILABILITY] manual refresh failed:', err);
  } finally {
    activeBackgroundLane = null;
    writerRunning = false;
    backgroundStatus.writer.running = false;
    backgroundStatus.writer.currentStep = null;
    backgroundStatus.writer.currentStepIndex = backgroundStatus.writer.lastError ? backgroundStatus.writer.currentStepIndex : backgroundStatus.writer.totalSteps;
    backgroundStatus.writer.lastFinishedAt = new Date().toISOString();
    backgroundStatus.writer.lastDurationSeconds = Number(((Date.now() - start) / 1000).toFixed(1));
    refreshScheduledNextRuns();
  }

  return true;
}

app.post('/api/background/run-reader', async (req, res) => {
  if (!requireTechnician(req, res)) return;
  if (readerRunning) {
    return res.status(409).json({message: 'CSV preparation is already running.', status: backgroundStatus.reader});
  }

  runScheduledReaderJob().catch((error) => {
    console.error('[READER] manual trigger failed:', error);
  });

  res.status(202).json({
    message: 'CSV preparation started.',
    status: backgroundStatus.reader,
  });
});

app.post('/api/background/run-writer', async (req, res) => {
  if (!requireTechnician(req, res)) return;
  if (writerRunning) {
    return res.status(409).json({message: 'Data sync is already running.', status: backgroundStatus.writer});
  }

  const extended = req.query.extended === 'true' || req.body?.extended === true;
  runScheduledWriterJob({extended}).catch((error) => {
    console.error('[WRITER] manual trigger failed:', error);
  });

  res.status(202).json({
    message: extended ? 'Extended data sync started.' : 'Daily data sync started.',
    status: backgroundStatus.writer,
  });
});

app.post('/api/background/run-availability', async (req, res) => {
  if (!requireTechnician(req, res)) return;
  if (writerRunning) {
    return res.status(409).json({message: 'A writer or availability refresh is already running.', status: backgroundStatus.writer});
  }

  runManualAvailabilityJob().catch((error) => {
    console.error('[AVAILABILITY] manual trigger failed:', error);
  });

  res.status(202).json({
    message: 'Data availability refresh started.',
    status: backgroundStatus.writer,
  });
});

// Schedule background work. Keep ENABLE_BACKGROUND_JOBS=false for restores/maintenance only.
ensureApiRoles().catch((error) => {
  console.error('Error ensuring API roles:', error.message);
});

refreshScheduledNextRuns();
if (backgroundJobsEnabled) {
  cron.schedule('15 0 * * *', runScheduledReaderJob, BACKGROUND_CRON_OPTIONS);
  cron.schedule('0 6,14,22 * * 1-6', () => runScheduledWriterJob({ extended: false }), BACKGROUND_CRON_OPTIONS);
  cron.schedule('0 6,14 * * 0', () => runScheduledWriterJob({ extended: false }), BACKGROUND_CRON_OPTIONS);
  cron.schedule('0 20 * * 0', () => runScheduledWriterJob({ extended: true }), BACKGROUND_CRON_OPTIONS);
  console.log('[BACKGROUND] Enabled. Scheduled CSV exports at 00:15 SAST, fast sync Mon-Sat 06:00/14:00/22:00 SAST, Sunday fast sync 06:00/14:00 SAST, Sunday extended sync 20:00 SAST.');
} else {
  console.log('[BACKGROUND] Disabled. Set ENABLE_BACKGROUND_JOBS=true to run scheduled reader/writer jobs.');
}

//calculateDailyDataAvailability25()
//syncServers(p1)


app.listen(port, '0.0.0.0', () => {
    console.log(`Server started on http://0.0.0.0:${port}`);
});
//app.setTimeout(0);  Disable timeout or set a higher value like 5 minutes
