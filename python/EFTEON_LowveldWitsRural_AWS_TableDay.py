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
            "TIMESTAMP": "time",
            "StationID": "stationid",
            "WSpd_Min": "wspd_min",
            "WSpd_TMn": "wspd_tmn",
            "WSpd_Max": "wspd_max",
            "WSpd_TMx": "wspd_tmx",
            "WSpd_Avg": "wspd_avg",
            "WSpd_Std": "wspd_std",
            "WDir_Avg": "wdir_avg",
            "WDir_Std": "wdir_std",
            "Wind_Success_Tot": "wind_success_tot",
            "AirTemp_Min": "airtemp_min",
            "AirTemp_TMn": "airtemp_tmn",
            "AirTemp_Max": "airtemp_max",
            "AirTemp_TMx": "airtemp_tmx",
            "AirTemp_Avg": "airtemp_avg",
            "RH_Min": "rh_min",
            "RH_TMn": "rh_tmn",
            "RH_Max": "rh_max",
            "RH_TMx": "rh_tmx",
            "DewPointTemp_Min": "dewpointtemp_min",
            "DewPointTemp_TMn": "dewpointtemp_tmn",
            "DewPointTemp_Max": "dewpointtemp_max",
            "DewPointTemp_TMx": "dewpointtemp_tmx",
            "DewPointTemp_Avg": "dewpointtemp_avg",
            "Temp_Min": "temp_min",
            "Temp_TMn": "temp_tmn",
            "Temp_Max": "temp_max",
            "Temp_TMx": "temp_tmx",
            "Temp_Avg": "temp_avg",
            "SlrW_Max": "slrw_max",
            "SlrW_TMx": "slrw_tmx",
            "SlrW_Avg": "slrw_avg",
            "SlrMJ_Tot": "slrmj_tot",
            "UVSlrW_Max": "uvslrw_max",
            "UVSlrW_TMx": "uvslrw_tmx",
            "UVSlrW_Avg": "uvslrw_avg",
            "Rain_Tot": "rain_tot",
            "LeafWetmV_Min": "leafwetmv_min",
            "LeafWetmV_TMn": "leafwetmv_tmn",
            "LeafWetmV_Max": "leafwetmv_max",
            "LeafWetmV_TMx": "leafwetmv_tmx",
            "LeafWetmV_Avg": "leafwetmv_avg",
            "LeafDryCount_Tot": "leafdrycount_tot",
            "LeafConCount_Tot": "leafconcount_tot",
            "LeafWetCount_Tot": "leafwetcount_tot",
            "BPress_Min": "bpress_min",
            "BPress_TMn": "bpress_tmn",
            "BPress_Max": "bpress_max",
            "BPress_TMx": "bpress_tmx",
            "BPress_Avg": "bpress_avg",
            "LoggerSerialNumber": "loggerserialnumber",
            "ProgramName": "programname",
            "ProgramSignature": "programsignature",
            "LoggerBattery_Min": "loggerbattery_min",
            "LoggerBattery_TMn": "loggerbattery_tmn",
            "LoggerBattery_Max": "loggerbattery_max",
            "LoggerBattery_TMx": "loggerbattery_tmx",
            "LoggerBattery_Avg": "loggerbattery_avg",
            "LoggerTemp_Min": "loggertemp_min",
            "LoggerTemp_TMn": "loggertemp_tmn",
            "LoggerTemp_Max": "loggertemp_max",
            "LoggerTemp_TMx": "loggertemp_tmx",
            "LoggerTemp_Avg": "loggertemp_avg",
            "LoggerLithiumBatt_Avg": "loggerlithiumbatt_avg",
            "PingTime_Avg": "pingtime_avg",
            "ScanCount": "scancount"
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
    url = 'https://lognet.saeon.ac.za/?command=dataquery&uri=Server:EFTEON_LowveldWitsRural_AWS.TableDay&format=json&mode=most-recent&p1=2800'
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
schema_name = 'efteon_lowveldwitsrural_aws'
table_name = 'daily'
## Use the modified function to insert data from the DataFrame into the PostgreSQL database
insert_data_from_dataframe(dbname, user, password, host, port, table_name, data)