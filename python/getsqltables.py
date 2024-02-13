#!/Users/privateprivate/SARVA_ws/bin/python

import requests
import json
import re
import urllib3
from urllib3.exceptions import InsecureRequestWarning

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
        name = field['name'].replace(' ', '_').lower()  # Replace spaces with underscores and convert to lowercase
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
            field_name = field['name'].replace(' ', '_').lower()
            
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
    return re.sub(r'\W+', '_', name).lower()


server_name = "EFTEON_Benfontein_Karoo"
tables = fetch_table_data(server_name)


# Iterate through the tables and generate SQL commands for each
for table in tables:
    
#   print(table)
    # Construct the full URL for each table
    url = f"https://lognet.saeon.ac.za/?command=dataquery&uri={table['uri']}&format=json&mode=most-recent&p1=1"
    normalized_server_name = sanitize_name(server_name)
    normalized_table_name = sanitize_name(table['name'])

    full_tablename = f"{normalized_server_name}.{normalized_table_name}"
    #   for field in fields:
    #       field['name'] = sanitize_name(field['name'])
    
    #   full_tablename = f"{server_name.lower().replace(' ', '_')}.{table['name'].lower().replace(' ', '_')}"
    
    # Generate the SQL command for the table
    sql_command = generate_sql_command(url, full_tablename)
    print(f"\n{sql_command}\n")