import requests
import psycopg2
from sshtunnel import SSHTunnelForwarder
import datetime  # Import the datetime module

# Define the SSH and PostgreSQL connection parameters
ssh_host = '192.168.115.73'
ssh_username = 'marc'
ssh_password = '1oreSegreg8'

db_host = 'localhost'
db_port = 5432
db_name = 'loggernet'
db_user = 'saeon'
db_password = 'jordan'

# Define the local port for the SSH tunnel
local_port = 6543

def sync_server(p1, target_server_name):
    try:
        print('Starting server synchronization...')

        # Fetch the server data
        response = requests.get('https://lognet.saeon.ac.za/?command=browsesymbols&uri=Server&format=json', verify=False)
        if response.status_code == 200:
            data = response.json()
            servers = data.get('symbols', [])
        else:
            print('Failed to fetch server data:', response.status_code)
            return

        if len(servers) == 0:
            print('No servers to sync')
            return

        # Filter the specific server by name
        server = next((srv for srv in servers if srv['name'] == target_server_name), None)
        if not server:
            print(f'Server with name {target_server_name} not found.')
            return

        print(f'Syncing server: {server}')

        # SSH Tunnel to connect to the database
        with SSHTunnelForwarder(
            (ssh_host, 22),
            ssh_username=ssh_username,
            ssh_password=ssh_password,
            remote_bind_address=(db_host, db_port),
            local_bind_address=('localhost', local_port)
        ) as tunnel:
            print(f"SSH tunnel established on port {tunnel.local_bind_port}")
    
            # Connect to PostgreSQL database through the SSH tunnel
            conn = psycopg2.connect(
                dbname=db_name,
                user=db_user,
                password=db_password,
                host='localhost',
                port=tunnel.local_bind_port
            )
            cursor = conn.cursor()
    #
            try:
                cursor.execute('BEGIN')
#               
                # Insert or update the server record
                cursor.execute(
                    '''
                    INSERT INTO servers (name, uri, type, is_enabled, is_read_only, can_expand)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (name) DO UPDATE SET
                        uri = EXCLUDED.uri,
                        type = EXCLUDED.type,
                        is_enabled = EXCLUDED.is_enabled,
                        is_read_only = EXCLUDED.is_read_only,
                        can_expand = EXCLUDED.can_expand
                    ''',
                    (server['name'], server['uri'], server['type'], server['is_enabled'], server['is_read_only'], server['can_expand'])
                )
#
                # Fetch and update tables for the specific server
                cursor.execute('SELECT server_id FROM servers WHERE name = %s', (server['name'],))
                server_id = cursor.fetchone()
                if not server_id:
                    raise Exception(f'Server ID not found for server: {server["name"]}')

                print(f'Fetching tables for server: {server["name"]}')
                tables = fetch_tables_for_server(server['uri'])
                print(f'Found {len(tables)} tables for server: {server["name"]}')
                update_tables_for_server(server_id[0], tables,conn)

                # Fetch and update fields and their values for each table
                cursor.execute('SELECT table_id, uri FROM server_tables WHERE server_id = %s', (server_id,))
                table_rows = cursor.fetchall()
#               print(table_rows)
                for table in table_rows:
#                   print(table)
                    fields = fetch_fields_for_table(table[1], p1)
#                   print(fields)
                    update_fields_for_table(table[0], fields,conn)
#
                    # Fetch and update values for each field
                    cursor.execute('SELECT field_id, uri FROM server_table_fields WHERE table_id = %s', (table[0],))
                    field_rows = cursor.fetchall()
                    for field in field_rows:
#                       print(field)
                        values = fetch_values_for_field(field[1], p1)                        
                        update_values_for_field(field[0], values, conn)
#                       print(field, " value: ", values)
#
#               # Commit the transaction
#               cursor.execute('''
#                   INSERT INTO last_synced (id, sync_time)
#                   VALUES (1, CURRENT_TIMESTAMP)
#                   ON CONFLICT (id) DO UPDATE SET sync_time = EXCLUDED.sync_time;
#               ''')
#               conn.commit()
                
                        
            except Exception as error:
                conn.rollback()
                print(f'Failed to sync server: {str(error)}')
            finally:
                cursor.close()
                conn.close()
                print(f'Sync completed successfully for server: {server["name"]}.')
                
#       truncate_availability_tables(conn)
#       calculate_daily_data_availability(conn)

    except Exception as error:
        print(f'Failed to sync server: {str(error)}')


def fetch_tables_for_server(server_uri):
    try:
        # Construct the URL with the server URI
        url = f"https://lognet.saeon.ac.za/?command=browsesymbols&uri={requests.utils.quote(server_uri)}&format=json"
        # Send the HTTP GET request
        response = requests.get(url, verify=False)  # Use `verify=False` to ignore SSL errors if needed
        response.raise_for_status()  # Raise an exception for HTTP errors
        
        # Filter the symbols to find enabled tables of type 6
        data = response.json()
        tables = [symbol for symbol in data.get('symbols', []) if symbol.get('type') == 6 and symbol.get('is_enabled')]
        
        # Print the number of tables found
        print(f"Found {len(tables)} tables for server URI: {server_uri}")
        return tables
    
    except requests.RequestException as error:
        print(f'Failed to fetch tables for server: {server_uri}, Error: {error}')
        return []  # Return an empty array in case of an error
    


def update_tables_for_server(server_id, tables, connection):
    try:
        print(f"Updating tables for server ID: {server_id}")
        cursor = connection.cursor()
        
        # Begin a transaction
        cursor.execute('BEGIN')
        
        # Set the status of all existing tables to 'inactive' for the given server
        cursor.execute("UPDATE server_tables SET status = 'inactive' WHERE server_id = %s", (server_id,))
        
        # Insert or update each table
        for table in tables:
            cursor.execute(
                '''
                INSERT INTO server_tables (server_id, table_name, uri, type, is_read_only, can_expand, status)
                VALUES (%s, %s, %s, %s, %s, %s, 'active')
                ON CONFLICT (server_id, table_name) DO UPDATE SET
                    uri = EXCLUDED.uri,
                    type = EXCLUDED.type,
                    is_read_only = EXCLUDED.is_read_only,
                    can_expand = EXCLUDED.can_expand,
                    status = EXCLUDED.status
                ''',
                (server_id, table['name'], table['uri'], table['type'], table['is_read_only'], table['can_expand'])
            )
            
        # Commit the transaction
        connection.commit()
        print(f"Updated tables for server ID: {server_id}")
        
    except Exception as error:
        # Rollback the transaction in case of error
        connection.rollback()
        print(f'Failed to update tables for server: {server_id}, Error: {error}')
    finally:
        cursor.close()
        

def fetch_fields_for_table(table_uri, p1):
    try:
        # Construct URLs for symbols and data query requests
        symbols_url = f"https://lognet.saeon.ac.za/?command=browsesymbols&uri={requests.utils.quote(table_uri)}&format=json"
        data_query_url = f"https://lognet.saeon.ac.za/?command=dataquery&uri={requests.utils.quote(table_uri)}&format=json&mode=most-recent&p1={p1}"
        
        # Set the timeout configuration for requests
        timeout_seconds = 300  # 5 minutes
        requests_config = {'timeout': timeout_seconds, 'verify': False}  # 'verify': False to ignore SSL errors if needed
        
        # Make the requests
        symbols_response = requests.get(symbols_url, **requests_config)
        data_query_response = requests.get(data_query_url, **requests_config)
        
        # Parse the response for symbols and data fields
        symbols_response.raise_for_status()
        data_query_response.raise_for_status()
        
        symbols_data = symbols_response.json()
        data_query_data = data_query_response.json()
        
        # Filter the fields of type 8 that are enabled
        fields = [symbol for symbol in symbols_data.get('symbols', []) if symbol.get('type') == 8 and symbol.get('is_enabled')]
        
        # Get additional field details if available
        if data_query_data.get('head') and data_query_data['head'].get('fields'):
            additional_field_details = data_query_data['head']['fields']
            fields = [
                {
                    **field,
                    'data_type': next((detail.get('type') for detail in additional_field_details if detail.get('name') == field['name']), None),
                    'units': next((detail.get('units') for detail in additional_field_details if detail.get('name') == field['name']), None),
                    'process': next((detail.get('process') for detail in additional_field_details if detail.get('name') == field['name']), None),
                    'is_settable': next((detail.get('settable') for detail in additional_field_details if detail.get('name') == field['name']), None)
                }
                for field in fields
            ]
            
        return fields
    
    except requests.RequestException as error:
        print(f'Failed to fetch fields for table: {table_uri}, Error: {error}')
        return []  # Return an empty array in case of an error
    
    

def update_fields_for_table(table_id, fields, connection):
    try:
        print(f"Updating fields for table ID: {table_id}")
        cursor = connection.cursor()
        
        # Begin a transaction
        cursor.execute('BEGIN')
        
        # Set the status of all existing fields to 'inactive' for the given table
        cursor.execute("UPDATE server_table_fields SET status = 'inactive' WHERE table_id = %s", (table_id,))
        
        # Insert or update each field
        for field in fields:
            cursor.execute(
                '''
                INSERT INTO server_table_fields (
                    table_id, field_name, uri, type, is_read_only, can_expand, status,
                    data_type, units, process, is_settable
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, 'active',
                    %s, %s, %s, %s
                ) ON CONFLICT (table_id, field_name) DO UPDATE SET
                    uri = EXCLUDED.uri,
                    type = EXCLUDED.type,
                    is_read_only = EXCLUDED.is_read_only,
                    can_expand = EXCLUDED.can_expand,
                    status = EXCLUDED.status,
                    data_type = EXCLUDED.data_type,
                    units = EXCLUDED.units,
                    process = EXCLUDED.process,
                    is_settable = EXCLUDED.is_settable
                ''',
                (
                    table_id, 
                    field.get('name'), 
                    field.get('uri'), 
                    field.get('type'), 
                    field.get('is_read_only'), 
                    field.get('can_expand'),
                    field.get('data_type'),  
                    field.get('units'), 
                    field.get('process'), 
                    field.get('is_settable')
                )
            )
            
        # Commit the transaction
        connection.commit()
        print(f"Updated fields for table ID: {table_id}")
        
    except Exception as error:
        # Rollback the transaction in case of error
        connection.rollback()
        print(f'Failed to update fields for table: {table_id}, Error: {error}')
        
    finally:
        cursor.close()
        


import requests

def fetch_values_for_field(field_uri, p1):
    try:
        # Construct the URL for fetching field values
        url = f"https://lognet.saeon.ac.za/?command=dataquery&uri={requests.utils.quote(field_uri)}&format=json&mode=most-recent&p1={p1}"
        
        # Set the timeout configuration for the request
        timeout_seconds = 60  # 5 minutes
        requests_config = {'timeout': timeout_seconds, 'verify': False}  # 'verify': False to ignore SSL errors if needed
        
        # Make the HTTP GET request
        response = requests.get(url, **requests_config)
        
        # Raise an exception if there was an HTTP error
        response.raise_for_status()
        
        # Return the 'data' part of the response
        return response.json().get('data', [])
    
    except requests.RequestException as error:
        print(f'Failed to fetch values for field: {field_uri}, Error: {error}')
        return []  # Return an empty array in case of an error
    

def update_values_for_field(field_id, values, connection):
    try:
#       print(f"Updating values for field ID: {field_id}")
        cursor = connection.cursor()
        
        # Begin a transaction
        cursor.execute('BEGIN')
        
        # Insert or update each value
        for value in values:
            cursor.execute(
                '''
                INSERT INTO field_values (field_id, timestamp, value, status)
                VALUES (%s, %s, %s, 'active')
                ON CONFLICT (field_id, timestamp) DO UPDATE SET
                    value = EXCLUDED.value,
                    status = 'active'
                ''',
                (field_id, value.get('time'), str(value.get('vals')[0]))
            )
            
        # Commit the transaction
        connection.commit()
#       print(f"Updated values for field ID: {field_id}")
        
    except Exception as error:
        # Rollback the transaction in case of error
        connection.rollback()
        print(f'Failed to update values for field: {field_id}, Error: {error}')
        
    finally:
        cursor.close()
        
        

            

# Run the sync function for a specific server
sync_server(10000, 'CR1000 Vasi Science Centre AWS')  # Replace 'CR1000_Besemfontein' with your target server name
