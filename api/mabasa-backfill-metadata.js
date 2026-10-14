// Called inside the import transaction: failure rolls observations and metadata back together.
async function refreshMabasaMetadata(client, tableId, valueRows) {
 const ids=[...new Set(valueRows.map(v=>v.fieldId))];
 const days=[...new Set(valueRows.map(v=>new Date(v.timestamp.getTime()+7200000).toISOString().slice(0,10)))].sort();
 await client.query(`CREATE TEMP TABLE mabasa_backfill_keys ON COMMIT DROP AS
  SELECT display_server_name,display_table_name,display_field_name,
         min(CASE WHEN aggregation_type ~ '^\\d+$' THEN aggregation_type::int END) AS minutes
  FROM summary_table WHERE field_id=ANY($1::uuid[])
   AND display_server_name IS NOT NULL AND display_table_name IS NOT NULL AND display_field_name IS NOT NULL
  GROUP BY display_server_name,display_table_name,display_field_name`,[ids]);
 await client.query('DELETE FROM mabasa_backfill_keys WHERE minutes IS NULL OR minutes<=0');
 const {rows:references}=await client.query(`SELECT DISTINCT s.field_id FROM summary_table s
  JOIN mabasa_backfill_keys k USING(display_server_name,display_table_name,display_field_name) WHERE s.field_id IS NOT NULL`);
 const mappedIds=references.map(r=>r.field_id);
 const daily=await client.query(`WITH counts AS (
  SELECT s.display_server_name,s.display_table_name,s.display_field_name,
   (fv.timestamp AT TIME ZONE 'Africa/Johannesburg')::date AS date,
   count(DISTINCT fv.timestamp) AS total_records,
   count(DISTINCT fv.timestamp) FILTER(WHERE fv.value IS NOT NULL AND btrim(fv.value)<>''
    AND upper(btrim(fv.value)) NOT IN ('NA','NAN','NULL','INF','INFINITY','-INF','-INFINITY')) AS available_records
  FROM field_values fv JOIN summary_table s USING(field_id)
  JOIN mabasa_backfill_keys k USING(display_server_name,display_table_name,display_field_name)
  WHERE fv.field_id=ANY($1::uuid[])
   AND fv.timestamp >= ($2::date::timestamp AT TIME ZONE 'Africa/Johannesburg')
   AND fv.timestamp < (($3::date+1)::timestamp AT TIME ZONE 'Africa/Johannesburg')
   AND (fv.timestamp AT TIME ZONE 'Africa/Johannesburg')::date=ANY($4::date[])
  GROUP BY s.display_server_name,s.display_table_name,s.display_field_name,(fv.timestamp AT TIME ZONE 'Africa/Johannesburg')::date
 ) INSERT INTO daily_data_availability(display_server_name,display_table_name,display_field_name,date,total_records,available_records,availability_percentage,calculated_at)
 SELECT k.display_server_name,k.display_table_name,k.display_field_name,d.date,coalesce(c.total_records,0),coalesce(c.available_records,0),
  least(100,coalesce(c.available_records,0)::numeric/(1440.0/k.minutes)*100),now()
 FROM mabasa_backfill_keys k CROSS JOIN unnest($4::date[]) d(date)
 LEFT JOIN counts c USING(display_server_name,display_table_name,display_field_name,date)
 ON CONFLICT(display_server_name,display_table_name,display_field_name,date) DO UPDATE SET
 total_records=EXCLUDED.total_records,available_records=EXCLUDED.available_records,availability_percentage=EXCLUDED.availability_percentage,calculated_at=now()`,
 [mappedIds,days[0],days[days.length-1],days]);
 const periods={};
 for(const [unit,table,column] of [['week','weekly_data_availability','week_start_date'],['month','monthly_data_availability','month_start_date'],['year','yearly_data_availability','year_start_date']]){
  // Table/column names are fixed literals above, never user input.
  const result=await client.query(`INSERT INTO ${table}(display_server_name,display_table_name,display_field_name,${column},availability_percentage)
   SELECT d.display_server_name,d.display_table_name,d.display_field_name,date_trunc('${unit}',d.date)::date,avg(d.availability_percentage)
   FROM daily_data_availability d JOIN mabasa_backfill_keys k USING(display_server_name,display_table_name,display_field_name)
   WHERE date_trunc('${unit}',d.date)::date IN (SELECT DISTINCT date_trunc('${unit}',v)::date FROM unnest($1::date[]) t(v))
   GROUP BY d.display_server_name,d.display_table_name,d.display_field_name,date_trunc('${unit}',d.date)::date
   ON CONFLICT(display_server_name,display_table_name,display_field_name,${column}) DO UPDATE SET
   availability_percentage=EXCLUDED.availability_percentage,calculated_at=now()`,[days]);
  periods[unit]=result.rowCount;
 }
 await client.query(`INSERT INTO raw_data_date_ranges(table_id,start_date,end_date,updated_at)
  SELECT $1::uuid,min(fv.timestamp),max(fv.timestamp),now() FROM field_values fv
  WHERE fv.field_id IN(SELECT field_id FROM server_table_fields WHERE table_id=$1::uuid)
  ON CONFLICT(table_id) DO UPDATE SET start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,updated_at=now()`,[tableId]);
 await client.query(`INSERT INTO summary_data_date_ranges(server_name,table_name,start_date,end_date,total_count,updated_at)
  SELECT d.display_server_name,d.display_table_name,min(d.date)::timestamp,max(d.date)::timestamp,sum(d.available_records)::int,now()
  FROM daily_data_availability d WHERE d.available_records>0 AND (d.display_server_name,d.display_table_name) IN
   (SELECT display_server_name,display_table_name FROM mabasa_backfill_keys)
  GROUP BY d.display_server_name,d.display_table_name
  ON CONFLICT(server_name,table_name) DO UPDATE SET
   start_date=least(summary_data_date_ranges.start_date,EXCLUDED.start_date),end_date=greatest(summary_data_date_ranges.end_date,EXCLUDED.end_date),updated_at=now()`);
 return {days:days.length,dailyRows:daily.rowCount,periodRows:periods};
}
module.exports={refreshMabasaMetadata};
