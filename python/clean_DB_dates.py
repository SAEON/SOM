#!/Users/privateprivate/SARVA_ws/bin/python

import psycopg2
from datetime import datetime, timedelta

def delete_bad_dates():
    # Define the PostgreSQL connection parameters
    db_name = 'loggernet'
    db_user = 'saeon'
    db_password = 'jordan'
    db_host = 'localhost'  # Assuming script runs on the same server
    db_port = 5432
    
    # Establish a database connection
    conn = psycopg2.connect(
        dbname=db_name,
        user=db_user,
        password=db_password,
        host=db_host,
        port=db_port
    )
    cursor = conn.cursor()
    
    # Query to select all table names and their schema names excluding system schemas
    query = """
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    AND table_name NOT LIKE '%_metadata'
    ORDER BY table_schema, table_name;
    """
    
    cursor.execute(query)
    tables = cursor.fetchall()
    
    # Get tomorrow's date to use in the deletion condition
    tomorrow = datetime.now() + timedelta(days=1)
    tomorrow_str = tomorrow.strftime('%Y-%m-%d')
    
    # Iterate through each table and delete bad dates
    for table_schema, table_name in tables:
        try:
            delete_query = f"""
            DELETE FROM {table_schema}.{table_name}
            WHERE 
                (date_column < '1980-01-01' OR date_column > '{tomorrow_str}')
            """
            cursor.execute(delete_query)
            rows_deleted = cursor.rowcount
            conn.commit()
            print(f"Deleted {rows_deleted} rows of bad dates from {table_schema}.{table_name}")
        except Exception as e:
            print(f"Error processing {table_schema}.{table_name}: {e}")
            conn.rollback()
            
    cursor.close()
    conn.close()
    
delete_bad_dates()
