-- Apply explicitly to an existing database; CONCURRENTLY cannot run in a transaction.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_daily_availability_server_date_report
ON daily_data_availability (display_server_name, date)
INCLUDE (display_table_name, availability_percentage)
WHERE display_table_name IS NOT NULL AND btrim(display_table_name) <> ''
AND display_field_name IS NOT NULL AND btrim(display_field_name) <> ''
AND availability_percentage BETWEEN 0 AND 100;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_weekly_availability_server_date_report
ON weekly_data_availability (display_server_name, week_start_date)
INCLUDE (display_table_name, availability_percentage)
WHERE display_table_name IS NOT NULL AND btrim(display_table_name) <> ''
AND display_field_name IS NOT NULL AND btrim(display_field_name) <> ''
AND availability_percentage BETWEEN 0 AND 100;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_monthly_availability_server_date_report
ON monthly_data_availability (display_server_name, month_start_date)
INCLUDE (display_table_name, availability_percentage)
WHERE display_table_name IS NOT NULL AND btrim(display_table_name) <> ''
AND display_field_name IS NOT NULL AND btrim(display_field_name) <> ''
AND availability_percentage BETWEEN 0 AND 100;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_yearly_availability_server_date_report
ON yearly_data_availability (display_server_name, year_start_date)
INCLUDE (display_table_name, availability_percentage)
WHERE display_table_name IS NOT NULL AND btrim(display_table_name) <> ''
AND display_field_name IS NOT NULL AND btrim(display_field_name) <> ''
AND availability_percentage BETWEEN 0 AND 100;
