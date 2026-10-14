const {Transform} = require('node:stream');
const {pipeline} = require('node:stream/promises');
const {startDownload, updateDownload} = require('./download-progress');

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatSastTimestamp(value) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const p = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

function createTableDownloadHandler({pool, QueryStream, logger = console}) {
  return async (req, res) => {
    const {tableId} = req.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tableId)) {
      return res.status(400).json({error: 'Invalid table ID'});
    }
    let client;
    const progress = startDownload(req.query?.downloadId);
    try {
      client = await pool.connect();
      const table = await client.query(`
        SELECT st.table_name, s.name AS server_name
        FROM server_tables st JOIN servers s ON st.server_id = s.server_id
        WHERE st.table_id = $1 LIMIT 1`, [tableId]);
      if (!table.rows.length) {
        updateDownload(progress, {status: 'error', message: 'Table not found'});
        return res.status(404).json({message: 'Table not found'});
      }
      const {table_name: tableName, server_name: siteName} = table.rows[0];
      const metadata = await client.query(`
        SELECT field_id, field_name, units FROM server_table_fields
        WHERE table_id = $1 ORDER BY field_name`, [tableId]);
      const fields = metadata.rows.map(row => row.field_name).sort();
      const fieldIds = metadata.rows.map(row => row.field_id);
      const units = Object.fromEntries(metadata.rows.map(row => [row.field_name, row.units]));
      const headers = ['timestamp', ...fields].map(csvCell).join(',') + '\n'
        + ['', ...fields.map(field => units[field])].map(csvCell).join(',') + '\n';
      const query = new QueryStream(`
        SELECT fv.timestamp,
          JSON_AGG(JSON_BUILD_OBJECT('field_name', sf.field_name, 'value', fv.value)) AS fields
        FROM field_values fv JOIN server_table_fields sf ON fv.field_id = sf.field_id
        WHERE fv.field_id = ANY($1::uuid[])
        GROUP BY fv.timestamp ORDER BY fv.timestamp ASC`, [fieldIds]);
      const stream = client.query(query);
      let wroteHeaders = false;
      const csv = new Transform({
        objectMode: true,
        transform(row, encoding, callback) {
          try {
            if (!wroteHeaders) {
              this.push(headers); wroteHeaders = true;
              updateDownload(progress, {status: 'streaming', bytes: Buffer.byteLength(headers)});
            }
            const values = Object.fromEntries(row.fields.map(field => [field.field_name, field.value]));
            const line = [formatSastTimestamp(row.timestamp), ...fields.map(field => values[field])]
              .map(csvCell).join(',') + '\n';
            updateDownload(progress, {rows: (progress?.rows || 0) + 1, bytes: (progress?.bytes || 0) + Buffer.byteLength(line)});
            callback(null, line);
          } catch (error) { callback(error); }
        },
        flush(callback) {
          if (!wroteHeaders) {
            this.push(headers);
            updateDownload(progress, {bytes: Buffer.byteLength(headers)});
          }
          callback();
        },
      });
      res.setHeader('Content-Disposition', `attachment; filename="${tableName}_${siteName}_data.csv"`);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('X-CSV-Source', 'dynamic-raw-table');
      res.setHeader('X-CSV-Timezone', 'Africa/Johannesburg');
      res.setHeader('Cache-Control', 'no-store');
      logger.log(`Generating dynamic SAST CSV for table: ${tableName}, site: ${siteName}`);
      await pipeline(stream, csv, res);
      updateDownload(progress, {status: 'complete'});
    } catch (error) {
      updateDownload(progress, {status: 'error', message: error.code === 'ERR_STREAM_PREMATURE_CLOSE' ? 'Download interrupted. Please retry.' : 'Download failed. Please retry.'});
      logger.error('Failed to download table data:', error);
      if (!res.headersSent && !res.destroyed) res.status(500).json({message: 'Failed to download data'});
      else if (!res.destroyed) res.destroy(error);
    } finally {
      if (client) client.release();
    }
  };
}

module.exports = {createTableDownloadHandler, formatSastTimestamp};
