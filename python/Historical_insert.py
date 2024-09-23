import csv
import pandas as pd
import psycopg2
from sshtunnel import SSHTunnelForwarder

# SSH and PostgreSQL connection parameters
ssh_host = '192.168.115.73'
ssh_username = 'marc'
ssh_password = '1oreSegreg8'

db_host = 'localhost'
db_port = 5432
db_name = 'loggernet'
db_user = 'saeon'
db_password = 'jordan'

# Local port for SSH tunnel
local_port = 6547

# Function to detect the delimiter in a file
def detect_delimiter(file_path):
    with open(file_path, 'r') as file:
        first_line = file.readline()
        sniffer = csv.Sniffer()
        delimiter = sniffer.sniff(first_line).delimiter
        print(f"Detected delimiter: {delimiter}")
        return delimiter

# Function to read .dat or .csv file
def read_dat_file(file_path, delimiter='\t'):
    try:
        df = pd.read_csv(file_path, delimiter=delimiter, skiprows=1, header=None)
        print(f"Read file {file_path} with {len(df)} rows and {len(df.columns)} columns.")
        return df
    except Exception as e:
        print(f"An error occurred while reading the file: {e}")
        return None

# Function to filter valid data rows
def filter_valid_data_rows(df):
    # Assuming valid data rows start from the fifth row
    valid_rows = df.iloc[3:]  # Adjusting to start from the fourth row
    print(f"Filtered {len(valid_rows)} valid data rows.")
    return valid_rows

# Function to check and update server information in the database
def check_and_update_server(server_name, conn):
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT server_id FROM servers WHERE name = %s", (server_name,))
        server_id = cursor.fetchone()

        if not server_id:
            print(f"Server {server_name} not found, adding it to the database...")
            cursor.execute("INSERT INTO servers (name) VALUES (%s) RETURNING server_id", (server_name,))
            server_id = cursor.fetchone()[0]
            conn.commit()
            print(f"Added new server with ID: {server_id}")
        else:
            server_id = server_id[0]
            print(f"Found server with ID: {server_id}")

        return server_id

    except Exception as error:
        print(f"Failed to check/update server: {error}")
        conn.rollback()
        return None
    finally:
        cursor.close()

# Function to check and update table information in the database
def check_and_update_table(server_id, table_name, conn):
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT table_id FROM server_tables WHERE server_id = %s AND table_name = %s", (server_id, table_name))
        table_id = cursor.fetchone()

        if not table_id:
            print(f"Table {table_name} not found for server {server_id}, adding it to the database...")
            cursor.execute("INSERT INTO server_tables (server_id, table_name, status) VALUES (%s, %s, 'inactive') RETURNING table_id", (server_id, table_name))
            table_id = cursor.fetchone()[0]
            conn.commit()
            print(f"Added new table with ID: {table_id}")
        else:
            table_id = table_id[0]
            print(f"Found table with ID: {table_id}")

        return table_id

    except Exception as error:
        print(f"Failed to check/update table: {error}")
        conn.rollback()
        return None
    finally:
        cursor.close()

# Function to check and update field information in the database
def check_and_update_fields(table_id, fields, units, processes, conn):
    cursor = conn.cursor()
    try:
        print(f"Checking and updating fields for table ID: {table_id}")

        field_status = {}  # To store the status of each field (active/inactive)

        for i, field in enumerate(fields):
            cursor.execute(
                "SELECT field_id FROM server_table_fields WHERE table_id = %s AND field_name = %s", 
                (table_id, field)
            )
            field_id = cursor.fetchone()

            if not field_id:
                print(f"Field {field} not found for table {table_id}, adding it as inactive...")
                # Provide default values for columns that cannot be NULL
                uri = f"default_uri/{field}"  # Example default URI
                field_type = 8  # Example default type
                is_read_only = False
                can_expand = False
                cursor.execute(
                    '''
                    INSERT INTO server_table_fields 
                    (table_id, field_name, uri, type, is_read_only, can_expand, status, units, process) 
                    VALUES (%s, %s, %s, %s, %s, %s, 'inactive', %s, %s)
                    ''',
                    (table_id, field, uri, field_type, is_read_only, can_expand, units[i], processes[i])
                )
                field_status[field] = 'inactive'  # Mark new fields as inactive
                conn.commit()
            else:
                print(f"Field {field} exists with ID: {field_id[0]}")
                field_status[field] = 'active'  # Mark existing fields as active

        print("Fields checked and updated successfully.")
        return field_status  # Return the status dictionary
        
    except Exception as error:
        print(f"Failed to check/update fields: {error}")
        conn.rollback()
    finally:
        cursor.close()

# Function to insert historical data into the database
def insert_historical_data(df, server_name, table_name):
    try:
        with SSHTunnelForwarder(
            (ssh_host, 22),
            ssh_username=ssh_username,
            ssh_password=ssh_password,
            remote_bind_address=(db_host, db_port),
            local_bind_address=('localhost', local_port)
        ) as tunnel:
            print(f"SSH tunnel established on port {tunnel.local_bind_port}")
    
            conn = psycopg2.connect(
                dbname=db_name,
                user=db_user,
                password=db_password,
                host='localhost',
                port=tunnel.local_bind_port
            )
            
            server_id = check_and_update_server(server_name, conn)
            if not server_id:
                return

            table_id = check_and_update_table(server_id, table_name, conn)
            if not table_id:
                return
            
            fields = df.iloc[0, 2:].tolist()  # Second row for field names
            units = df.iloc[1, 2:].tolist()  # Third row for units
            processes = df.iloc[2, 2:].tolist()  # Fourth row for processes
            
            field_status = check_and_update_fields(table_id, fields, units, processes, conn)
            
            df_valid = filter_valid_data_rows(df)
            
            cursor = conn.cursor()
            for index, row in df_valid.iterrows():
                timestamp = row[0]  # Assuming the first column is 'TIMESTAMP'
                print(f"Inserting data for timestamp: {timestamp}")
                
                for col_index, value in enumerate(row[2:], start=2):  # Adjusted indexing
                    field_name = df.iloc[0, col_index]  # Get field name from the second row
                    status = field_status.get(field_name, 'inactive')  # Use the status from the dictionary
                    try:
                        cursor.execute(
                            '''
                            INSERT INTO field_values (field_id, timestamp, value, status) 
                            VALUES ((SELECT field_id FROM server_table_fields WHERE table_id = %s AND field_name = %s), %s, %s, %s) 
                            ON CONFLICT (field_id, timestamp) DO UPDATE SET value = EXCLUDED.value, status = EXCLUDED.status
                            ''',
                            (table_id, field_name, timestamp, value, status)
                        )
                    except Exception as error:
                        print(f"Error inserting/updating value for {field_name}: {error}")
                conn.commit()

            print("Historical data inserted successfully.")
                
    except Exception as error:
        print(f'Failed to insert historical data: {str(error)}')

# Run the process
file_path = '/Users/privateprivate/Downloads/drive-download-20240831T152158Z-001/consolidated_data.dat'
delimiter = detect_delimiter(file_path)
df = read_dat_file(file_path, delimiter=delimiter)
print("DataFrame loaded:")
print(df)

if df is not None:
    server_name = 'SAEON_Haenertsburg_AWS'
    table_name = 'Hourly'

    insert_historical_data(df, server_name, table_name)
