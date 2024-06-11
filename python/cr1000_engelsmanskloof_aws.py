#!/Users/privateprivate/SARVA_ws/bin/python

import requests
import json
import re
import urllib3
from urllib3.exceptions import InsecureRequestWarning
import psycopg2
import psycopg2.extras
import pandas as pd
from datetime import datetime

urllib3.disable_warnings(InsecureRequestWarning)



def fetch_table_data(server_name):
    try:
        # First API call to get the list of tables
        response = requests.get(f"https://lognet.saeon.ac.za/?command=browsesymbols&uri=Server:{server_name}&format=json", verify=False, timeout=20)
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
        cursor.close()
        conn.close()
        print("unsuccessful:", e)
        
def download_saeon_data(url):
    response = requests.get(url, verify=False, timeout=20)
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
        url = f"https://lognet.saeon.ac.za/?command=dataquery&uri={table['uri']}&format=json&mode=most-recent&p1=2800"
        
        # Download data and get column mapping for the current table
        data, column_mapping = download_saeon_data(url)
        
        # Construct a table name compatible with SQL
        table_name = table['name'].lower().replace(' ', '_').replace('(', '_').replace(')', '_').replace(',', '_').replace('~','_')
        table_name =table_name.replace(' ', '_').lower()
        table_name =table_name.replace('__', '_').lower()
        
        # Insert data into the database
        insert_data_from_dataframe(dbname, user, password, host, port, table_name, data, schema_name, column_mapping)
        

server_name = "CR1000 Engelsmanskloof AWS"
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

