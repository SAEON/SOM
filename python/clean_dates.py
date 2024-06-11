import pandas as pd
from sshtunnel import SSHTunnelForwarder
import psycopg2
from datetime import datetime

def delete_bad_dates():
    # Define the SSH connection parameters
    ssh_host = '192.168.115.73'
    ssh_username = 'marc'
    ssh_password = '1oreSegreg8'

    # Define the PostgreSQL connection parameters
    db_host = 'localhost'
    db_port = 5432
    db_name = 'loggernet'
    db_user = 'saeon'
    db_password = 'jordan'

    with SSHTunnelForwarder(
        (ssh_host, 22),
        ssh_username=ssh_username,
        ssh_password=ssh_password,
        remote_bind_address=(db_host, db_port)
    ) as tunnel:
        conn = psycopg2.connect(
            dbname=db_name,
            user=db_user,
            password=db_password,
            host='localhost',  # Note: Use localhost here because the tunnel is local
            port=tunnel.local_bind_port  # Use the dynamically assigned local port
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

        # Iterate through each table and delete bad dates
        for table_schema, table_name in tables:
            try:
                delete_query = f"""
                DELETE FROM {table_schema}.{table_name}
                WHERE 
                    (time < '1980-01-01' OR time >= CURRENT_DATE + INTERVAL '1 day')
                """
                cursor.execute(delete_query)
                conn.commit()
                print(f"Deleted bad dates from {table_schema}.{table_name}")
            except Exception as e:
                print(f"Error processing {table_schema}.{table_name}: {e}")
                conn.rollback()
        
        cursor.close()
        conn.close()

delete_bad_dates()
