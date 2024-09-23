require("dotenv").config();
const axios = require("axios");
const https = require("https");
const express = require("express");
const {Pool} = require("pg");
const bodyParser = require("body-parser");
const cors = require("cors");
const session = require("express-session");
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
const agent = new https.Agent({
    rejectUnauthorized: false, // WARNING: This disables SSL verification
});

const app = express();
const port = process.env.PORT;

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
app.use(bodyParser.urlencoded({extended: true}));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {secure: false} // Set to true if using https
}));

app.use('/images', (req, res, next) => {
    console.log(`Serving image request: ${req.url}`);
    next();
}, express.static(path.join(__dirname, 'public/images')));

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

// New endpoint to serve images
app.get('/api/image/:imageName', (req, res) => {
    const imageName = req.params.imageName;
    const imagePath = path.join(__dirname, 'public/images', imageName);

    // Check if the image exists
    fs.access(imagePath, fs.constants.F_OK, (err) => {
        if (err) {
            // If the image doesn't exist, send a placeholder image
            res.sendFile(path.join(__dirname, 'public/images/default-placeholder.png'));
        } else {
            res.sendFile(imagePath);
        }
    });
});

// Backend route to fetch total field values and summary data counts
app.get('/api/total-field-values', async (req, res) => {
    try {
        const result = await pool.query('SELECT total_field_values_count, summary_data_count FROM field_values_summary');
        const {total_field_values_count, summary_data_count} = result.rows[0];
        await await res.json({
          totalDataValues: total_field_values_count,
          totalRawValues: summary_data_count,
        });
    } catch (error) {
        console.error('Error fetching field values summary:', error);
        res.status(500).json({message: 'Error fetching field values summary'});
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

    // Calculate the interaction hour based on the provided timestamp
    const interactionHour = new Date(timestamp);
    interactionHour.setMinutes(0, 0, 0); // Truncate to the hour

    let location = null;

    try {
        location = await fetchLocation(ip);

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
            [interaction_type, request_path, interactionHour, user_id, session_id, additional_data]
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
            [user_id, ip, interaction_type, request_path, referrer, user_agent, status_code, response_size, new Date(timestamp), additional_data, session_id, location, interactionHour, new Date().toISOString().split('T')[0]]
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

app.get('/api/analytics/overview', async (req, res) => {
    const {range = 'monthly', year, month} = req.query;
    const startDate = range === 'yearly' ? `${year}-01-01` : `${year}-${month}-01`;
    const endDate = range === 'yearly' ? `${year}-12-31` : `${year}-${month}-${new Date(year, month, 0).getDate()}`;

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
        const locationsQuery = `
      SELECT location->>'lat' AS lat, location->>'lon' AS lon, location->>'city' AS city, location->>'country' AS country, COUNT(*) AS visits
      FROM user_interactions
      WHERE interaction_date BETWEEN $1 AND $2
      GROUP BY lat, lon, city, country
      ORDER BY visits DESC
      LIMIT 20;
    `;
        const locationsResult = await pool.query(locationsQuery, [startDate, endDate]);
        const locations = locationsResult.rows.map(row => ({
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
      LIMIT 10;
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
      LIMIT 10;
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

        // Sending the response
        await await res.json({
          overview: {
            totalVisits,
            newUsers,
            anonymousUsers,
            locations,
            topPages,
            topInteractionTypes,
            userActivityHeatmap,
            detailedInteractions,
          },
        });
    } catch (error) {
        console.error('Error fetching analytics overview:', error);
        res.status(500).json({message: 'Failed to fetch analytics overview'});
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
        const result = await pool.query('SELECT id, name FROM roles');
        await await res.json(result.rows);
    } catch (error) {
        console.error('Error fetching roles:', error);
        res.status(500).json({error: 'Internal server error'});
    }
});

// Update user role
app.post('/api/user_roles', async (req, res) => {
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
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT u.id, u.first_name, u.last_name, u.email, u.username, u.sector, u.discipline, u.country, ur.role_id, r.name as role_name
      FROM users u 
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id`
        );
        await await res.json(result.rows);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({error: 'Internal server error'});
    }
});

// Delete a user
app.delete('/api/users/:id', async (req, res) => {
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

// Function to fetch tables for a given server URI
async function fetchTablesForServer(serverUri) {
    try {
        //console.log(`Fetching tables for server URI: ${serverUri}`);
        const url = `https://lognet.saeon.ac.za/?command=browsesymbols&uri=${encodeURIComponent(serverUri)}&format=json`;
        const response = await axios.get(url, {httpsAgent: agent});
        const tables = response.data.symbols.filter(symbol => symbol.type === 6 && symbol.is_enabled);
        //console.log(`Found ${tables.length} tables for server URI: ${serverUri}`);
        return tables;
    } catch (error) {
        console.error('Failed to fetch tables for server:', serverUri, error);
        return []; // Return an empty array in case of an error
    }
}

async function updateTablesForServer(serverId, tables) {
    try {
        //console.log(`Updating tables for server ID: ${serverId}`);
        await pool.query('BEGIN');
        await pool.query('UPDATE server_tables SET status = \'inactive\' WHERE server_id = $1', [serverId]);

        for (const table of tables) {
//    console.log(`Inserting/Updating table: ${table.name} for server ID: ${serverId}`);
            await pool.query(`
        INSERT INTO server_tables (server_id, table_name, uri, type, is_read_only, can_expand, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'active')
        ON CONFLICT (server_id, table_name) DO UPDATE SET
        uri = EXCLUDED.uri,
        type = EXCLUDED.type,
        is_read_only = EXCLUDED.is_read_only,
        can_expand = EXCLUDED.can_expand,
        status = EXCLUDED.status`,
                [serverId, table.name, table.uri, table.type, table.is_read_only, table.can_expand]
            );
        }
        await pool.query('COMMIT');
        //console.log(`Updated tables for server ID: ${serverId}`);
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Failed to update tables for server:', serverId, error);
    }
}

async function fetchFieldsForTable(tableUri, p1) {
    try {

//  const dataQueryUrl = `https://lognet.saeon.ac.za/?command=dataquery&uri=${encodeURIComponent(tableUri)}&format=json&mode=since-time&p1=${p1}`;
//  const url = `https://lognet.saeon.ac.za/?command=dataquery&uri=${encodeURIComponent(fieldUri)}&format=json&mode=since-time&p1=${p1}`;

        const symbolsUrl = `https://lognet.saeon.ac.za/?command=browsesymbols&uri=${encodeURIComponent(tableUri)}&format=json`;
        const dataQueryUrl = `https://lognet.saeon.ac.za/?command=dataquery&uri=${encodeURIComponent(tableUri)}&format=json&mode=most-recent&p1=500`;

        // Set a timeout of 10 seconds (10000 milliseconds) for each request
        const axiosConfig = {
            httpsAgent: agent,
            timeout: 300000 // 10 seconds
        };

        const symbolsResponse = await axios.get(symbolsUrl, axiosConfig);
        const dataQueryResponse = await axios.get(dataQueryUrl, axiosConfig);

        let fields = symbolsResponse.data.symbols.filter(symbol => symbol.type === 8 && symbol.is_enabled);

        if (dataQueryResponse.data.head && dataQueryResponse.data.head.fields) {
            const additionalFieldDetails = dataQueryResponse.data.head.fields;
            fields = fields.map(field => {
                const additionalDetails = additionalFieldDetails.find(detail => detail.name === field.name);
                return {
                    ...field,
                    data_type: additionalDetails ? additionalDetails.type : null,
                    units: additionalDetails ? additionalDetails.units : null,
                    process: additionalDetails ? additionalDetails.process : null,
                    is_settable: additionalDetails ? additionalDetails.settable : null
                };
            });
        }
        return fields;
    } catch (error) {
        console.error('Failed to fetch fields for table:', tableUri, error);
        return [];
    }
}

async function updateFieldsForTable(tableId, fields) {
    try {
        console.log(`Updating fields for table ID: ${tableId}`);
        await pool.query('BEGIN');
        await pool.query(`UPDATE server_table_fields SET status = 'inactive' WHERE table_id = $1`, [tableId]);

        for (const field of fields) {
//    console.log(`Inserting/Updating field: ${field.name} for table ID: ${tableId}`);
            await pool.query(`
        INSERT INTO server_table_fields (
          table_id, field_name, uri, type, is_read_only, can_expand, status,
          data_type, units, process, is_settable
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'active',
          $7, $8, $9, $10
        ) ON CONFLICT (table_id, field_name) DO UPDATE SET
          uri = EXCLUDED.uri,
          type = EXCLUDED.type,
          is_read_only = EXCLUDED.is_read_only,
          can_expand = EXCLUDED.can_expand,
          status = EXCLUDED.status,
          data_type = EXCLUDED.data_type,
          units = EXCLUDED.units,
          process = EXCLUDED.process,
          is_settable = EXCLUDED.is_settable`,
                [
                    tableId,
                    field.name,
                    field.uri,
                    field.type,
                    field.is_read_only,
                    field.can_expand,
                    field.data_type,
                    field.units,
                    field.process,
                    field.is_settable
                ]
            );
        }
        await pool.query('COMMIT');
        console.log(`Updated fields for table ID: ${tableId}`);
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Failed to update fields for table:', tableId, error);
    }
}

async function fetchValuesForField(fieldUri, p1) {
    try {
//  const dataQueryUrl = `https://lognet.saeon.ac.za/?command=dataquery&uri=${encodeURIComponent(tableUri)}&format=json&mode=since-time&p1=${p1}`;
//  const url = `https://lognet.saeon.ac.za/?command=dataquery&uri=${encodeURIComponent(fieldUri)}&format=json&mode=since-time&p1=${p1}`;
        const url = `https://lognet.saeon.ac.za/?command=dataquery&uri=${encodeURIComponent(fieldUri)}&format=json&mode=since-time&p1=${p1}`;

        // Set a timeout of 10 seconds (10000 milliseconds) for the request
        const axiosConfig = {
            httpsAgent: agent,
            timeout: 300000 //
        };

        const response = await axios.get(url, axiosConfig);
        return response.data.data;
    } catch (error) {
        console.error('Failed to fetch values for field:', fieldUri, error);
        return [];
    }
}

// Define the update function
async function updateFieldValuesSummary() {
    try {
        const query = `
      UPDATE field_values_summary
      SET total_field_values_count = (
          SELECT COUNT(*) FROM field_values
      ),
      summary_data_count = (
          SELECT COUNT(*) FROM field_values WHERE field_id IN (SELECT field_id FROM summary_table)
      );
    `;

        // Run the query
        await pool.query(query);
        console.log('Field values summary updated successfully!');
    } catch (error) {
        console.error('Error updating field values summary:', error);
    }
}

async function updateValuesForField(fieldId, values) {
    try {
//  console.log(`Updating values for field ID: ${fieldId}`);
        await pool.query('BEGIN');
        for (const value of values) {
//    console.log(`Inserting/Updating value for field ID: ${fieldId} at timestamp: ${value.time}`);
            await pool.query(`
        INSERT INTO field_values (field_id, timestamp, value, status)
        VALUES ($1, $2, $3, 'active')
        ON CONFLICT (field_id, timestamp) DO UPDATE SET
        value = EXCLUDED.value,
        status = 'active'`,
                [fieldId, value.time, value.vals[0].toString()]
            );
        }
        await pool.query('COMMIT');
//  console.log(`Updated values for field ID: ${fieldId}`);
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Failed to update values for field:', fieldId, error);
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
  const {tableId} = req.params;
  if (!validateUUID(tableId)) {
    return res.status(400).json({error: 'Invalid table ID'});
  }
  const {startDate, endDate, page, pageSize} = req.query;

  const limit = parseInt(pageSize, 10) || 10; // Default page size to 10
  const offset = ((parseInt(page, 10) || 1) - 1) * limit; // Default page to 1

  // Convert and validate dates
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({error: 'Invalid date format'});
  }

  const formattedStart = start.toISOString();
  const formattedEnd = end.toISOString();

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
      ORDER BY fv.timestamp DESC
      LIMIT $4 OFFSET $5;
    `;

    const countQuery = `
      SELECT COUNT(DISTINCT fv.timestamp) AS total_count
      FROM field_values fv
      JOIN server_table_fields sf ON fv.field_id = sf.field_id
      WHERE sf.table_id = $1
        AND fv.timestamp BETWEEN $2 AND $3;
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
    console.error('Failed to retrieve values for table:', error);
    res.status(500).json({message: 'Failed to retrieve values for table'});
  }
});

app.post('/api/tables/date-ranges', async (req, res) => {
  const {tableIds} = req.body;

  if (!Array.isArray(tableIds) || tableIds.some((id) => !validateUUID(id))) {
    return res.status(400).json({error: 'Invalid table IDs'});
  }

  try {
    const query = `
      SELECT sf.table_id, MIN(fv.timestamp) AS start_date, MAX(fv.timestamp) AS end_date
      FROM field_values fv
      JOIN server_table_fields sf ON fv.field_id = sf.field_id
      WHERE sf.table_id = ANY($1::uuid[])
      GROUP BY sf.table_id;
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
  const {tableId} = req.params;
  if (!validateUUID(tableId)) {
    return res.status(400).json({error: 'Invalid table ID'});
  }
  const {startDate, endDate} = req.query;

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return res.status(400).json({error: 'Invalid date format'});
  }

  const formattedStart = start.toISOString();
  const formattedEnd = end.toISOString();

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
      ORDER BY fv.timestamp DESC;
    `;

    const query = new QueryStream(valuesQuery, [tableId, formattedStart, formattedEnd]);
    const stream = client.query(query);

    res.setHeader('Content-Disposition', 'attachment; filename=data.csv');
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

        const readableTimestamp = new Date(row.timestamp).toLocaleDateString('en-GB') + ' ' + new Date(row.timestamp).toLocaleTimeString('en-GB', {hour12: false});

        const sortedFieldNames = Array.from(allFieldNames).sort();
        const csvRow = [readableTimestamp, ...sortedFieldNames.map(field => data[field] || '')].join(',');
        callback(null, csvRow + '\n');
      }
    });

    stream.pipe(csvTransform).pipe(res);
    stream.on('end', () => client.release());
    stream.on('error', (error) => {
      console.error('Failed to stream data:', error);
      res.status(500).json({message: 'Failed to download data'});
    });

  } catch (error) {
    console.error('Failed to retrieve values for table:', error);
    res.status(500).json({message: 'Failed to retrieve values for table'});
  }
});
// Endpoint to retrieve all values for a specific field
app.get('/api/fields/:fieldId/values', async (req, res) => {
    const {fieldId} = req.params;
    if (!validateUUID(fieldId)) {
        return res.status(400).json({error: 'Invalid field ID'});
    }
    const limit = req.query.limit || 200; // Default to 200 records if not specified
    const offset = req.query.offset || 0; // Default to start at 0

    try {
        const result = await pool.query('SELECT * FROM field_values WHERE field_id = $1 ORDER BY timestamp DESC LIMIT $2 OFFSET $3', [fieldId, limit, offset]);
        await res.json(result.rows);
    } catch (error) {
        console.error('Failed to retrieve values for field:', error);
        res.status(500).json({message: 'Failed to retrieve values for field'});
    }
});

async function syncServers(p1) {
    try {
        console.log('Starting server synchronization...');

        // Fetch server data
        const response = await axios.get('https://lognet.saeon.ac.za/?command=browsesymbols&uri=Server&format=json', {httpsAgent: agent});
        const servers = response.data.symbols || [];
        if (servers.length === 0) {
            console.log('No servers to sync');
            return;
        }

        console.log(`Found ${servers.length} servers to sync.`);

        // Start a transaction
        await pool.query('BEGIN');

        // Synchronize servers in parallel but keep table and field operations sequential
        const serverSyncTasks = servers.map((server) => syncSingleServer(server, p1));
        await Promise.all(serverSyncTasks); // Only parallelize server synchronization

        // Commit the transaction
        await pool.query('COMMIT');
        console.log('Sync completed successfully with', servers.length, 'servers.');

        // Update the last synced timestamp
        await pool.query(`
      INSERT INTO last_synced (id, sync_time)
      VALUES (1, CURRENT_TIMESTAMP)
      ON CONFLICT (id)
      DO UPDATE SET sync_time = EXCLUDED.sync_time;
    `);
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Failed to sync servers:', error.message, '\nStack:', error.stack);
    }
}

async function syncSingleServer(server, p1) {
    const {name, uri, type, is_enabled, is_read_only, can_expand} = server;
    console.log(`Syncing server: ${name}`);

    try {
        // Insert or update the server record
        await pool.query(
            `INSERT INTO servers (name, uri, type, is_enabled, is_read_only, can_expand)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (name) DO UPDATE SET
      uri = EXCLUDED.uri,
      type = EXCLUDED.type,
      is_enabled = EXCLUDED.is_enabled,
      is_read_only = EXCLUDED.is_read_only,
      can_expand = EXCLUDED.can_expand`,
            [name, uri, type, is_enabled, is_read_only, can_expand]
        );

        // Fetch server ID
        const serverResult = await pool.query('SELECT server_id FROM servers WHERE name = $1', [name]);
        const serverId = serverResult.rows[0]?.server_id;
        if (!serverId) {
            throw new Error(`Server ID not found for server: ${name}`);
        }

        console.log(`Fetching tables for server: ${name}`);
        const tables = await fetchTablesForServer(uri);
        console.log(`Found ${tables.length} tables for server: ${name}`);

        // Update tables sequentially
        await updateTablesForServer(serverId, tables);

        // Fetch and update fields and their values for each table sequentially
        const tableResult = await pool.query('SELECT table_id, uri FROM server_tables WHERE server_id = $1', [serverId]);
        for (const table of tableResult.rows) {
            console.log(`Fetching fields for table: ${table.uri}`);
            const fields = await fetchFieldsForTable(table.uri, p1);
            await updateFieldsForTable(table.table_id, fields);

            const fieldResult = await pool.query('SELECT field_id, uri FROM server_table_fields WHERE table_id = $1', [table.table_id]);
            for (const field of fieldResult.rows) {
                const values = await fetchValuesForField(field.uri, p1);
                await updateValuesForField(field.field_id, values);
            }
        }
    } catch (error) {
        console.error(`Failed to sync server ${name}:`, error.message);
        throw error; // Re-throw to trigger the rollback in the main function
    }
}

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
      umt.field_id,
      umt.display_server_name,
      umt.display_table_name,
      umt.display_field_name,
      umt.display_units AS units,
      umt.latitude,
      umt.longitude,
      umt.aggregation_type,
      umt.multiplier 
    FROM 
      unified_mapping_table umt
    WHERE
      umt.include_in_summary = true
    ON CONFLICT (display_server_name, display_table_name, display_field_name, aggregation_type) DO UPDATE SET
      units = EXCLUDED.units,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      aggregation_type = EXCLUDED.aggregation_type,
      multiplier = EXCLUDED.multiplier; 
  `;

    try {
        const result = await pool.query(insertQuery);
        console.log('Insert into summary table successful.');
        console.log(`Inserted/Updated rows: ${result.rowCount}`);
        return result; // Return the result for logging
    } catch (error) {
        console.error('Failed to insert into summary table:', error);
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
        const clearQuery = `DELETE FROM summary_table`;
        const result = await pool.query(clearQuery);
        console.log('Summary table cleared successfully.');
        return result; // Return the result for logging
    } catch (error) {
        console.error('Failed to clear summary table:', error);
        throw error; // Re-throw to be caught by the caller
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
      date_trunc('day', $1::timestamptz AT TIME ZONE 'SAST'), 
      date_trunc('day', $2::timestamptz AT TIME ZONE 'SAST'), 
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
      fv.timestamp AT TIME ZONE 'SAST' AS timestamp_sast
    FROM field_values fv
    JOIN relevant_fields rf ON fv.field_id = rf.field_id
    WHERE fv.timestamp >= $1 
      AND fv.timestamp < $2 + interval '1 day'
      AND (UPPER(fv.value) NOT IN ('NAN', '') OR fv.value IS NULL) -- Early exclusion of invalid values
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

app.get('/api/filtered-aggregated-data-availability', async (req, res) => {
    const {startDate, endDate, servers} = req.query;

    // Ensure the necessary parameters are provided
    if (!startDate || !endDate || !servers) {
        return res.status(400).json({error: 'Missing required query parameters.'});
    }

    try {
        const serverList = servers.split(',');
        const query = `
            SELECT display_server_name, display_table_name, date AS aggregated_timestamp,
                    AVG(availability_percentage) AS average_availability_percentage
            FROM daily_data_availability
            WHERE date >= $1
              AND date <= $2
              AND display_server_name = ANY($3::text[])
            GROUP BY display_server_name, display_table_name, date
            ORDER BY date ASC;
        `;
        const values = [startDate, endDate, serverList];

        const result = await pool.query(query, values);
        await res.json(result.rows);
    } catch (error) {
        console.error('Error fetching filtered aggregated data:', error);
        res.status(500).json({error: 'Internal server error'});
    }
});

app.get('/api/data-availability', async (req, res) => {
    const {serverName, tableName, startDate, endDate} = req.query;

    try {
        const query = `
      SELECT 
    display_server_name, 
    display_table_name, 
    display_field_name, 
    date AS aggregated_timestamp, 
    total_records, 
    available_records, 
    availability_percentage
  FROM daily_data_availability
  WHERE display_server_name = $1
  AND display_table_name = $2
  AND date >= $3
  AND date <= $4
  ORDER BY date ASC;

    `;
        const values = [serverName, tableName, startDate, endDate];

        const result = await pool.query(query, values);
        await res.json(result.rows);
    } catch (error) {
        console.error("Error fetching data availability:", error);
        res.status(500).json({error: 'Internal server error'});
    }
});

app.get('/api/unified_mapping_table', async (req, res) => {
    const {serverName, tableName, fieldName, includeInSummary, page = 1, limit = 10} = req.query;
    const offset = (page - 1) * limit;

    let baseQuery = 'SELECT * FROM unified_mapping_table';
    let countQuery = 'SELECT COUNT(*) FROM unified_mapping_table';
    const conditions = [];
    const values = [];
    let paramIndex = 1;

    if (serverName) {
        conditions.push(`current_server_name = $${paramIndex++}`);
        values.push(serverName);
    }
    if (tableName) {
        conditions.push(`current_table_name = $${paramIndex++}`);
        values.push(tableName);
    }
    if (fieldName) {
        conditions.push(`current_field_name = $${paramIndex++}`);
        values.push(fieldName);
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

    baseQuery += ` LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
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

app.post('/api/unified_mapping_table/update', async (req, res) => {
    const {
        ids,
        displayServerName,
        displayTableName,
        displayFieldName,
        latitude,
        longitude,
        units,
        aggregationType,
        multiplier, // Add multiplier here
        includeInSummary
    } = req.body;

    // Input validation
    if (!Array.isArray(ids) || ids.length === 0 || !displayServerName || !displayTableName || !displayFieldName || !units || aggregationType === undefined || multiplier === undefined) {
        return res.status(400).json({message: 'Invalid or incomplete request data.'});
    }

    // Validate numeric fields
    const validLatitude = latitude !== undefined ? parseFloat(latitude) : null;
    const validLongitude = longitude !== undefined ? parseFloat(longitude) : null;
    const validMultiplier = multiplier !== undefined ? parseFloat(multiplier) : null; // Validate multiplier

    if (isNaN(validLatitude) || isNaN(validLongitude) || isNaN(aggregationType) || isNaN(validMultiplier)) {
        return res.status(400).json({message: 'Latitude, Longitude, Aggregation Type, and Multiplier must be numeric.'});
    }

    // Assume false if not specified
    const validIncludeInSummary = includeInSummary !== undefined ? includeInSummary : false;

    try {
        // Check for duplicates before proceeding with the update
        const duplicateCheckQuery = `
      SELECT 
        display_server_name, display_table_name, display_field_name, aggregation_type, COUNT(*)
      FROM 
        unified_mapping_table
      WHERE 
        display_server_name = $1 AND
        display_table_name = $2 AND
        display_field_name = $3 AND
        aggregation_type = $4 AND
        include_in_summary = true
      GROUP BY 
        display_server_name, display_table_name, display_field_name, aggregation_type
      HAVING COUNT(*) > 1;
    `;

        const duplicateResult = await pool.query(duplicateCheckQuery, [displayServerName, displayTableName, displayFieldName, aggregationType]);
        if (duplicateResult.rows.length > 0) {
            return res.status(409).json({
                message: 'Duplicate entries found, update aborted.',
                duplicates: duplicateResult.rows
            });
        }

        await pool.query('BEGIN');

        const updateQuery = `
      UPDATE unified_mapping_table
      SET 
        display_server_name = $1,
        display_table_name = $2,
        display_field_name = $3,
        latitude = $4,
        longitude = $5,
        display_units = $6,
        aggregation_type = $7,
        multiplier = $8,  -- Add multiplier update here
        include_in_summary = $9
      WHERE id = ANY($10::uuid[])
    `;

        const result = await pool.query(updateQuery, [
            displayServerName,
            displayTableName,
            displayFieldName,
            validLatitude,
            validLongitude,
            units,
            aggregationType,
            validMultiplier, // Include multiplier in the query
            validIncludeInSummary,
            ids
        ]);

        if (result.rowCount !== ids.length) {
            throw new Error(`Update successful for ${result.rowCount} out of ${ids.length} rows.`);
        }

        const summaryResult = await populateSummaryTable();
        if (!summaryResult.success) {
            throw new Error(`Summary table update failed: ${summaryResult.error}`);
        }

        await pool.query('COMMIT');
        res.status(200).json({message: 'Update successful. Summary table updated.'});
    } catch (error) {
        await pool.query('ROLLBACK');
        const errorMessage = error.message.includes('Duplicate entries found')
            ? 'Duplicate entries found, update aborted.'
            : error.message.includes('ON CONFLICT DO UPDATE command cannot affect row a second time')
                ? 'Summary table update failed due to conflict resolution issue.'
                : 'Update failed.';

        console.error('Error updating rows:', error); // Detailed error logging
        res.status(500).json({message: errorMessage, error: error.message}); // Detailed error feedback
    }
});

app.post('/api/unified_mapping_table/check_duplicates', async (req, res) => {
    const {displayServerName, displayTableName, displayFieldName, aggregationType, multiplier} = req.body; // Include multiplier

    // Corrected validation check
    if (!displayServerName || !displayTableName || !displayFieldName || aggregationType === undefined || multiplier === undefined) {
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
        display_server_name = $1 AND
        display_table_name = $2 AND
        display_field_name = $3 AND
        aggregation_type = $4 AND
        multiplier = $5 AND 
        include_in_summary = true
      GROUP BY 
        display_server_name, display_table_name, display_field_name, aggregation_type, multiplier  
      HAVING COUNT(*) > 1;
    `;

        const result = await pool.query(duplicateCheckQuery, [displayServerName, displayTableName, displayFieldName, aggregationType, multiplier]); // Pass multiplier in parameters
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

        await res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching site metadata:', err);
        res.status(500).json({error: 'Internal server error'});
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

app.get("/api/summary_table/servers", async (req, res) => {
    try {
        const result = await pool.query(`
      SELECT DISTINCT display_server_name
      FROM summary_table
      ORDER BY display_server_name
    `);
        //  console.log('Servers fetched:', result.rows);
        await res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({error: "Internal server error"});
    }
});

app.get("/api/summary_table/tables", async (req, res) => {
    const {serverName} = req.query;
    try {
        const result = await pool.query(
            `
      SELECT DISTINCT display_table_name
      FROM summary_table
      WHERE display_server_name = $1
      ORDER BY display_table_name
    `,
            [serverName],
        );
        //  console.log(`Tables fetched for ${serverName}:`, result.rows);
        await res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({error: "Internal server error"});
    }
});

app.get("/api/summary_table/values", async (req, res) => {
    const {tableName, serverName, startDate, endDate, page, pageSize} = req.query;

    // Parse page size and number with defaults
    const limit = parseInt(pageSize, 10) || 100;
    const offset = ((parseInt(page, 10) || 1) - 1) * limit;

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({error: "Invalid date format"});
    }

    const formattedStart = start.toISOString();
    const formattedEnd = end.toISOString();

    try {
        // Fetch the precomputed total count from summary_data_date_ranges
        const totalCountResult = await pool.query(`
      SELECT total_count
      FROM summary_data_date_ranges
      WHERE server_name = $1 AND table_name = $2
    `, [serverName, tableName]);

        const totalRecords = totalCountResult.rows.length > 0 ? parseInt(totalCountResult.rows[0].total_count, 10) : 0;

        // SQL Query to fetch paginated results
        const optimizedQuery = `
      WITH filtered_values AS (
        SELECT 
          fv.timestamp, 
          fv.value,
          st.display_field_name,
          st.units,
          st.multiplier,
          st.latitude,
          st.longitude
        FROM field_values fv
        JOIN summary_table st ON fv.field_id = st.field_id
        WHERE st.display_table_name = $1
          AND st.display_server_name = $2
          AND fv.timestamp BETWEEN $3 AND $4
      ),
      aggregated_values AS (
        SELECT 
          timestamp,
          json_agg(jsonb_build_object(
            'display_field_name', display_field_name,
            'field_value', 
            CASE
              WHEN value ~ '^[0-9]+(\\.[0-9]*)?$' THEN 
                (CAST((CAST(value AS numeric) * multiplier) AS text))
              ELSE value
            END,
            'units', units
          )) AS field_values,
          MAX(latitude) AS latitude,
          MAX(longitude) AS longitude
        FROM filtered_values
        GROUP BY timestamp
      )
      SELECT 
        timestamp, 
        field_values,
        latitude,
        longitude
      FROM aggregated_values
      ORDER BY timestamp DESC
      LIMIT $5 OFFSET $6;
    `;

        const result = await pool.query(optimizedQuery, [tableName, serverName, formattedStart, formattedEnd, limit, offset]);

        const totalPages = Math.ceil(totalRecords / limit);

        await res.json({
          rows: result.rows,
          total: totalRecords,
          totalPages: totalPages,
          currentPage: parseInt(page || 1, 10),
          pageSize: limit,
        });
    } catch (error) {
        console.error("Failed to retrieve values for table:", error);
        res.status(500).json({message: "Failed to retrieve values for table"});
    }
});

app.get('/api/summary_table/download', async (req, res) => {
    const {tableName, serverName, startDate, endDate} = req.query;

    try {
        // Fetch the DOI for the site from the site_mapping table
        const doiResult = await pool.query(`
      SELECT doi
      FROM site_mapping
      WHERE display_name = $1
    `, [serverName]);

        const doi = doiResult.rows[0]?.doi || 'DOI not available';

        // Set the response headers for CSV
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${tableName}_${serverName}_data.csv"`);

        // Send the DOI and headers first
        res.write(`# Citation link: ${doi}\n`);

        // Fetch field values and details from the database
        const result = await pool.query(`
      SELECT
        fv.timestamp,
        CASE
          WHEN fv.value ~ '^[0-9]+(\\.[0-9]*)?$' THEN 
            (CAST((CAST(fv.value AS numeric) * CAST(st.multiplier AS numeric)) AS text)) 
          ELSE fv.value
        END AS field_value,
        st.display_field_name,
        st.units,
        st.latitude,
        st.longitude
      FROM field_values fv
      JOIN summary_table st ON fv.field_id = st.field_id
      WHERE st.display_table_name = $1
        AND st.display_server_name = $2
        AND fv.timestamp BETWEEN $3 AND $4
      ORDER BY fv.timestamp ASC
    `, [tableName, serverName, startDate, endDate]);

        // Prepare fields and units data
        const fieldSet = new Set();
        const units = {};
        const dataMap = {};

        // Process data and prepare fields and units
        for (const row of result.rows) {
            const timestamp = new Date(row.timestamp).toLocaleString('en-ZA', {timeZone: 'Africa/Johannesburg'}).replace(',', 'T');

            if (!dataMap[timestamp]) {
                dataMap[timestamp] = {
                    timestamp,
                    latitude: row.latitude,
                    longitude: row.longitude,
                };
            }

            dataMap[timestamp][row.display_field_name] = row.field_value;
            fieldSet.add(row.display_field_name);

            // Set units for each field
            if (!units[row.display_field_name]) {
                units[row.display_field_name] = row.units;
            }
        }

        // Convert field set to an array and sort alphabetically
        const fields = Array.from(fieldSet).sort();

        // Prepare headers and units row
        const headers = ['Timestamp', ...fields, 'Latitude', 'Longitude'];
        const unitsRow = ['', ...fields.map(field => units[field] || ''), '', ''];

        // Stream the headers and units row
        res.write(`${headers.join(',')}\n`);
        res.write(`${unitsRow.join(',')}\n`);

        // Accumulate rows in a buffer
        const bufferSize = 5000; // Number of rows to accumulate before flushing
        let buffer = '';

        for (const entry of Object.values(dataMap)) {
            const row = [
                entry.timestamp,
                ...fields.map(field => entry[field] || ''),
                entry.latitude,
                entry.longitude
            ].join(',');

            // Add the row to the buffer
            buffer += `${row}\n`;

            // Flush the buffer when it reaches the specified size
            if (buffer.length >= bufferSize) {
                res.write(buffer);
                buffer = ''; // Clear the buffer
            }
        }

        // Write any remaining data in the buffer
        if (buffer.length > 0) {
            res.write(buffer);
        }

        res.end(); // End the response after all data is streamed

    } catch (err) {
        console.error('Error while handling download request:', err);
        res.status(500).json({error: 'Internal server error'});
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

app.get('/api/summary_table/locations', async (req, res) => {
    try {
        const result = await pool.query('SELECT display_server_name, latitude, longitude FROM summary_table');
        await res.json(result.rows);
    } catch (err) {
        console.error('Error executing query', err.stack);
        res.status(500).json({error: 'Internal Server Error'});
    }
});

app.get('/api/site_mappings', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM site_mapping');
        await res.json(result.rows);
    } catch (err) {
        console.error('Error fetching site mappings:', err);
        res.status(500).json({message: 'Error fetching site mappings'});
    }
});

app.post('/api/site_mappings/update', async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const {siteMappings} = req.body;
        for (const site of siteMappings) {
            await client.query(`
        UPDATE site_mapping 
        SET display_name = $1, 
            longitude = $2, 
            latitude = $3, 
            altitude = $4,
            description = $5,
            image = $6,
            website_url = $7,
            modal_content = $8,
            citation = $9,  -- New field
            doi = $10       -- New field
        WHERE site_id = $11
      `, [
                site.display_name,
                site.longitude,
                site.latitude,
                site.altitude,
                site.description,
                site.image,
                site.website_url,
                site.modal_content,
                site.citation,      // New field
                site.doi,           // New field
                site.site_id
            ]);

            // Update unified_mapping_table
            await client.query(`
        UPDATE unified_mapping_table
        SET display_server_name = $1, latitude = $2, longitude = $3
        WHERE current_server_name = $4
      `, [
                site.display_name,
                site.latitude,
                site.longitude,
                site.site_name
            ]);
        }

        await client.query('COMMIT');
        res.status(200).json({message: 'Site mappings and unified mapping table updated successfully'});
    } catch (err) {
        console.error('Error updating site mappings and unified mapping table:', err);
        await client.query('ROLLBACK');
        res.status(500).json({message: 'Error updating site mappings and unified mapping table'});
    } finally {
        if (client) {
            client.release();
        }
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
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const {unitsMappings} = req.body;
        for (const unit of unitsMappings) {
            await client.query(
                `UPDATE units_mapping 
          SET phen_name_full = $1, phen_type = $2, phen_name = $3, units = $4, measure = $5, "offset" = $6, var_type = $7, uz_units = $8, uz_measure = $9 
          WHERE id = $10`,
                [
                    unit.phen_name_full,
                    unit.phen_type,
                    unit.phen_name,
                    unit.units,
                    unit.measure,
                    unit.offset,
                    unit.var_type,
                    unit.uz_units,
                    unit.uz_measure,
                    unit.id
                ]
            );

            // Update unified_mapping_table
            await client.query(`
        UPDATE unified_mapping_table
        SET display_field_name = $1, display_units = $2
        WHERE current_field_name = $3
      `, [
                unit.phen_name, // Assuming phen_name should be set as display_field_name
                unit.units,
                unit.uz_phen_name
            ]);
        }

        await client.query('COMMIT');
        res.status(200).json({message: 'Units mappings and unified mapping table updated successfully'});
    } catch (err) {
        console.error('Error updating units mappings and unified mapping table:', err);
        await client.query('ROLLBACK');
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

const calculateDailyDataAvailability = async () => {
    try {
        // Clear the temporary table
        await pool.query(`TRUNCATE TABLE temp_daily_data_availability;`);

        // Fetch periods
        const {rows: periods} = await pool.query(`
      SELECT id, period_name, start_date, end_date 
      FROM availability_periods
    `);

        const endDate = new Date();

        // Fetch unique combinations of server, table, and field names
        const {rows: serverTableCombinations} = await pool.query(`
      SELECT DISTINCT display_server_name, display_table_name, display_field_name 
      FROM summary_table
    `);

        for (const period of periods) {
            for (let currentDate = new Date(period.start_date); currentDate <= endDate; currentDate.setDate(currentDate.getDate() + 1)) {
                const currentDateString = currentDate.toISOString().split('T')[0];

                for (const {display_server_name, display_table_name, display_field_name} of serverTableCombinations) {
                    const availabilityData = await calculateDataAvailability22(currentDateString, currentDateString, display_server_name, display_table_name);

                    const formattedData = availabilityData.map(row => ({
                        ...row,
                        aggregated_timestamp: formatToSAST(row.aggregated_timestamp)
                    }));

                    // Filter only for the specific field, table, and server
                    const relevantData = formattedData.filter(row =>
                        row.display_server_name === display_server_name &&
                        row.display_table_name === display_table_name &&
                        row.display_field_name === display_field_name
                    );

                    let avgAvailability = 0;
                    if (relevantData.length > 0) {
                        const totalAvailability = relevantData.reduce((sum, record) => sum + record.availability_percentage, 0);
                        avgAvailability = totalAvailability / relevantData.length;
                    }

                    await pool.query(`
            INSERT INTO temp_daily_data_availability (display_server_name, display_table_name, display_field_name, date, availability_percentage)
            VALUES ($1, $2, $3, $4, $5);
          `, [display_server_name, display_table_name, display_field_name, currentDateString, avgAvailability]);
                }
            }
        }

        // Insert into daily_data_availability and update if the record exists
        await pool.query(`
      INSERT INTO daily_data_availability (display_server_name, display_table_name, display_field_name, date, availability_percentage, calculated_at)
      SELECT display_server_name, display_table_name, display_field_name, date, availability_percentage, NOW()::timestamptz AT TIME ZONE 'Africa/Johannesburg'
      FROM temp_daily_data_availability
      ON CONFLICT (display_server_name, display_table_name, display_field_name, date)
      DO UPDATE SET 
        availability_percentage = EXCLUDED.availability_percentage,
        calculated_at = EXCLUDED.calculated_at;
    `);

        console.log('Daily data availability calculated and stored successfully.');

        // Update the last synced time
        await pool.query(`
      INSERT INTO last_synced (id, last_data_availability_sync_time)
      VALUES (1, CURRENT_TIMESTAMP)
      ON CONFLICT (id)
      DO UPDATE SET 
        last_data_availability_sync_time = EXCLUDED.last_data_availability_sync_time;
    `);

    } catch (error) {
        console.error('Error calculating and storing daily data availability:', error);
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

const updateSummaryDateRanges = async () => {
    const client = await pool.connect();
    try {
        console.log('Starting to update summary data date ranges...');

        // SQL query to insert or update date ranges with total count
        const query = `
      INSERT INTO summary_data_date_ranges (server_name, table_name, start_date, end_date, total_count, updated_at)
      SELECT 
          st.display_server_name AS server_name,
          st.display_table_name AS table_name,
          MIN(fv.timestamp) AS start_date,
          MAX(fv.timestamp) AS end_date,
          COUNT(*) AS total_count,  -- Calculate total count of records
          NOW() AS updated_at
      FROM field_values fv
      JOIN summary_table st ON fv.field_id = st.field_id
      GROUP BY st.display_server_name, st.display_table_name
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

// Function to calculate one month ago date
function calculateOneMonthAgoDate() {
    const today = new Date();
    const oneMonthAgo = new Date(today.setMonth(today.getMonth() - 1));
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

// Calculate dates
const p1 = calculateOneMonthAgoDate(); // One month ago
const p2 = calculateSixMonthsAgoDate();  // six months ago


//syncServers(p1)
//.then(() => {
//console.log('Sync complete!');
//return populateUnifiedMappingTable();
//})
//.then(() => {
//console.log('Initial unified mapping table population complete!');
//return populateSummaryTable();
//})
//.then(() => {
//console.log('Initial summary table population complete!');
//return updateSiteMapping();
//})
//.then(() => {
//console.log('Initial site table display info complete!');
//return updateUnitsMapping();
//})
//.then(() => {
//console.log('Initial units table population complete!');
//
//// Start truncation and aggregation sequence after initial population steps
//return truncateAvailabilityTables();
//})
//.then(() => {
//console.log('Truncation of availability tables complete!');
//return calculateDailyDataAvailability();
//})
//.then(() => {
//console.log('Calculation of daily data availability complete!');
//return aggregateWeeklyDataAvailability(); // Run weekly after daily
//})
//.then(() => {
//console.log('Aggregation of weekly data availability complete!');
//return aggregateMonthlyDataAvailability(); // Run monthly after weekly
//})
//.then(() => {
//console.log('Aggregation of monthly data availability complete!');
//return aggregateYearlyDataAvailability(); // Run yearly after monthly
//})
//.then(() => {
//console.log('Aggregation of yearly data availability complete!');
//})
//.catch((error) => {
//console.error('Error during the sequence:', error);
//});

//updateSummaryDateRanges()

calculateDailyDataAvailability()
    .then(() => {
        console.log('Calculation of daily data availability complete!');
        return aggregateWeeklyDataAvailability(); // Run weekly after daily
    })
    .then(() => {
        console.log('Aggregation of weekly data availability complete!');
        return aggregateMonthlyDataAvailability(); // Run monthly after weekly
    })
    .then(() => {
        console.log('Aggregation of monthly data availability complete!');
        return aggregateYearlyDataAvailability(); // Run yearly after monthly
    })
    .then(() => {
        console.log('Aggregation of yearly data availability complete!');
    })
    .catch((error) => {
        console.error('Error during the sequence:', error);
    });


// Daily job at 11 PM for "one month ago" sync
cron.schedule('0 23 * * 1-6', async () => {
    try {
        console.log('Starting the server sync for one month ago at 11 PM...');
        await syncServers(p1); // Use one month ago date
        console.log('One month ago server sync completed successfully.');

        // Run the update functions after syncServers
        await updateDateRanges();
        await updateSummaryDateRanges();
    } catch (error) {
        console.error('Error during monthly one month ago sync:', error);
    }
});

// Yearly job every Sunday at 8 PM
cron.schedule('0 20 * * 0', async () => {
    try {
        console.log('Starting the server sync for one year ago at 8 PM on Sunday...');
        await syncServers(p2); // Use one year ago date
        console.log('One year ago server sync completed successfully.');

        // Run the update functions after syncServers
        await updateDateRanges();
        await updateSummaryDateRanges();
    } catch (error) {
        console.error('Error during weekly one year ago sync:', error);
    }
});

// Hourly Cron Job for other operations
cron.schedule('0 * * * *', async () => {
    console.log('Running hourly update of field values summary...');
    await updateFieldValuesSummary();
});

// 1:00 AM - Sync for Unified Mapping Table
cron.schedule('0 1 * * *', async () => {
    try {
        console.log('Starting the unifiedmapping sync...');
        await populateUnifiedMappingTable();
        console.log('Unifiedmapping sync completed successfully.');
    } catch (error) {
        console.error('Error during unifiedmapping sync:', error);
    }
});

// 2:00 AM - Sync for Summary Table
cron.schedule('0 2 * * *', async () => {
    try {
        console.log('Starting the populatesummarytable sync...');
        await populateSummaryTable();
        console.log('populatesummarytable sync completed successfully.');
    } catch (error) {
        console.error('Error during populatesummarytable sync:', error);
    }
});

// 2:00 AM - Update Units Mapping
cron.schedule('0 2 * * *', async () => {
    console.log('Running cron job to update units mapping...');
    await updateUnitsMapping();
});

// 3:00 AM - Update Site Mapping
cron.schedule('0 3 * * *', async () => {
    console.log('Running cron job to update site mapping...');
    await updateSiteMapping();
});

// 4:00 AM - Data Availability Calculations
cron.schedule('0 4 * * *', async () => {
    try {
        await calculateDailyDataAvailability();
        console.log('Calculation of daily data availability complete!');

        await aggregateWeeklyDataAvailability();
        console.log('Aggregation of weekly data availability complete!');

        await aggregateMonthlyDataAvailability();
        console.log('Aggregation of monthly data availability complete!');

        await aggregateYearlyDataAvailability();
        console.log('Aggregation of yearly data availability complete!');
    } catch (error) {
        console.error('Error during the aggregation process:', error);
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server started on http://0.0.0.0:${port}`);
});

