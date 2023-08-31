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
            "Rain_mm_Tot": "rain_mm_tot",
            "AirTCtop_Avg": "airtctop_avg",
            "RH_top": "rh_top",
            "AirTCbot_Avg": "airtcbot_avg",
            "RH_bot": "rh_bot",
            "WS_ms_Avg": "ws_ms_avg",
            "WindDir": "winddir",
            "VW_Avg": "vw_avg",
            "VW_2_Avg": "vw_2_avg",
            "VW_3_Avg": "vw_3_avg",
            "VW_4_Avg": "vw_4_avg",
            "TdC_top_Avg": "tdc_top_avg",
            "TdC_bot_Avg": "tdc_bot_avg",
            "SVPWkPa_top_Avg": "svpwkpa_top_avg",
            "SVPWkPa_bot_Avg": "svpwkpa_bot_avg",
            "LWMDry_Tot": "lwmdry_tot",
            "LWMCon_Tot": "lwmcon_tot",
            "LWMWet_Tot": "lwmwet_tot",
            "Fog_mm_Tot": "fog_mm_tot",
            "Temp_C_Avg(1)": "temp_c_avg_1",
            "Temp_C_Avg(2)": "temp_c_avg_2",
            "Temp_C_Avg(3)": "temp_c_avg_3",
            "Temp_C_Avg(4)": "temp_c_avg_4",
            "NR_Wm2_Avg": "nr_wm2_avg",
            "CNR_Wm2_Avg": "cnr_wm2_avg"
        };                
        
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
    url = 'https://lognet.saeon.ac.za/Besemfontein/?command=DataQuery&uri=Server:CR1000_Besemfontein.Table4_30min&format=json&mode=most-recent&p1=480'
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
table_name = 'table4_thirty_min'
## Use the modified function to insert data from the DataFrame into the PostgreSQL database
insert_data_from_dataframe(dbname, user, password, host, port, table_name, data)
