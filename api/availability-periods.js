async function refreshAvailabilityPeriods(pool,monthsBack) {
 const cutoff=new Date();cutoff.setUTCMonth(cutoff.getUTCMonth()-monthsBack);
 const start=cutoff.toISOString().slice(0,10);
 for(const [unit,table,column] of [['week','weekly_data_availability','week_start_date'],['month','monthly_data_availability','month_start_date'],['year','yearly_data_availability','year_start_date']]){
  await pool.query(`INSERT INTO ${table}(display_server_name,display_table_name,display_field_name,${column},availability_percentage,calculated_at)
   SELECT display_server_name,display_table_name,display_field_name,date_trunc('${unit}',date)::date,avg(availability_percentage),now()
   FROM daily_data_availability
   WHERE date>=date_trunc('${unit}',$1::date)::date AND date<=CURRENT_DATE
    AND availability_percentage BETWEEN 0 AND 100
   GROUP BY display_server_name,display_table_name,display_field_name,date_trunc('${unit}',date)::date
   ON CONFLICT(display_server_name,display_table_name,display_field_name,${column}) DO UPDATE SET
    availability_percentage=EXCLUDED.availability_percentage,calculated_at=now()`,[start]);
 }
}
module.exports={refreshAvailabilityPeriods};
