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
        column_mapping = {'time': 'time', 'BattV': 'battv', 'PTemp_C': 'ptemp_c', 'WS_ms': 'ws_ms', 'WindDir': 'winddir', 'AirTC': 'airtc', 'RH': 'rh', 'NR_Wm2': 'nr_wm2', 'CNR_Wm2': 'cnr_wm2', 'Rain_mm': 'rain_mm', 'VW': 'vw', 'PA_uS': 'pa_us', 'VW_2': 'vw_2', 'PA_uS_2': 'pa_us_2', 'VW_3': 'vw_3', 'PA_uS_3': 'pa_us_3', 'VW_4': 'vw_4', 'PA_uS_4': 'pa_us_4', 'VW_5': 'vw_5', 'PA_uS_5': 'pa_us_5', 'VW_6': 'vw_6', 'PA_uS_6': 'pa_us_6', 'T107_C': 't107_c', 'Rain_mm_2': 'rain_mm_2', 'BP_mbar': 'bp_mbar', 'TdC': 'tdc', 'SVPWmbar': 'svpwmbar', 'LWmV': 'lwmv', 'LWMDry': 'lwmdry', 'LWMCon': 'lwmcon', 'LWMWet': 'lwmwet', 'LWmV_2': 'lwmv_2', 'LWMDry_2': 'lwmdry_2', 'LWMCon_2': 'lwmcon_2', 'LWMWet_2': 'lwmwet_2', 'ScanTime1': 'scantime1', 'SolarCharger_Block': 'solarcharger_block', 'SolarCharger_PanelVoltage': 'solarcharger_panelvoltage', 'SolarCharger_PanelCurrent': 'solarcharger_panelcurrent', 'SolarCharger_PanelPower': 'solarcharger_panelpower', 'SolarCharger_LoadVoltage': 'solarcharger_loadvoltage', 'SolarCharger_LoadCurrent': 'solarcharger_loadcurrent', 'SolarCharger_BatteryVoltage': 'solarcharger_batteryvoltage', 'SolarCharger_BoardTemp': 'solarcharger_boardtemp', 'SolarCharger_State': 'solarcharger_state', 'SolarCharger_Mode': 'solarcharger_mode', 'SolarCharger_BulkFloatVoltage': 'solarcharger_bulkfloatvoltage', 'SolarCharger_FloatVoltage': 'solarcharger_floatvoltage', 'SolarCharger_CurrentLimit': 'solarcharger_currentlimit', 'SolarCharger_AbsorbTimeLimit': 'solarcharger_absorbtimelimit', 'SolarCharger_AbsorbFullCurrent': 'solarcharger_absorbfullcurrent', 'SolarCharger_VCalSlope': 'solarcharger_vcalslope', 'SolarCharger_ICalSlope': 'solarcharger_icalslope', 'PingTime': 'pingtime', 'IPFailCount': 'ipfailcount'}
                
        
        
        
        
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
    url = 'https://lognet.saeon.ac.za/?command=dataquery&uri=Server:CR1000_Dwarsberg_Jonkershoek.Public&format=json&mode=most-recent&p1=2800'
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
table_name = 'public'
## Use the modified function to insert data from the DataFrame into the PostgreSQL database
insert_data_from_dataframe(dbname, user, password, host, port, table_name, data)
