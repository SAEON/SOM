#!/Users/privateprivate/SARVA_ws/bin/python

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
        column_mapping = {
            "time": "time",
            "BattV": "battv",
            "PTemp_C": "ptemp_c",
            "Rain_mm": "rain_mm",
            "AirTCtop": "airtc_top",
            "RH_top": "rh_top",
            "AirTCbot": "airtc_bot",
            "RH_bot": "rh_bot",
            "WS_ms": "ws_ms",
            "WindDir": "winddir",
            "VW": "vw",
            "PA_uS": "pa_us",
            "VW_2": "vw_2",
            "PA_uS_2": "pa_us_2",
            "VW_3": "vw_3",
            "PA_uS_3": "pa_us_3",
            "VW_4": "vw_4",
            "PA_uS_4": "pa_us_4",
            "TdC_top": "tdc_top",
            "TdC_bot": "tdc_bot",
            "SVPWkPa_top": "svpwkpa_top",
            "SVPWkPa_bot": "svpwkpa_bot",
            "LWmV": "lwmv",
            "LWMDry": "lwmdry",
            "LWMCon": "lwmcon",
            "LWMWet": "lwmwet",
            "Fog_mm": "fog_mm",
            "Temp_C(1)": "temp_c_1",
            "Temp_C(2)": "temp_c_2",
            "Temp_C(3)": "temp_c_3",
            "Temp_C(4)": "temp_c_4",
            "NR_Wm2": "nr_wm2",
            "CNR_Wm2": "cnr_wm2",
            "ScanTime1": "scantime1",
            "ScanTime4": "scantime4",
            "PingTime": "pingtime",
            "IPFailCount": "ipfailcount"
        }
        
        
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
    url = 'https://lognet.saeon.ac.za/?command=dataquery&uri=Server:CR1000_Besemfontein.Public&format=json&mode=most-recent&p1=2800'
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
schema_name = 'cr1000_besemfontein'
table_name = 'public'
## Use the modified function to insert data from the DataFrame into the PostgreSQL database
insert_data_from_dataframe(dbname, user, password, host, port, table_name, data)
