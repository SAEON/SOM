import pandas as pd
from sshtunnel import SSHTunnelForwarder
import psycopg2
import csv

# SSH and Database Credentials
ssh_host = '192.168.115.73'
ssh_username = 'marc'
ssh_password = '1oreSegreg8'
db_host = 'localhost'
db_port = 5432
db_name = 'loggernet'
db_user = 'saeon'
db_password = 'jordan'
local_port = 6543

def get_server_table_fields(cursor, server_name, table_name):
    # Get the server_id for the given server name
    cursor.execute("SELECT server_id FROM servers WHERE name = %s", (server_name,))
    server_id = cursor.fetchone()
    
    if not server_id:
        raise ValueError(f"Server '{server_name}' not found.")
    server_id = server_id[0]
    
    # Get the table_id for the given table name and server_id
    cursor.execute("SELECT table_id FROM server_tables WHERE server_id = %s AND table_name = %s", (server_id, table_name))
    table_id = cursor.fetchone()
    
    if not table_id:
        raise ValueError(f"Table '{table_name}' not found for server '{server_name}'.")
    table_id = table_id[0]
    
    # Get all relevant field information for the server_table_fields table
    cursor.execute("""
        SELECT field_id, field_name, uri, type, is_read_only, can_expand, status, data_type, units, process, is_settable
        FROM server_table_fields
        WHERE table_id = %s
        ORDER BY field_name
    """, (table_id,))
    
    fields_info = cursor.fetchall()
    
    if not fields_info:
        raise ValueError(f"No fields found for table '{table_name}' in server '{server_name}'.")
        
    return server_id, table_id, fields_info

def generate_metadata_template(cursor, server_name, table_name, output_file):
    try:
        server_id, table_id, fields_info = get_server_table_fields(cursor, server_name, table_name)
        
        # Define the column headers based on your database structure
        column_headers = ["server_id", "server_table_id", "field_id", "field_name", "uri", "type", "is_read_only", "can_expand", "status", "data_type", "units", "process", "is_settable", "inactive"]
        
        # Create and write the Metadata CSV template
        with open(output_file, mode='w', newline='') as file:
            writer = csv.DictWriter(file, fieldnames=column_headers)
            writer.writeheader()
            
            # Optionally, include existing rows as sample data
            for field in fields_info:
                writer.writerow({
                    "server_id": server_id,
                    "server_table_id": table_id,
                    "field_id": field[0],
                    "field_name": field[1],
                    "uri": field[2],
                    "type": field[3],
                    "is_read_only": field[4],
                    "can_expand": field[5],
                    "status": field[6],
                    "data_type": field[7],
                    "units": field[8],
                    "process": field[9],
                    "is_settable": field[10],
                    "inactive": "no"  # You can manually set this to 'yes' for inactive fields
                })
            
        print(f"Metadata template CSV created at: {output_file} with columns: {column_headers}")
        
    except ValueError as e:
        print(f"Error: {e}")

def generate_data_entry_template(cursor, server_name, table_name, output_file):
    try:
        _, _, fields_info = get_server_table_fields(cursor, server_name, table_name)
        
        # Extract the field names for use in the data entry template
        field_names = [field[1] for field in fields_info]
        
        # Define the column headers for data entry (just timestamp, field names, and status)
        column_headers = ["timestamp"] + field_names + ["status"]
        
        # Create and write the Data Entry CSV template
        with open(output_file, mode='w', newline='') as file:
            writer = csv.DictWriter(file, fieldnames=column_headers)
            writer.writeheader()
            
            # You can optionally prefill some rows with existing data if needed
            # For now, the template is just a blank form for manual data entry
            
        print(f"Data entry template CSV created at: {output_file} with columns: {column_headers}")
        
    except ValueError as e:
        print(f"Error: {e}")

def main():
    # SSH tunnel configuration
    with SSHTunnelForwarder(
        (ssh_host, 22),
        ssh_username=ssh_username,
        ssh_password=ssh_password,
        remote_bind_address=(db_host, db_port),
        local_bind_address=('localhost', local_port)
    ) as tunnel:
    
        # PostgreSQL connection parameters
        conn_params = {
            'dbname': db_name,
            'user': db_user,
            'password': db_password,
            'host': 'localhost',  # Use localhost since we're tunneling
            'port': local_port
        }
    
        try:
            # Connect to PostgreSQL
            conn = psycopg2.connect(**conn_params)
            cursor = conn.cursor()
            
            # Specify the server and table
            server_name = "CR1000_Cath Peak_Mikes Pass AWS"
            table_name = "Daily"
            
            # Output file paths
            metadata_output_file = "/Users/privateprivate/Downloads/metadata_template.csv"
            data_entry_output_file = "/Users/privateprivate/Downloads/data_entry_template.csv"
            
            # Generate the Metadata template
            generate_metadata_template(cursor, server_name, table_name, metadata_output_file)
            
            # Generate the Data Entry template
            generate_data_entry_template(cursor, server_name, table_name, data_entry_output_file)
            
        except Exception as e:
            print(f"An error occurred: {e}")
            
        finally:
            cursor.close()
            conn.close()
            
if __name__ == "__main__":
    main()
