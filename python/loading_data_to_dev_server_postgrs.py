#!/Users/privateprivate/SARVA_ws/bin/python

import pandas as pd
from sshtunnel import SSHTunnelForwarder
import psycopg2
from datetime import datetime

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

# Define the local port for the SSH tunnel
local_port = 6543

# Create an SSH tunnel to the remote PostgreSQL database
with SSHTunnelForwarder(
    (ssh_host, 22),
    ssh_username=ssh_username,
    ssh_password=ssh_password,
    remote_bind_address=(db_host, db_port),
    local_bind_address=('localhost', local_port)
) as tunnel:

    # Read the CSV file into a pandas DataFrame
    csv_file = "/Users/privateprivate/Downloads/CR1000 - Vasi_Science Centre AWS_Five_mins.dat"
    df = pd.read_csv(csv_file)
    
    # Remove the 'RECORD' column
    df = df.drop(['RECORD'], axis=1)
    # Convert the column names to lowercase
    df.columns = [col.lower() for col in df.columns]

    # Create a connection to the PostgreSQL database
    with psycopg2.connect(dbname=db_name, user=db_user, password=db_password, host='localhost', port=local_port) as conn:
        table_name = 'five_min'
        schema_name = 'cr1000_vasi_science_centre_aws'
        columns = ", ".join(df.columns)
        values_placeholder = ", ".join(["%s"] * len(df.columns))
        
        sql = f"""
            INSERT INTO {schema_name}.{table_name} ({columns})
            VALUES ({values_placeholder})
            ON CONFLICT (time) DO NOTHING
        """

        with conn.cursor() as cursor:
            for index, row in df.iterrows():
                try:
                    cursor.execute(sql, tuple(row))
                    if (index + 1) % 100 == 0:  # Check if it's the 100th row
                        conn.commit()  # Commit after inserting every 100 rows
                        print(f"Committed up to row {index + 1}")
                except Exception as e:
                    print(f"Error at row {index + 1}: {e}")
                    
            # Commit any remaining rows if the total isn't a multiple of 1000
            conn.commit()
            
            