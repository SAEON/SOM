import psycopg2
import requests
import json
import pandas as pd
from datetime import datetime
def insert_data_from_dataframe(dbname, user, password, host, port, table_name, dataframe):
    # Connect to the database
    try:
        conn = psycopg2.connect(
            dbname=dbname,
            user=user,
            password=password,
            host=host,
            port=port
        )
        cursor = conn.cursor()
        column_mapping = {'time': 'time', 'BattV_Min': 'battv_min', 'WS_ms_S_WVT': 'ws_ms_s_wvt', 'WindDir_D1_WVT': 'winddir_d1_wvt', 'WindDir_SD1_WVT': 'winddir_sd1_wvt', 'WS_ms_Max': 'ws_ms_max', 'AirTC_Max': 'airtc_max', 'AirTC_Min': 'airtc_min', 'RH_Max': 'rh_max', 'RH_Min': 'rh_min', 'NR_Wm2_Max': 'nr_wm2_max', 'CNR_Wm2_Std': 'cnr_wm2_std', 'Rain_mm_Tot': 'rain_mm_tot', 'VW_Max': 'vw_max', 'VW_Min': 'vw_min', 'VW_2_Max': 'vw_2_max', 'VW_2_Min': 'vw_2_min', 'VW_3_Max': 'vw_3_max', 'VW_3_Min': 'vw_3_min', 'VW_4_Max': 'vw_4_max', 'VW_4_Min': 'vw_4_min', 'VW_5_Max': 'vw_5_max', 'VW_5_Min': 'vw_5_min', 'VW_6_Max': 'vw_6_max', 'VW_6_Min': 'vw_6_min', 'T107_C_Max': 't107_c_max', 'T107_C_Min': 't107_c_min', 'Rain_mm_2_Tot': 'rain_mm_2_tot', 'BP_mbar_Max': 'bp_mbar_max', 'BP_mbar_Min': 'bp_mbar_min', 'TdC_Max': 'tdc_max', 'TdC_Min': 'tdc_min', 'SVPWmbar_Max': 'svpwmbar_max', 'SVPWmbar_Min': 'svpwmbar_min'}
                
        
        
        
        
        # Iterate over rows in the DataFrame
        for _, row in dataframe.iterrows():
            # Map the DataFrame columns to the database columns
            data = {column_mapping[key]: value for key, value in row.to_dict().items() if key in column_mapping}
            columns = ', '.join([f'"{key}"' for key in data.keys()])
            values_placeholder = ', '.join(["%s"] * len(data))
#           print(columns)
            # Use the ON CONFLICT clause to avoid inserting duplicate records based on the timestamp
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
    except Exception as e:   # Added to catch and print the specific error for better debugging
        print("unsuccessful:", e)
    
    
    
    
def download_saeon_data():
    url = 'https://lognet.saeon.ac.za/?command=dataquery&uri=Server:CR1000_Dwarsberg_Jonkershoek.Table2&format=json&mode=most-recent&p1=10'
    response = requests.get(url, verify=False)
    
    # Check if the request was successful
    response.raise_for_status()
    
    # Parse the JSON response
    json_data = response.json()
    
    # Extract the column names from the 'fields' list in the 'head' section
    column_names = ['time'] + [x['name'] for x in json_data['head']['fields']]
    
    # Extract the data entries from the 'vals' list in the 'data' section
    data_entries = [[x['time']] + x['vals'] for x in json_data['data']]
    
    # Construct a DataFrame from the data entries, using the column names
    df = pd.DataFrame(data_entries, columns=column_names)
    
    
    #   print(df)
    return df

# Call the function and store the DataFrame
data = download_saeon_data()
dbname = 'loggernet'
user = 'saeon'
password = 'jordan'
host = 'localhost'
port = '5432'
schema_name = 'cr1000_dwarsberg_jonkershoek'
table_name = 'table2'
## Use the modified function to insert data from the DataFrame into the PostgreSQL database
insert_data_from_dataframe(dbname, user, password, host, port, table_name, data)
