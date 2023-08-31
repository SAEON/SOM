#!/Users/privateprivate/SARVA_ws/bin/python

import psycopg2
import requests
import json
import pandas as pd
from datetime import datetime

def insert_data_from_dataframe(dbname, user, password, host, port, schema_name, table_name, dataframe):
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
            data = row.to_dict()
            columns = ", ".join(data.keys())
            values_placeholder = ", ".join(["%s"] * len(data))
            
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
        print("Successful")
    except Exception as e:
        print("Unsuccessful:", e)
        
def download_saeon_data():
    url = 'https://lognet.saeon.ac.za/Vasi Science Centre/?command=DataQuery&uri=Server:CR1000 Vasi Science Centre AWS.Daily&format=json&mode=most-recent&p1=10'
    response = requests.get(url, verify=False)
    
    response.raise_for_status()
    
    json_data = response.json()
    
    column_names = ['time'] + [x['name'] for x in json_data['head']['fields']]
    data_entries = [[x['time']] + x['vals'] for x in json_data['data']]
    
    df = pd.DataFrame(data_entries, columns=column_names)
    
    return df

data = download_saeon_data()
dbname = 'loggernet'
user = 'saeon'
password = 'jordan'
host = 'localhost'
port = '5432'
schema_name = 'cr1000_vasi_science_centre_aws'
table_name = 'daily'

insert_data_from_dataframe(dbname, user, password, host, port, schema_name, table_name, data)
