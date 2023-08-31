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

app.get('/api/vasi-science-centre-aws/latest-day-battv', async (req, res) => {
  const interval = req.params.interval;
  const query = `
    SELECT time, battv 
    FROM cr1000_vasi_science_centre_aws.public
    WHERE time >= (
        SELECT MAX(time) - INTERVAL '3 days' FROM cr1000_vasi_science_centre_aws.public
    )
    ORDER BY time;
  `;

  try {
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});
app.get(`/api/vasi-science-centre-aws/:interval-data`, async (req, res) => {
  const interval = req.params.interval;
    const limit = req.query.limit ? parseInt(req.query.limit) : null;
    let query = `SELECT * FROM cr1000_vasi_science_centre_aws.${interval} ORDER BY time DESC`;
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
app.get(`/api/vasi-science-centre-aws/:interval-metadata`, async (req, res) => {
    try {
      const interval = req.params.interval;
      const metadataResult = await pool.query(`SELECT name, units FROM cr1000_vasi_science_centre_aws.${interval}_metadata`);
      const names = metadataResult.rows.map(row => row.name);
      const units = metadataResult.rows.map(row => row.units);
      names.unshift("Time");
      units.unshift("");
      const metaData = {
        name: names,
        units: units
      };
      res.json(metaData);
    } catch (error) {
      console.error('Error fetching metadata:', error);
      res.status(500).send('Error fetching metadata');
    }
  });
app.get(`/api/vasi-science-centre-aws/:interval-count`, async (req, res) => {
  const interval = req.params.interval;
    const query = `SELECT COUNT(*) FROM cr1000_vasi_science_centre_aws.${interval}`;
    try {
      const result = await pool.query(query);
      res.json(parseInt(result.rows[0].count));
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    }
  });
app.get(`/api/vasi-science-centre-aws/download-:interval-csv`, async (req, res) => {
  const interval = req.params.interval;
    try {
      const result = await pool.query(`SELECT * FROM cr1000_vasi_science_centre_aws.${interval} ORDER BY time DESC`);
      const data = result.rows;

      const headersResult = await pool.query(`SELECT name FROM cr1000_vasi_science_centre_aws.${interval}_metadata`);
      const headers = headersResult.rows.map(row => ({ id: row.name.toLowerCase(), title: row.name }));

      headers.unshift({ id: 'time', title: 'Time' });

      const unitsResult = await pool.query(`SELECT units FROM cr1000_vasi_science_centre_aws.${interval}_metadata`);
      const units = unitsResult.rows.map(row => row.units);

      units.unshift("");

      const csvStringifier = createCsvStringifier({ header: headers });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=cr1000_vasi_science_centre_aws_${interval}.csv`);

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

app.get(`/api/besemfontein/:interval-data`, async (req, res) => {
  const interval = req.params.interval;
  const limit = req.query.limit ? parseInt(req.query.limit) : null;
  let query = `SELECT * FROM cr1000_besemfontein.${interval} ORDER BY time DESC`;
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
app.get(`/api/besemfontein/:interval-metadata`, async (req, res) => {
  try {
    const interval = req.params.interval;
    const metadataResult = await pool.query(`SELECT name, units FROM cr1000_besemfontein.${interval}_metadata`);
    const names = metadataResult.rows.map(row => row.name);
    const units = metadataResult.rows.map(row => row.units);
    names.unshift("Time");
    units.unshift("");
    const metaData = {
      name: names,
      units: units
    };
    res.json(metaData);
  } catch (error) {
    console.error('Error fetching metadata:', error);
    res.status(500).send('Error fetching metadata');
  }
});
app.get(`/api/besemfontein/:interval-count`, async (req, res) => {
  const interval = req.params.interval;
  const query = `SELECT COUNT(*) FROM cr1000_besemfontein.${interval}`;
  try {
    const result = await pool.query(query);
    res.json(parseInt(result.rows[0].count));
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});
app.get(`/api/besemfontein/download-:interval-csv`, async (req, res) => {
  const interval = req.params.interval;
  try {
    const result = await pool.query(`SELECT * FROM cr1000_besemfontein.${interval} ORDER BY time DESC`);
    const data = result.rows;

    const headersResult = await pool.query(`SELECT name FROM cr1000_besemfontein.${interval}_metadata`);
    const headers = headersResult.rows.map(row => ({ id: row.name.toLowerCase(), title: row.name }));

    headers.unshift({ id: 'time', title: 'Time' });

    const unitsResult = await pool.query(`SELECT units FROM cr1000_besemfontein.${interval}_metadata`);
    const units = unitsResult.rows.map(row => row.units);

    units.unshift("");

    const csvStringifier = createCsvStringifier({ header: headers });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; cr1000_besemfontein${interval}.csv`);

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
app.get('/api/besemfontein/latest-day-battv', async (req, res) => {
  const query = `
    SELECT time, battv 
    FROM cr1000_besemfontein.public
    WHERE time >= (
        SELECT MAX(time) - INTERVAL '3 days' FROM cr1000_besemfontein.public
    )
    ORDER BY time;
  `;

  try {
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});


app.get(`/api/cr1000-cath-peak-high-alt-aws/:interval-data`, async (req, res) => {
  const interval = req.params.interval;
  const limit = req.query.limit ? parseInt(req.query.limit) : null;
  let query = `SELECT * FROM cr1000_cath_peak_high_alt_aws.${interval} ORDER BY time DESC`;
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
app.get(`/api/cr1000-cath-peak-high-alt-aws/:interval-metadata`, async (req, res) => {
  try {
    const interval = req.params.interval;
    const metadataResult = await pool.query(`SELECT name, units FROM cr1000_cath_peak_high_alt_aws.${interval}_metadata`);
    const names = metadataResult.rows.map(row => row.name);
    const units = metadataResult.rows.map(row => row.units);
    names.unshift("Time");
    units.unshift("");
    const metaData = {
      name: names,
      units: units
    };
    res.json(metaData);
  } catch (error) {
    console.error('Error fetching metadata:', error);
    res.status(500).send('Error fetching metadata');
  }
});
app.get(`/api/cr1000-cath-peak-high-alt-aws/:interval-count`, async (req, res) => {
  const interval = req.params.interval;
  const query = `SELECT COUNT(*) FROM cr1000_cath_peak_high_alt_aws.${interval}`;
  try {
    const result = await pool.query(query);
    res.json(parseInt(result.rows[0].count));
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});
app.get(`/api/cr1000-cath-peak-high-alt-aws/download-:interval-csv`, async (req, res) => {
  const interval = req.params.interval;
  try {
    const result = await pool.query(`SELECT * FROM cr1000_cath_peak_high_alt_aws.${interval} ORDER BY time DESC`);
    const data = result.rows;

    const headersResult = await pool.query(`SELECT name FROM cr1000_cath_peak_high_alt_aws.${interval}_metadata`);
    const headers = headersResult.rows.map(row => ({ id: row.name.toLowerCase(), title: row.name }));

    headers.unshift({ id: 'time', title: 'Time' });

    const unitsResult = await pool.query(`SELECT units FROM cr1000_cath_peak_high_alt_aws.${interval}_metadata`);
    const units = unitsResult.rows.map(row => row.units);

    units.unshift("");

    const csvStringifier = createCsvStringifier({ header: headers });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; cr1000_cath_peak_high_alt_aws${interval}.csv`);

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
app.get('/api/cr1000-cath-peak-high-alt-aws/latest-day-battv', async (req, res) => {
  const query = `
    SELECT time, battv 
    FROM cr1000_cath_peak_high_alt_aws.public
    WHERE time >= (
        SELECT MAX(time) - INTERVAL '3 days' FROM cr1000_cath_peak_high_alt_aws.public
    )
    ORDER BY time;
  `;

  try {
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.get(`/api/cr1000-cath-peak-mikes-pass-aws/:interval-data`, async (req, res) => {
  const interval = req.params.interval;
  const limit = req.query.limit ? parseInt(req.query.limit) : null;
  let query = `SELECT * FROM cr1000_cath_peak_mikes_pass_aws.${interval} ORDER BY time DESC`;
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
app.get(`/api/cr1000-cath-peak-mikes-pass-aws/:interval-metadata`, async (req, res) => {
  try {
    const interval = req.params.interval;
    const metadataResult = await pool.query(`SELECT name, units FROM cr1000_cath_peak_mikes_pass_aws.${interval}_metadata`);
    const names = metadataResult.rows.map(row => row.name);
    const units = metadataResult.rows.map(row => row.units);
    names.unshift("Time");
    units.unshift("");
    const metaData = {
      name: names,
      units: units
    };
    res.json(metaData);
  } catch (error) {
    console.error('Error fetching metadata:', error);
    res.status(500).send('Error fetching metadata');
  }
});
app.get(`/api/cr1000-cath-peak-mikes-pass-aws/:interval-count`, async (req, res) => {
  const interval = req.params.interval;
  const query = `SELECT COUNT(*) FROM cr1000_cath_peak_mikes_pass_aws.${interval}`;
  try {
    const result = await pool.query(query);
    res.json(parseInt(result.rows[0].count));
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});
app.get(`/api/cr1000-cath-peak-mikes-pass-aws/download-:interval-csv`, async (req, res) => {
  const interval = req.params.interval;
  try {
    const result = await pool.query(`SELECT * FROM cr1000_cath_peak_mikes_pass_aws.${interval} ORDER BY time DESC`);
    const data = result.rows;

    const headersResult = await pool.query(`SELECT name FROM cr1000_cath_peak_mikes_pass_aws.${interval}_metadata`);
    const headers = headersResult.rows.map(row => ({ id: row.name.toLowerCase(), title: row.name }));

    headers.unshift({ id: 'time', title: 'Time' });

    const unitsResult = await pool.query(`SELECT units FROM cr1000_cath_peak_mikes_pass_aws.${interval}_metadata`);
    const units = unitsResult.rows.map(row => row.units);

    units.unshift("");

    const csvStringifier = createCsvStringifier({ header: headers });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; cr1000_cath_peak_mikes_pass_aws${interval}.csv`);

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
app.get('/api/cr1000-cath-peak-mikes-pass-aws/latest-day-battv', async (req, res) => {
  const query = `
    SELECT time, battv 
    FROM cr1000_cath_peak_mikes_pass_aws.public
    WHERE time >= (
        SELECT MAX(time) - INTERVAL '3 days' FROM cr1000_cath_peak_mikes_pass_aws.public
    )
    ORDER BY time;
  `;

  try {
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.get(`/api/constantiaberg/:interval-data`, async (req, res) => {
  const interval = req.params.interval;
  const limit = req.query.limit ? parseInt(req.query.limit) : null;
  let query = `SELECT * FROM constantiaberg.${interval} ORDER BY time DESC`;
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
app.get(`/api/constantiaberg/:interval-metadata`, async (req, res) => {
  try {
    const interval = req.params.interval;
    const metadataResult = await pool.query(`SELECT name, units FROM constantiaberg.${interval}_metadata`);
    const names = metadataResult.rows.map(row => row.name);
    const units = metadataResult.rows.map(row => row.units);
    names.unshift("Time");
    units.unshift("");
    const metaData = {
      name: names,
      units: units
    };
    res.json(metaData);
  } catch (error) {
    console.error('Error fetching metadata:', error);
    res.status(500).send('Error fetching metadata');
  }
});
app.get(`/api/constantiaberg/:interval-count`, async (req, res) => {
  const interval = req.params.interval;
  const query = `SELECT COUNT(*) FROM constantiaberg.${interval}`;
  try {
    const result = await pool.query(query);
    res.json(parseInt(result.rows[0].count));
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});
app.get(`/api/constantiaberg/download-:interval-csv`, async (req, res) => {
  const interval = req.params.interval;
  try {
    const result = await pool.query(`SELECT * FROM constantiaberg.${interval} ORDER BY time DESC`);
    const data = result.rows;

    const headersResult = await pool.query(`SELECT name FROM constantiaberg.${interval}_metadata`);
    const headers = headersResult.rows.map(row => ({ id: row.name.toLowerCase(), title: row.name }));

    headers.unshift({ id: 'time', title: 'Time' });

    const unitsResult = await pool.query(`SELECT units FROM constantiaberg.${interval}_metadata`);
    const units = unitsResult.rows.map(row => row.units);

    units.unshift("");

    const csvStringifier = createCsvStringifier({ header: headers });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; constantiaberg${interval}.csv`);

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
app.get('/api/constantiaberg/latest-day-battv', async (req, res) => {
  const query = `
    SELECT time, battv 
    FROM constantiaberg.public
    WHERE time >= (
        SELECT MAX(time) - INTERVAL '3 days' FROM constantiaberg.public
    )
    ORDER BY time;
  `;

  try {
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});
app.get('/api/constantiaberg/table2-battv', async (req, res) => {
  const query = `
    SELECT time, battv_min 
    FROM constantiaberg.table2
    WHERE time >= (
        SELECT MAX(time) - INTERVAL '3 days' FROM constantiaberg.table2
    )
    ORDER BY time;
  `;

  try {
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.get(`/api/cr1000-dwarsberg-jonkershoek/:interval-data`, async (req, res) => {
  const interval = req.params.interval;
  const limit = req.query.limit ? parseInt(req.query.limit) : null;
  let query = `SELECT * FROM cr1000_dwarsberg_jonkershoek.${interval} ORDER BY time DESC`;
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
app.get(`/api/cr1000-dwarsberg-jonkershoek/:interval-metadata`, async (req, res) => {
  try {
    const interval = req.params.interval;
    const metadataResult = await pool.query(`SELECT name, units FROM cr1000_dwarsberg_jonkershoek.${interval}_metadata`);
    const names = metadataResult.rows.map(row => row.name);
    const units = metadataResult.rows.map(row => row.units);
    names.unshift("Time");
    units.unshift("");
    const metaData = {
      name: names,
      units: units
    };
    res.json(metaData);
  } catch (error) {
    console.error('Error fetching metadata:', error);
    res.status(500).send('Error fetching metadata');
  }
});
app.get(`/api/cr1000-dwarsberg-jonkershoek/:interval-count`, async (req, res) => {
  const interval = req.params.interval;
  const query = `SELECT COUNT(*) FROM cr1000_dwarsberg_jonkershoek.${interval}`;
  try {
    const result = await pool.query(query);
    res.json(parseInt(result.rows[0].count));
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});
app.get(`/api/cr1000-dwarsberg-jonkershoek/download-:interval-csv`, async (req, res) => {
  const interval = req.params.interval;
  try {
    const result = await pool.query(`SELECT * FROM cr1000_dwarsberg_jonkershoek.${interval} ORDER BY time DESC`);
    const data = result.rows;

    const headersResult = await pool.query(`SELECT name FROM cr1000_dwarsberg_jonkershoek.${interval}_metadata`);
    const headers = headersResult.rows.map(row => ({ id: row.name.toLowerCase(), title: row.name }));

    headers.unshift({ id: 'time', title: 'Time' });

    const unitsResult = await pool.query(`SELECT units FROM cr1000_dwarsberg_jonkershoek.${interval}_metadata`);
    const units = unitsResult.rows.map(row => row.units);

    units.unshift("");

    const csvStringifier = createCsvStringifier({ header: headers });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; cr1000_dwarsberg_jonkershoek${interval}.csv`);

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
app.get('/api/cr1000-dwarsberg-jonkershoek/latest-day-battv', async (req, res) => {
  const query = `
    SELECT time, battv 
    FROM cr1000_dwarsberg_jonkershoek.public
    WHERE time >= (
        SELECT MAX(time) - INTERVAL '3 days' FROM cr1000_dwarsberg_jonkershoek.public
    )
    ORDER BY time;
  `;

  try {
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});



app.listen(port, '0.0.0.0', () => {
  console.log(`Server started on http://0.0.0.0:${port}`);
});

