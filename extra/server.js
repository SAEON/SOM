const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const { Readable } = require('stream');
const createCsvStringifier = require('csv-writer').createObjectCsvStringifier;


const app = express();
const port = 3001;



// Allow CORS for all routes
app.use(cors());

const pool = new Pool({
  user: 'saeon',
  host: 'localhost',
  database: 'loggernet',
  password: 'jordan',
  port: 5432,
});

app.get('/api/get_vasi_science_centre_aws_daily_data', async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit) : null;
  let query = 'SELECT * FROM cr1000_vasi_science_centre_aws.daily ORDER BY time DESC';
  if (limit) {
    query += ` LIMIT ${limit}`;
  }

  try {
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.get('/api/get_vasi_science_centre_aws_getdailycount', async (req, res) => {
  const query = 'SELECT COUNT(*) FROM cr1000_vasi_science_centre_aws.daily';

  try {
    const result = await pool.query(query);
    // Send the count as a plain number
    res.json(parseInt(result.rows[0].count));
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});
app.get('/api/download_vasi_science_centre_aws_dailycsv', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cr1000_vasi_science_centre_aws.daily ORDER BY time DESC');
    const data = result.rows;
    const csvStringifier = createCsvStringifier({
      header: [
        { id: 'time', title: 'Time' },
        { id: 'ws_ms_s_wvt', title: 'WS MS S WVT' },
        { id: 'winddir_d1_wvt', title: 'Winddir D1 WVT' },
        { id: 'winddir_sd1_wvt', title: 'WindDir_SD1_WVT' },
        { id: 'ws_ms_max', title: 'WS_ms_Max' },
        { id: 'airtc_min', title: 'AirTC_Min' },
        { id: 'airtc_max', title: 'AirTC_Max' },
        { id: 'rh_min', title: 'RH_Min' },
        { id: 'rh_max', title: 'RH_Max' },
        { id: 'slrw_max', title: 'SlrW_Max' },
        { id: 'slrw_std', title: 'SlrW_Std' },
        { id: 'cuv5_w_max', title: 'CUV5_W_Max' },
        { id: 'cuv5_w_std', title: 'CUV5_W_Std' },
        { id: 'cuv5_mj_tot', title: 'CUV5_MJ_Tot' },
        { id: 'rain_mm_tot', title: 'Rain_mm_Tot' },
        { id: 't107_c_min', title: 'T107_C_Min' },
        { id: 't107_c_avg', title: 'T107_C_Avg' },
        { id: 'vw_avg', title: 'VW_Avg' }
      ]
    });
    const units = [
      "", "meters/second", "Deg", "Deg", "meters/second", "Deg C",
      "Deg C", "%", "%", "W/m^2", "W/m^2", "W/m^2", "W/m^2", "MJ/m^2",
      "mm", "Deg C", "Deg C", ""
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=vasi_science_centre_aws_daily.csv');

    const readable = new Readable({
      read() {
        // Push header first
        this.push(csvStringifier.getHeaderString());

        // Push units after headers
        this.push(units.join(",") + "\n");

        // Push data records
        data.forEach(record => {
          this.push(csvStringifier.stringifyRecords([record]));
        });

        // Indicate end of readable stream
        this.push(null);
      }
    });

    readable.pipe(res);
  } catch (error) {
    console.error('Error generating CSV:', error);
    res.status(500).send('Error generating CSV');
  }
});

app.get('/api/get_vasi_science_centre_aws_hourly_data', async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit) : null;
  let query = 'SELECT * FROM cr1000_vasi_science_centre_aws.hourly ORDER BY time DESC';
  if (limit) {
    query += ` LIMIT ${limit}`;
  }

  try {
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.get('/api/get_vasi_science_centre_aws_gethourlycount', async (req, res) => {
  const query = 'SELECT COUNT(*) FROM cr1000_vasi_science_centre_aws.hourly';

  try {
    const result = await pool.query(query);
    // Send the count as a plain number
    res.json(parseInt(result.rows[0].count));
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.get('/api/download_vasi_science_centre_aws_hourly_csv', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cr1000_vasi_science_centre_aws.hourly ORDER BY time DESC');
    const data = result.rows;
    const csvStringifier = createCsvStringifier({
      header: [
        { id: 'time', title: 'Time' },
        { id: 'battv_min', title: 'BattV_Min' },
        { id: 'bp_kpa', title: 'BP_kPa' },
        { id: 'ws_ms_s_wvt', title: 'WS_ms_S_WVT' },
        { id: 'winddir_d1_wvt', title: 'WindDir_D1_WVT' },
        { id: 'winddir_sd1_wvt', title: 'WindDir_SD1_WVT' },
        { id: 'airtc_avg', title: 'AirTC_Avg' },
        { id: 'rh', title: 'RH' },
        { id: 'slrw_avg', title: 'SlrW_Avg' },
        { id: 'cuv5_w_avg', title: 'CUV5_W_Avg' },
        { id: 'rain_mm_tot', title: 'Rain_mm_Tot' },
        { id: 't107_c_min', title: 'T107_C_Min' },
        { id: 't107_c_avg', title: 'T107_C_Avg' },
        { id: 'vw_avg', title: 'VW_Avg' }
      ]
    });

    const units = [
      "", "Volts", "kPa", "meters/second", "Deg", "Deg", "Deg C", "%", "W/m^2", "W/m^2", "mm", "Deg C", "Deg C", ""
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=vasi_science_centre_aws_hourly.csv');

    const readable = new Readable({
      read() {
        this.push(csvStringifier.getHeaderString());
        this.push(units.join(",") + "\n");
        data.forEach(record => {
          this.push(csvStringifier.stringifyRecords([record]));
        });
        this.push(null);
      }
    });

    readable.pipe(res);
  } catch (error) {
    console.error('Error generating CSV:', error);
    res.status(500).send('Error generating CSV');
  }
});


// New Five Min API Functions
app.get('/api/get_vasi_science_centre_aws_five_min_data', async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit) : null;
  let query = 'SELECT * FROM cr1000_vasi_science_centre_aws.five_min ORDER BY time DESC';
  if (limit) {
    query += ` LIMIT ${limit}`;
  }

  try {
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});
app.get('/api/get_vasi_science_centre_aws_getfivemincount', async (req, res) => {
  const query = 'SELECT COUNT(*) FROM cr1000_vasi_science_centre_aws.five_min';

  try {
    const result = await pool.query(query);
    // Send the count as a plain number
    res.json(parseInt(result.rows[0].count));
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});
app.get('/api/download_vasi_science_centre_aws_five_mincsv', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cr1000_vasi_science_centre_aws.five_min ORDER BY time DESC');
    const data = result.rows;
    const csvStringifier = createCsvStringifier({
      header: [
        { id: 'time', title: 'Time' },
        { id: 'ws_ms_s_wvt', title: 'WS_ms_S_WVT' },
        { id: 'winddir_d1_wvt', title: 'WindDir_D1_WVT' },
        { id: 'winddir_sd1_wvt', title: 'WindDir_SD1_WVT' },
        { id: 'airtc_avg', title: 'AirTC_Avg' },
        { id: 'rh', title: 'RH' },
        { id: 'slrw_avg', title: 'SlrW_Avg' },
        { id: 'cuv5_w_avg', title: 'CUV5_W_Avg' },
        { id: 'rain_mm_tot', title: 'Rain_mm_Tot' },
        { id: 't107_c_avg', title: 'T107_C_Avg' }
      ]
    });

    const units = [
      "",
      "meters/second",
      "Deg",
      "Deg",
      "Deg C",
      "%",
      "W/m^2",
      "W/m^2",
      "mm",
      "Deg C"
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=vasi_science_centre_aws_five_min.csv');

    const readable = new Readable({
      read() {
        // Push header first
        this.push(csvStringifier.getHeaderString());

        // Push units after headers
        this.push(units.join(",") + "\n");

        // Push data records
        data.forEach(record => {
          this.push(csvStringifier.stringifyRecords([record]));
        });

        // Indicate end of readable stream
        this.push(null);
      }
    });

    readable.pipe(res);
  } catch (error) {
    console.error('Error generating CSV:', error);
    res.status(500).send('Error generating CSV');
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server started on http://0.0.0.0:${port}`);
});

