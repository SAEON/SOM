#!/Users/privateprivate/SARVA_ws/bin/python


import pandas as pd
from sshtunnel import SSHTunnelForwarder
import psycopg2
from datetime import datetime

# Define the SSH connection parameters
ssh_host = '192.168.115.73'
ssh_username = 'marc'
ssh_password = '1oreSegreg8'

# Define the PostgreSQL connection parameters
db_host = 'localhost'
db_port = 5432
db_name = 'loggernet'
db_user = 'saeon'
db_password = 'jordan'

# Define the local port for the SSH tunnel
local_port = 6543
column_mapping = {
    "TIMESTAMP": "time",
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
}


# Create an SSH tunnel to the remote PostgreSQL database
with SSHTunnelForwarder(
    (ssh_host, 22),
    ssh_username=ssh_username,
    ssh_password=ssh_password,
    remote_bind_address=(db_host, db_port),
    local_bind_address=('localhost', local_port)
) as tunnel:

    # Read the CSV file into a pandas DataFrame
    csv_file = "/Users/privateprivate/Downloads/drive-download-20230829T065032Z-001/CR1000_Besemfontein_Table4_30min.dat"
    df = pd.read_csv(csv_file)
    
    # Remove the 'RECORD' column
    df = df.drop(['RECORD'], axis=1)
    
    
    # Map the columns to the SQL format
    df = df.rename(columns=column_mapping)
    
    # Convert the column names to lowercase
    df.columns = [col.lower() for col in df.columns]
    
    # Create a connection to the PostgreSQL database
    with psycopg2.connect(dbname=db_name, user=db_user, password=db_password, host='localhost', port=local_port) as conn:
        table_name = 'table4_thirty_min'
        schema_name = 'cr1000_besemfontein'
        columns = ", ".join(df.columns)
        values_placeholder = ", ".join(["%s"] * len(df.columns))
        
        sql = f"""
            INSERT INTO {schema_name}.{table_name} ({columns})
            VALUES ({values_placeholder})
            ON CONFLICT (time) DO NOTHING
        """
        
        with conn.cursor() as cursor:
            for index, row in df.iterrows():
                try:
                    cursor.execute(sql, tuple(row))
                    if (index + 1) % 100 == 0:  # Check if it's the 100th row
                        conn.commit()  # Commit after inserting every 100 rows
                        print(f"Committed up to row {index + 1}")
                except Exception as e:
                    print(f"Error at row {index + 1}: {e}")
                    
            # Commit any remaining rows if the total isn't a multiple of 1000
            conn.commit()
            
            