require("dotenv").config();
const axios = require("axios");
const https = require("https");
const express = require("express");
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
//const { Pool } = require("pg");
const bodyParser = require("body-parser");
const cors = require("cors");
//const session = require("express-session");
const bcrypt = require("bcrypt");
const fs = require("fs");
const path = require("path");

const agent = new https.Agent({
  rejectUnauthorized: false, // WARNING: This disables SSL verification
});

const app = express();
app.set('trust proxy', true);  // Trust the X-Forwarded-For header
const port = 4000;

// Allow CORS for all routes
app.use(cors());

// PostgreSQL pool configuration
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

app.use(bodyParser.json());

// Session configuration
//app.use(session({
//secret: process.env.SESSION_SECRET,
//resave: false,
//saveUninitialized: true,
//cookie: { secure: process.env.NODE_ENV === 'production' } // Use secure cookies in production
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

// Serve static images
app.use('/images', express.static(path.join(__dirname, 'public/images')));





// Function to fetch location from multiple services
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

      attempt++;
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  throw new Error('Failed to fetch location after trying all services');
}

// Helper function to log interactions
async function logInteraction({ ip, interaction_type, request_path, referrer, user_agent, status_code, response_size, additional_data, session_id, user_id, timestamp }) {
  const interactionHour = new Date(timestamp);
  interactionHour.setMinutes(0, 0, 0); // Truncate to the hour

  let location = null;

  try {
    // Fetch user location using IP address
    location = await fetchLocation(ip);

    const existingInteraction = await pool.query(
      `SELECT id FROM user_interactions
        WHERE interaction_type = $1
        AND request_path = $2
        AND interaction_hour = $3
        AND (user_id = $4 OR (user_id IS NULL AND $4 IS NULL))
        AND session_id = $5
        AND md5(additional_data::text) = md5($6::text)
      LIMIT 1`,
      [interaction_type, request_path, interactionHour, user_id, session_id, additional_data]
    );

    // Check if interaction already exists for this hour
    if (existingInteraction.rows.length > 0) {
      return { success: true, message: 'Interaction already logged for this hour.' };
    }

    // Insert new interaction into the user_interactions table
    await pool.query(
      `INSERT INTO user_interactions
      (user_id, ip, interaction_type, request_path, referrer, user_agent, status_code, response_size, timestamp, additional_data, session_id, location, interaction_hour, interaction_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        user_id,
        ip,
        interaction_type,
        request_path,
        referrer,
        user_agent,
        status_code,
        response_size,
        new Date(timestamp), // Store the original timestamp
        additional_data,
        session_id,
        location, // Store location fetched from fetchLocation
        interactionHour,
        new Date().toISOString().split('T')[0] // interaction_date as current date
      ]
    );

    return { success: true };
  } catch (error) {
    console.error('Error logging interaction:', error);
    return { success: false, error: 'Failed to log interaction' };
  }
}

// Authentication middleware supporting Basic Authentication
const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Access to the API docs"');
    return res.status(401).json({ error: 'Authorization header is missing or invalid' });
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = result.rows[0];

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }


    req.user = user;
    req.session.user = { id: user.id, email: user.email, username: user.username }; // add this
    next();

  } catch (error) {
    console.error('Error during authentication:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};






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
          const { city, country, lat, lon } = response.data;
          return {
            city: city || '',
            country: country || '',
            latitude: lat || '',
            longitude: lon || ''
          };
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

app.get('/api/public/servers', authenticateUser, async (req, res) => {
  const user = req.user;
  const ip = req.ip;

  try {
    // Fetch the user's location based on their IP
    const location = await fetchLocation(ip);

    const query = `SELECT DISTINCT display_server_name FROM summary_table ORDER BY display_server_name;`;
    const result = await pool.query(query);

    // Map the result to rename the key to 'site_name'
    const formattedResult = result.rows.map(row => ({
      site_name: row.display_server_name
    }));

    // Log the interaction with the user's location
    await logInteraction({
      ip: ip,
      interaction_type: 'get_site_list',
      request_path: '/api/public/servers',
      referrer: req.headers['referer'] || '',
      user_agent: req.headers['user-agent'] || '',
      status_code: 200,
      response_size: Buffer.byteLength(JSON.stringify(formattedResult)),
      additional_data: JSON.stringify({ action: 'User fetched servers' }),
      session_id: req.sessionID || '',
      user_id: user.id,
      timestamp: new Date().toISOString(),
      location: location // Attach the fetched location here
    });

    res.status(200).json(formattedResult);
  } catch (error) {
    console.error('Error fetching servers:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch servers' });
  }
});




app.get('/api/public/tables', authenticateUser, async (req, res) => {
  const { server } = req.query;
  const user = req.user;

  if (!server) {
    return res.status(400).json({ success: false, error: 'Server name is required' });
  }

  try {
    const query = `SELECT DISTINCT display_table_name FROM summary_table WHERE display_server_name = $1 ORDER BY display_table_name;`;
    const result = await pool.query(query, [server]);

    await logInteraction({
      ip: req.ip,
      interaction_type: 'get_table_list',
      request_path: '/api/public/tables',
      referrer: req.headers['referer'] || '',
      user_agent: req.headers['user-agent'] || '',
      status_code: 200,
      response_size: Buffer.byteLength(JSON.stringify(result.rows)),
      additional_data: JSON.stringify({
//      tableName: table,
        serverName: server,

      }),
//    additional_data: JSON.stringify({ action: 'User fetched tables', server }),
      session_id: req.sessionID || '',
      user_id: user.id,
      timestamp: new Date().toISOString()
    });

    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching tables:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch tables' });
  }
});

app.get('/api/public/date-range', authenticateUser, async (req, res) => {
  const { server, table } = req.query;
  const user = req.user;

  if (!server || !table) {
    return res.status(400).json({ success: false, error: 'Missing required parameters: server, table' });
  }

  try {
    // SQL query to determine the start and end dates of the dataset and find missing dates
    const query = `
      WITH field_data AS (
        -- Get the field_id(s) for the given display_server_name and display_table_name
        SELECT st.field_id
        FROM summary_table st
        WHERE st.display_server_name = $1
          AND st.display_table_name = $2
      ),
      date_boundaries AS (
        -- Get the minimum (start) and maximum (end) dates for the given server and table
        SELECT MIN(fv.timestamp::date) AS start_date, MAX(fv.timestamp::date) AS end_date
        FROM field_values fv
        WHERE fv.field_id IN (SELECT field_id FROM field_data)
      ),
      date_range AS (
        -- Generate all dates between the start and end dates
        SELECT generate_series(
          (SELECT start_date FROM date_boundaries),
          (SELECT end_date FROM date_boundaries),
          '1 day'::interval
        )::date AS date
      ),
      existing_dates AS (
        -- Get the existing dates in field_values for the given field_id(s)
        SELECT DISTINCT fv.timestamp::date AS date
        FROM field_values fv
        WHERE fv.field_id IN (SELECT field_id FROM field_data)
      )
      -- Find missing dates by subtracting existing dates from the generated date range
      SELECT
        dr.date AS missing_date,
        (SELECT start_date FROM date_boundaries) AS start_date,
        (SELECT end_date FROM date_boundaries) AS end_date
      FROM date_range dr
      LEFT JOIN existing_dates ed ON dr.date = ed.date
      WHERE ed.date IS NULL
      ORDER BY dr.date;
    `;

    // Execute the query
    const result = await pool.query(query, [server, table]);

    // Extract the start and end dates from the first row (if exists)
    const start_date = result.rows.length > 0 ? result.rows[0].start_date : null;
    const end_date = result.rows.length > 0 ? result.rows[0].end_date : null;

    // Log the interaction
    await logInteraction({
      ip: req.ip,
      interaction_type: 'get_date_range',
      request_path: '/api/public/date-range',
      referrer: req.headers['referer'] || '',
      user_agent: req.headers['user-agent'] || '',
      status_code: 200,
      response_size: Buffer.byteLength(JSON.stringify(result.rows)),
      additional_data: JSON.stringify({
        tableName: table,
        serverName: server,

      }),
//    additional_data: JSON.stringify({ action: 'User fetched date range', server, table }),
      session_id: req.sessionID || '',
      user_id: user.id,
      timestamp: new Date().toISOString()
    });

    // Prepare the response
    res.status(200).json({
      start_date: start_date,
      end_date: end_date,
      missing_dates: result.rows.map(row => row.missing_date)
    });

  } catch (error) {
    console.error('Error fetching date range:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch date range' });
  }
});

const QueryStream = require('pg-query-stream');
const compression = require('compression');

const BUFFER_SIZE = 131072; // 128KB buffer size
const ROW_BUFFER_LIMIT = 1000; // Flush after 2000 rows

//// Download endpoint with authentication
//app.get('/api/public/download', authenticateUser, compression(), async (req, res) => {
//const { tableName, serverName, startDate, endDate, consent } = req.query;
//const user = req.user;
//
//// Check if consent was provided
//if (consent !== 'yes') {
//  return res.status(400).json({ success: false, error: 'Consent is required for data download.' });
//}
//
//try {
//  // Fetch the DOI for the site from the site_mapping table
//  const doiResult = await pool.query(
//    `SELECT doi FROM site_mapping WHERE display_name = $1`,
//    [serverName]
//  );
//
//  const doi = doiResult.rows[0]?.doi || 'DOI not available';
//
//  // Set the response headers for CSV
//  res.setHeader('Content-Type', 'text/csv');
//  res.setHeader(
//    'Content-Disposition',
//    `attachment; filename="${tableName}_${serverName}_data.csv"`
//  );
//
//  // Send the DOI first
//  res.write(`# Citation link: ${doi}\n`);
//
//  // Fetch unique field names and units to write headers and units first
//  const fieldsResult = await pool.query(
//    `
//    SELECT DISTINCT st.display_field_name, st.units
//    FROM summary_table st
//    JOIN field_values fv ON fv.field_id = st.field_id
//    WHERE st.display_table_name = $1
//      AND st.display_server_name = $2
//      AND fv.timestamp BETWEEN $3 AND $4
//    ORDER BY st.display_field_name ASC
//    `,
//    [tableName, serverName, startDate, endDate]
//  );
//
//  const fields = fieldsResult.rows.map((row) => row.display_field_name);
//  const unitsMap = {};
//  fieldsResult.rows.forEach((row) => {
//    unitsMap[row.display_field_name] = row.units || '';
//  });
//
//  // Write headers
//  const headers = ['Timestamp', ...fields, 'Latitude', 'Longitude'];
//  res.write(`${headers.join(',')}\n`);
//
//  // Write units
//  const unitsRow = ['', ...fields.map((field) => unitsMap[field]), '', ''];
//  res.write(`${unitsRow.join(',')}\n`);
//
//  // Start a query stream for fetching field values and details from the database
//  const client = await pool.connect(); // Get a client from the pool
//
//  try {
//    const queryStream = new QueryStream(
//      `
//      SELECT
//        TO_CHAR(fv.timestamp AT TIME ZONE 'Africa/Johannesburg', 'YYYY-MM-DD"T"HH24:MI:SS') AS timestamp,
//        CASE
//          WHEN fv.value ~ '^[0-9]+(\\.[0-9]*)?$' THEN
//            (CAST((CAST(fv.value AS numeric) * CAST(st.multiplier AS numeric)) AS text))
//          ELSE fv.value
//        END AS field_value,
//        st.display_field_name,
//        st.latitude,
//        st.longitude
//      FROM field_values fv
//      JOIN summary_table st ON fv.field_id = st.field_id
//      WHERE st.display_table_name = $1
//        AND st.display_server_name = $2
//        AND fv.timestamp BETWEEN $3 AND $4
//      ORDER BY fv.timestamp ASC, st.display_field_name ASC
//      `,
//      [tableName, serverName, startDate, endDate]
//    );
//
//    // Execute the query as a stream
//    const stream = client.query(queryStream);
//
//    // Initialize variables to track the current timestamp's data
//    let currentTimestamp = null;
//    let currentEntry = null;
//    let buffer = '';
//    let rowCount = 0;
//
//    stream.on('data', (row) => {
//      const timestamp = row.timestamp;
//
//      if (currentTimestamp === null) {
//        // First row
//        currentTimestamp = timestamp;
//        currentEntry = {
//          timestamp,
//          latitude: row.latitude,
//          longitude: row.longitude,
//          fields: {},
//        };
//      }
//
//      if (timestamp !== currentTimestamp) {
//        // Timestamp changed, write out the previous entry
//        writeCurrentEntry();
//
//        // Start new entry
//        currentTimestamp = timestamp;
//        currentEntry = {
//          timestamp,
//          latitude: row.latitude,
//          longitude: row.longitude,
//          fields: {},
//        };
//      }
//
//      // Accumulate field values
//      currentEntry.fields[row.display_field_name] = row.field_value;
//    });
//
//    stream.on('end', async () => {
//      // Write out the last entry
//      if (currentEntry) {
//        writeCurrentEntry();
//      }
//
//      // Write any remaining buffer
//      if (buffer.length > 0) {
//        res.write(buffer);
//        buffer = '';
//      }
//
//      res.end(); // End the response after all data is streamed
//      client.release(); // Release the client back to the pool
//
//      //log consent given
//      await logInteraction({
//        ip: req.ip,
//        interaction_type: 'consent_given',
//        request_path: '/api/download_constent',
//        referrer: req.headers['referer'] || '',
//        user_agent: req.headers['user-agent'] || '',
//        status_code: 200,
//        response_size: Buffer.byteLength(JSON.stringify(fields)), // Update as needed
//        additional_data: JSON.stringify({
//          tableName: tableName,
//          serverName: serverName,
//
//        }),
//        session_id: req.sessionID || '',
//        user_id: user.id, // Use authenticated user ID
//        timestamp: new Date().toISOString(),
//      });
//
//      // Log the interaction after the download
//      await logInteraction({
//        ip: req.ip,
//        interaction_type: 'download_data',
//        request_path: '/api/public/download',
//        referrer: req.headers['referer'] || '',
//        user_agent: req.headers['user-agent'] || '',
//        status_code: 200,
//        response_size: Buffer.byteLength(JSON.stringify(fields)), // Update as needed
//        additional_data: JSON.stringify({
//          tableName: tableName,
//          serverName: serverName,
//
//        }),
//        session_id: req.sessionID || '',
//        user_id: user.id, // Use authenticated user ID
//        timestamp: new Date().toISOString(),
//      });
//    });
//
//    stream.on('error', (err) => {
//      console.error('Error while streaming data:', err);
//      res.status(500).json({ error: 'Internal server error' });
//      client.release(); // Release the client in case of error
//    });
//
//    // Helper function to write the current entry to the buffer
//    function writeCurrentEntry() {
//      const dataRow = [
//        currentEntry.timestamp,
//        ...fields.map((field) => currentEntry.fields[field] || ''),
//        currentEntry.latitude,
//        currentEntry.longitude,
//      ].join(',') + '\n';
//
//      buffer += dataRow;
//      rowCount++;
//
//      if (rowCount >= ROW_BUFFER_LIMIT || buffer.length >= BUFFER_SIZE) {
//        res.write(buffer);
//        buffer = '';
//        rowCount = 0;
//      }
//    }
//  } catch (err) {
//    console.error('Error while executing query:', err);
//    res.status(500).json({ error: 'Internal server error' });
//    client.release(); // Release the client in case of an error
//  }
//} catch (err) {
//  console.error('Error while handling download request:', err);
//  res.status(500).json({ error: 'Internal server error' });
//}
//});
app.get('/api/public/download', authenticateUser, compression(), async (req, res) => {
  const { tableName, serverName, startDate, endDate, consent } = req.query;
  const user = req.user;

  // Check if consent was provided
  if (consent !== 'yes') {
    return res.status(400).json({ success: false, error: 'Consent is required for data download.' });
  }

  try {
    // Define the path where the pre-generated CSV would be stored
    const csvDir = path.join(__dirname, 'csv_exports');
    const csvFilePath = path.join(csvDir, `${tableName}_${serverName}.csv`);

    // Check if the pre-generated CSV exists
    if (fs.existsSync(csvFilePath)) {
      console.log(`Serving pre-generated CSV: ${csvFilePath}`);

      // Set headers and serve the pre-generated CSV
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${tableName}_${serverName}_data.csv"`
      );

      // Stream the file to the client
      const readStream = fs.createReadStream(csvFilePath);
      readStream.pipe(res);

      // Log interaction after serving the pre-generated CSV
      await logInteraction({
        ip: req.ip,
        interaction_type: 'download_data',
        request_path: '/api/public/download',
        referrer: req.headers['referer'] || '',
        user_agent: req.headers['user-agent'] || '',
        status_code: 200,
        response_size: fs.statSync(csvFilePath).size, // Get the size of the file
        additional_data: JSON.stringify({
          tableName: tableName,
          serverName: serverName,
        }),
        session_id: req.sessionID || '',
        user_id: user.id, // Use authenticated user ID
        timestamp: new Date().toISOString(),
      });
    } else {
      // CSV file does not exist, fall back to dynamic generation

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

      // Send the DOI first
      res.write(`# Citation link: ${doi}\n`);

      // Fetch unique field names and units to write headers and units first
      const fieldsResult = await pool.query(
        `
        SELECT DISTINCT st.display_field_name, st.units
        FROM summary_table st
        JOIN field_values fv ON fv.field_id = st.field_id
        WHERE st.display_table_name = $1
          AND st.display_server_name = $2
          AND fv.timestamp BETWEEN $3 AND $4
        ORDER BY st.display_field_name ASC
        `,
        [tableName, serverName, startDate, endDate]
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

      // Start a query stream for fetching field values and details from the database
      const client = await pool.connect(); // Get a client from the pool

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
            AND fv.timestamp BETWEEN $3 AND $4
          ORDER BY fv.timestamp ASC, st.display_field_name ASC
          `,
          [tableName, serverName, startDate, endDate]
        );

        // Execute the query as a stream
        const stream = client.query(queryStream);

        // Initialize variables to track the current timestamp's data
        let currentTimestamp = null;
        let currentEntry = null;
        let buffer = '';
        let rowCount = 0;

        stream.on('data', (row) => {
          const timestamp = row.timestamp;

          if (currentTimestamp === null) {
            // First row
            currentTimestamp = timestamp;
            currentEntry = {
              timestamp,
              latitude: row.latitude,
              longitude: row.longitude,
              fields: {},
            };
          }

          if (timestamp !== currentTimestamp) {
            // Timestamp changed, write out the previous entry
            writeCurrentEntry();

            // Start new entry
            currentTimestamp = timestamp;
            currentEntry = {
              timestamp,
              latitude: row.latitude,
              longitude: row.longitude,
              fields: {},
            };
          }

          // Accumulate field values
          currentEntry.fields[row.display_field_name] = row.field_value;
        });

        stream.on('end', async () => {
          // Write out the last entry
          if (currentEntry) {
            writeCurrentEntry();
          }

          // Write any remaining buffer
          if (buffer.length > 0) {
            res.write(buffer);
            buffer = '';
          }

          res.end(); // End the response after all data is streamed
          client.release(); // Release the client back to the pool

          // Log consent and download interaction after dynamic generation
          await logInteraction({
            ip: req.ip,
            interaction_type: 'consent_given',
            request_path: '/api/download_constent',
            referrer: req.headers['referer'] || '',
            user_agent: req.headers['user-agent'] || '',
            status_code: 200,
            response_size: Buffer.byteLength(JSON.stringify(fields)), // Update as needed
            additional_data: JSON.stringify({
              tableName: tableName,
              serverName: serverName,
            }),
            session_id: req.sessionID || '',
            user_id: user.id, // Use authenticated user ID
            timestamp: new Date().toISOString(),
          });

          await logInteraction({
            ip: req.ip,
            interaction_type: 'download_data',
            request_path: '/api/public/download',
            referrer: req.headers['referer'] || '',
            user_agent: req.headers['user-agent'] || '',
            status_code: 200,
            response_size: Buffer.byteLength(JSON.stringify(fields)), // Update as needed
            additional_data: JSON.stringify({
              tableName: tableName,
              serverName: serverName,
            }),
            session_id: req.sessionID || '',
            user_id: user.id, // Use authenticated user ID
            timestamp: new Date().toISOString(),
          });
        });

        stream.on('error', (err) => {
          console.error('Error while streaming data:', err);
          res.status(500).json({ error: 'Internal server error' });
          client.release(); // Release the client in case of error
        });

        // Helper function to write the current entry to the buffer
        function writeCurrentEntry() {
          const dataRow = [
            currentEntry.timestamp,
            ...fields.map((field) => currentEntry.fields[field] || ''),
            currentEntry.latitude,
            currentEntry.longitude,
          ].join(',') + '\n';

          buffer += dataRow;
          rowCount++;

          if (rowCount >= ROW_BUFFER_LIMIT || buffer.length >= BUFFER_SIZE) {
            res.write(buffer);
            buffer = '';
            rowCount = 0;
            res.flush(); // Flush response to client
          }
        }
      } catch (err) {
        console.error('Error while executing query:', err);
        res.status(500).json({ error: 'Internal server error' });
        client.release(); // Release the client in case of an error
      }
    }
  } catch (err) {
    console.error('Error while handling download request:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// server on port 4000
app.get('/api/public/site-status', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT is_active, message, updated_at
      FROM ops.site_status
      WHERE id = 1
    `);

    const r = rows[0] || { is_active: false, message: null, updated_at: new Date() };
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    res.set('Last-Modified', new Date(r.updated_at).toUTCString());

    res.json({ active: r.is_active, message: r.message, updatedAt: r.updated_at });
  } catch (err) {
    console.error('Error fetching site status:', err);
    res.status(500).json({ message: 'Error fetching site status' });
  }
});


// GET /api/public/site_disclaimer?serverName=Ndlovu
app.get('/api/public/site_disclaimer', async (req, res) => {
  try {
    const serverName = (req.query.serverName || '').trim();
    if (!serverName) return res.status(400).json({ error: 'serverName is required' });

    const q = `
      SELECT
        display_name                    AS "siteName",
        disclaimer_message              AS "message",
        disclaimer_contact_email        AS "contactEmail",
        COALESCE(disclaimer_require_ack, TRUE) AS "requireAck"
      FROM site_mapping
      WHERE disclaimer_is_active = TRUE
        AND display_name = $1
      LIMIT 1;
    `;

    const { rows } = await pool.query(q, [serverName]);   // <-- FIX: use pool, not db
    if (!rows.length || !rows[0].message) return res.status(204).send();

    // no-cache, like your /api/public/site-status route
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');

    return res.json(rows[0]);
  } catch (e) {
    console.error('/api/public/site_disclaimer error', e);
    return res.status(500).json({ error: 'Failed to fetch site disclaimer' });
  }
});


// GET /api/public/site_requirements?serverName=Ndlovu
app.get('/api/public/site_requirements', async (req, res) => {
  try {
    const serverName = (req.query.serverName || '').trim();
    if (!serverName) return res.status(400).json({ error: 'serverName is required' });


    const q = `SELECT site_id,
                display_name,
                require_extra_user_info            AS "requireExtra",
                COALESCE(
                    CASE
                     WHEN jsonb_typeof(extra_info_fields) = 'array' THEN extra_info_fields
                     ELSE (extra_info_fields -> 'fields')
                    END,
                    '[]'::jsonb
               )                                  AS "fields"
         FROM site_mapping
         WHERE LOWER(display_name) = LOWER($1)
         LIMIT 1;
      `;
    const { rows } = await pool.query(q, [serverName]);
    if (!rows.length) return res.status(404).json({ error: 'Site not found' });

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.json(rows[0]);
  } catch (e) {
    console.error('/api/public/site_requirements error', e);
    return res.status(500).json({ error: 'Failed to fetch site requirements' });
  }
});

// GET /api/public/user_site_info?serverName=Ndlovu
app.get('/api/public/user_site_info', authenticateUser, async (req, res) => {
  try {
    const userId =
    (req.user && req.user.id) ||
    (req.session && req.session.user && req.session.user.id) ||
    null;

    if (!userId) {
      console.warn('[user_site_info][GET] no user in request');
      return res.status(401).json({ error: 'Not signed in' });
    }

    const { serverName } = req.query;
    if (!serverName) {
      return res.status(400).json({ error: 'serverName is required' });
    }

    // 1) Try exact site
    const qExact = `
      SELECT data, popia_consent, updated_at, site_display_name
      FROM user_site_info
      WHERE user_id = $1 AND site_display_name = $2
      LIMIT 1;
    `;
    const rExact = await pool.query(qExact, [userId, serverName]);

    if (rExact.rows.length > 0) {
      const row = rExact.rows[0];
      return res.json({
        data: row.data || {},
        popia_consent: row.popia_consent || false,
        updated_at: row.updated_at,
        fromSite: row.site_display_name,
        isFallback: false
      });
    }

    // 2) Fallback to the user's most recent record from any site
    const qFallback = `
      SELECT data, popia_consent, updated_at, site_display_name
      FROM user_site_info
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT 1;
    `;
    const rFallback = await pool.query(qFallback, [userId]);

    if (rFallback.rows.length > 0) {
      const row = rFallback.rows[0];
      return res.json({
        data: row.data || {},
        popia_consent: row.popia_consent || false,
        updated_at: row.updated_at,
        fromSite: row.site_display_name,
        isFallback: true
      });
    }

    // 3) Nothing at all for this user
    return res.status(204).send();
  } catch (err) {
    console.error('/api/public/user_site_info[GET] error', err);
    return res.status(500).json({ error: 'Failed to fetch user site info' });
  }
});
// POST /api/public/user_site_info  (JSON: { serverName, data, popia_consent })
// POST /api/public/user_site_info  (JSON: { serverName, data, popia_consent })
app.post('/api/public/user_site_info', authenticateUser, async (req, res) => {
  const client = await pool.connect();
  try {
    const userId =
    (req.user && req.user.id) ||
    (req.session && req.session.user && req.session.user.id) ||
    null;

    if (!userId) {
      console.warn('[user_site_info][POST] no user in request');
      return res.status(401).json({ error: 'Not signed in' });
    }

    const { serverName, data, popia_consent } = req.body || {};
    if (!serverName) {
      return res.status(400).json({ error: 'serverName is required' });
    }
    if (data && typeof data !== 'object') {
      return res.status(400).json({ error: 'data must be an object' });
    }

    await client.query('BEGIN');

    // 1) Upsert the row for the CURRENT site (replace its data with the submitted payload)
    const upsertCurrentQ = `
      INSERT INTO user_site_info (user_id, site_display_name, data, popia_consent, updated_at)
      VALUES ($1, $2, $3::jsonb, $4::boolean, NOW())
      ON CONFLICT (user_id, site_display_name)
      DO UPDATE SET
        data = EXCLUDED.data,
        popia_consent = EXCLUDED.popia_consent,
        updated_at = NOW()
      RETURNING user_id, site_display_name, data, popia_consent, updated_at;
    `;
    const upsertCurrentParams = [userId, serverName, data || {}, !!popia_consent];
    const { rows: currentRows } = await client.query(upsertCurrentQ, upsertCurrentParams);

    // 2) Get all other sites that require extra info and enumerate their field names
    const sitesQ = `
      SELECT
        display_name,
        COALESCE(
          CASE
            WHEN jsonb_typeof(extra_info_fields) = 'array' THEN extra_info_fields
            ELSE (extra_info_fields -> 'fields')
          END,
          '[]'::jsonb
        ) AS fields
      FROM site_mapping
      WHERE require_extra_user_info = TRUE;
    `;
    const { rows: siteRows } = await client.query(sitesQ);

    // Prepare a fast lookup of submitted keys
    const submitted = data || {};
    const submittedKeys = Object.keys(submitted);

    // 3) For each site (except the one we just upserted), compute the overlapping subset of keys
    //    and upsert/merge them into user_site_info for that site.
    for (const site of siteRows) {
      const siteName = site.display_name;
      if (!siteName || siteName.toLowerCase() === String(serverName).toLowerCase()) continue;

      const schemaFields = Array.isArray(site.fields) ? site.fields : [];
      const siteFieldNames = schemaFields
      .map(f => (typeof f === 'object' ? f.name : null))
      .filter(Boolean);

      // Only propagate keys this site actually asks for
      const overlap = siteFieldNames.filter(n => submittedKeys.includes(n));
      if (overlap.length === 0) continue;

      const subset = overlap.reduce((acc, k) => {
        acc[k] = submitted[k];
        return acc;
      }, {});

      // Upsert and MERGE (||) with existing data for other sites.
      // We do NOT touch popia_consent for other sites.
      const upsertOtherQ = `
        INSERT INTO user_site_info (user_id, site_display_name, data, popia_consent, updated_at)
        VALUES ($1, $2, $3::jsonb, FALSE, NOW())
        ON CONFLICT (user_id, site_display_name)
        DO UPDATE SET
          data = user_site_info.data || EXCLUDED.data,  -- merge, don't overwrite unrelated keys
          updated_at = NOW();
      `;
      await client.query(upsertOtherQ, [userId, siteName, subset]);
    }

    await client.query('COMMIT');
    return res.json(currentRows[0]);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('/api/public/user_site_info[POST] error', err);
    return res.status(500).json({ error: 'Failed to upsert and propagate user site info' });
  } finally {
    client.release();
  }
});


// In your express app file (same style as /api/public/user_site_info):
app.get('/api/public/user_profiles_for_analytics', authenticateUser, async (req, res) => {
  try {
    // Require sign-in (same as your other public routes)
    const viewerId =
    (req.user && req.user.id) ||
    (req.session && req.session.user && req.session.user.id) ||
    null;

    if (!viewerId) {
      console.warn('[user_profiles_for_analytics][GET] no user in request');
      return res.status(401).json({ error: 'Not signed in' });
    }

    // Optional filters (keep it simple and consistent)
    const { serverName = '', startDate = '', endDate = '' } = req.query;
    const hasServer = Boolean(serverName && serverName.trim());
    const hasStart = Boolean(startDate && startDate.trim());
    const hasEnd   = Boolean(endDate && endDate.trim());

    // Build WHERE for interactions table (to find which users to include)
    const whereParts = ['ai.user_id IS NOT NULL']; // only logged-in users
    const params = [];
    let p = 0;

    if (hasServer) {
      whereParts.push(`(ai.additional_data->>'serverName') = $${++p}`);
      params.push(serverName.trim());
    }
    if (hasStart) {
      whereParts.push(`ai.interaction_date >= $${++p}::timestamptz`);
      params.push(startDate.trim());
    }
    if (hasEnd) {
      whereParts.push(`ai.interaction_date < ($${++p}::timestamptz + interval '1 day')`);
      params.push(endDate.trim());
    }

    // 1) Get distinct user_ids that appear in analytics interactions for filters
    const qUsers = `
      SELECT DISTINCT ai.user_id
      FROM public.analytics_interactions ai
      ${whereParts.length ? 'WHERE ' + whereParts.join(' AND ') : ''}
    `;

    const rUsers = await pool.query(qUsers, params);
    if (rUsers.rows.length === 0) {
      // Nothing to show (still return [] to keep the UI simple)
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      return res.json([]);
    }

    const idList = rUsers.rows.map(r => r.user_id);

    // 2) Pull merged profiles for those users (view already handles merging)
    const qProfiles = `
      SELECT
        u.id                         AS "userId",
        u.email                      AS "email",
        u.first_name                 AS "firstName",
        u.last_name                  AS "lastName",
        u.sector                     AS "sector",
        u.discipline                 AS "discipline",
        vp.merged_data               AS "merged",
        vp.popia_consent_any         AS "popiaConsentAny"
      FROM public.users u
      JOIN public.v_user_profiles_merged vp
        ON vp.user_id = u.id
      WHERE u.id = ANY($1::int[])
    `;
    const rProfiles = await pool.query(qProfiles, [idList]);

    // 3) Redact if no POPIA consent (keep pattern explicit & predictable)
    const SENSITIVE = new Set([
      'race',
      'id_number',
      'passport_number',
      'passport_country',
      'student_number',
      'supervisor',
      'co_supervisors',
      'expected_submission',
      'expected_date_of_submission',
    ]);

    const rows = rProfiles.rows.map(row => {
      const merged = row.merged || {};
      if (!row.popiaConsentAny) {
        const safe = {};
        for (const k of Object.keys(merged)) {
          if (!SENSITIVE.has(k)) safe[k] = merged[k];
        }
        return { ...row, merged: safe, redacted: true };
      }
      return { ...row, redacted: false };
    });

    // No-cache (like your other public endpoints)
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');

    return res.json(rows);
  } catch (err) {
    console.error('/api/public/user_profiles_for_analytics[GET] error', err);
    return res.status(500).json({ error: 'Failed to fetch analytics user profiles' });
  }
});


app.listen(port, '0.0.0.0', () => {
  console.log(`Server started on http://0.0.0.0:${port}`);
});
