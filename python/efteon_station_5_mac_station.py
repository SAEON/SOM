#!/Users/privateprivate/SARVA_ws/bin/python

import requests
import json
import re
import urllib3
from urllib3.exceptions import InsecureRequestWarning
import psycopg2
import pandas as pd
from datetime import datetime

urllib3.disable_warnings(InsecureRequestWarning)

def generate_metadata_sql_command(fields, schema_table_name, username='saeon'):
    schemaname, tablename = schema_table_name.split(".")
    metadata_table_name = tablename + "_metadata"
    
    # Construct SQL commands for creating metadata table
    sql_commands = [
        f"CREATE TABLE {schemaname}.{metadata_table_name} (",
        "    name TEXT PRIMARY KEY,",
        "    type TEXT,",
        "    units TEXT,",
        "    process TEXT,",
        "    settable BOOLEAN",
        ");"
    ]
    
    # Construct SQL commands for inserting data into metadata table
    insert_commands = [f"INSERT INTO {schemaname}.{metadata_table_name} (name, type, units, process, settable) VALUES"]
    for field in fields:
        name = field['name'].replace(' ', '_').replace('~','_').lower()  # Replace spaces with underscores and convert to lowercase
        name = name.replace(')', '_').replace('(', '_').lower().replace(',', '_').replace('~','_').lower()
        field_type = field['type']
        units = field.get('units', 'NULL') if field.get('units') else 'NULL'
        settable = str(field.get('settable', 'false')).lower()
        insert_commands.append(f"('{name}', '{field_type}', '{units}', NULL, {settable}),")
        
    # Remove the last comma and add a semicolon
    insert_commands[-1] = insert_commands[-1].rstrip(',') + ';'
    
    # Additional permissions and schema setup commands
    additional_commands = [
        f"SET search_path TO {schemaname};",
        f"GRANT INSERT, UPDATE, DELETE ON TABLE {schemaname}.{metadata_table_name} TO {username};",
        f"GRANT USAGE ON SCHEMA {schemaname} TO {username};",
        f"GRANT INSERT ON TABLE {schemaname}.{metadata_table_name} TO {username};",
        f"GRANT SELECT ON ALL TABLES IN SCHEMA {schemaname} TO {username};"
    ]
    
    # Combine all commands into a single string
    full_sql_command = "\n".join(sql_commands + insert_commands + additional_commands)
    return full_sql_command

def generate_sql_command(url, full_tablename, username='saeon'):
    try:
        response = requests.get(url, verify=False)
        response.raise_for_status()  # Raises an HTTPError for unsuccessful status codes
        
        # Parse the JSON response
        data = response.json()
        
        # Extracting fields data
        fields = data['head']['fields']
        
        # Splitting the full table name into schema and table
        schemaname, tablename = full_tablename.split(".")
        
        # Constructing SQL commands
        sql_commands = []
        
        # Create schema command
        sql_commands.append(f"CREATE SCHEMA IF NOT EXISTS {schemaname};")
        sql_commands.append(f"GRANT USAGE ON SCHEMA {schemaname} TO {username};")
        sql_commands.append(f"GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA {schemaname} TO {username};")
        sql_commands.append(f"\n")
        
        # Create table command
        create_table_command = f"CREATE TABLE {schemaname}.{tablename} (\n     time TIMESTAMP,"
        for field in fields:
            field_name = field['name'].replace(' ', '_').replace('~','_').lower()
            
            field_name = field_name.replace(')', '_').replace('(', '_').lower().replace(',', '_').replace('~','_').lower()
            
            field_type = "FLOAT" if field['type'] == "xsd:float" else "TEXT"  # Assuming text as default for non-float types
            create_table_command += f"\n    {field_name} {field_type},"
            
        create_table_command = create_table_command.rstrip(',')  # Remove the last comma
        create_table_command += "\n);"
        sql_commands.append(create_table_command)
        
        # Generate SQL command for metadata table
        metadata_sql_command = generate_metadata_sql_command(fields, full_tablename, username)
        sql_commands.append(metadata_sql_command)
        
        # Additional SQL commands for permissions and constraints
        additional_commands = f"""
ALTER TABLE {schemaname}.{tablename} ADD CONSTRAINT unique_time_{tablename} UNIQUE (time);

GRANT INSERT, UPDATE, DELETE ON TABLE {schemaname}.{tablename} TO {username};
GRANT USAGE ON SCHEMA {schemaname} TO {username};
GRANT INSERT ON TABLE {schemaname}.{tablename} TO {username};
GRANT SELECT ON ALL TABLES IN SCHEMA {schemaname} TO {username};
"""
        sql_commands.append(additional_commands)
        
        return "\n".join(sql_commands)
    except requests.HTTPError as e:
        return f"HTTP Error: {e}"
    except requests.RequestException as e:
        return f"Error during requests to {url}: {e}"
    except json.JSONDecodeError as e:
        return f"Error decoding JSON: {e}"

def fetch_table_data(server_name):
    try:
        # First API call to get the list of tables
        response = requests.get(f"https://lognet.saeon.ac.za/?command=browsesymbols&uri=Server:{server_name}&format=json", verify=False)
        response.raise_for_status()  # Raises an HTTPError if the HTTP request returned an unsuccessful status code
        
        data = response.json()
        
        # Filter out only those symbols that are tables and collect their names and URIs
        tables = [{'name': symbol['name'], 'uri': symbol['uri']} for symbol in data['symbols']]
        
        
        return tables
    
    except requests.HTTPError as http_err:
        print(f"HTTP error occurred: {http_err}")
        return None
    except Exception as err:
        print(f"An error occurred: {err}")
        return None
    

def sanitize_name(name):
    """Sanitize a string to conform to SQL naming conventions."""
    name = name.replace(',', '_').replace('~','_')  # Replace commas with underscores
    name = name.replace(')', '').replace('(', '_').lower().replace(',', '_').replace('~','_').lower()
    name =name.replace(' ', '_').lower()
    name =name.replace('__', '_').lower()
    return re.sub(r'\W+', '_', name).lower()

def insert_data_from_dataframe(dbname, user, password, host, port, table_name, dataframe, schema_name, column_mapping):
    try:
        conn = psycopg2.connect(
            dbname=dbname,
            user=user,
            password=password,
            host=host,
            port=port
        )
        cursor = conn.cursor()
        
        for _, row in dataframe.iterrows():
            data = {column_mapping[key]: value for key, value in row.to_dict().items() if key in column_mapping}
            columns = ', '.join([f'"{key}"' for key in data.keys()])
            values_placeholder = ', '.join(["%s"] * len(data))
            sql = f"""
                INSERT INTO {schema_name}.{table_name} ({columns}) 
                VALUES ({values_placeholder})
                ON CONFLICT (time) 
                DO NOTHING;
            """
            try:
                cursor.execute(sql, list(data.values()))
                conn.commit()
            except Exception as e:
                print("Error:", e)
                conn.rollback()
                
        cursor.close()
        conn.close()
        print("successful")
    except Exception as e:
        print("unsuccessful:", e)
        
def download_saeon_data(url):
    response = requests.get(url, verify=False)
    response.raise_for_status()
    json_data = response.json()
    
    # Extract the column names from the 'fields' list in the 'head' section
    column_names = ['time'] + [x['name'] for x in json_data['head']['fields']]
    
#   # Extract the data entries from the 'vals' list in the 'data' section
    data_entries = [[x['time']] + x['vals'] for x in json_data['data']]
    
#   # Construct a DataFrame from the data entries, using the column names
    df = pd.DataFrame(data_entries, columns=column_names)
#   print(df)
    #column_mapping = {name: name.lower().replace(' ', '_') for name in column_names}
    column_mapping = {name: name.lower().replace(' ', '_').replace('(', '_').replace(')', '_').replace('(', '_').replace(',', '_').replace('~','_') for name in column_names}
    return df, column_mapping




def update_all_tables(server_name, dbname, user, password, host, port, schema_name):
    tables = fetch_table_data(server_name)
    
    for table in tables:
        # Construct the URL for the specific table
        url = f"https://lognet.saeon.ac.za/?command=dataquery&uri={table['uri']}&format=json&mode=most-recent&p1=28000000"
        
        # Download data and get column mapping for the current table
        data, column_mapping = download_saeon_data(url)
        
        # Construct a table name compatible with SQL
        table_name = table['name'].lower().replace(' ', '_').replace('(', '_').replace(')', '_').replace(',', '_').replace('~','_')
        table_name =table_name.replace(' ', '_').lower()
        table_name =table_name.replace('__', '_').lower()
        
        # Insert data into the database
        insert_data_from_dataframe(dbname, user, password, host, port, table_name, data, schema_name, column_mapping)
        

server_name = "EFTEON Station 5 (Mac station)"
tables = fetch_table_data(server_name)

normalized_server_name = sanitize_name(server_name)
print(normalized_server_name)        
# Set parameters
#server_name = 'CR3000_Jonkershoek_EC'
dbname = 'loggernet'
user = 'saeon'
password = 'jordan'
host = 'localhost'
port = '5432'
schema_name = normalized_server_name

# Update all tables
update_all_tables(server_name, dbname, user, password, host, port, schema_name)