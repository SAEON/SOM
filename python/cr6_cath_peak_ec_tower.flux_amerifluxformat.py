import psycopg2
import requests
import pandas as pd
from datetime import datetime

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
    column_mapping = {name: name.lower().replace(' ', '_').replace('(', '_').replace(')', '_') for name in column_names}
    return df, column_mapping

# Set parameters
url = 'https://lognet.saeon.ac.za/?command=dataquery&uri=Server:CR6_Cath Peak_EC Tower.Flux_AmeriFluxFormat&format=json&mode=most-recent&p1=2800'
dbname = 'loggernet'
user = 'saeon'
password = 'jordan'
host = 'localhost'
port = '5432'
schema_name = 'cr6_cath_peak_ec_tower'
table_name = 'flux_amerifluxformat'

## Download data and get column mapping
data, column_mapping = download_saeon_data(url)
# Insert data into the database
insert_data_from_dataframe(dbname, user, password, host, port, table_name, data, schema_name, column_mapping)