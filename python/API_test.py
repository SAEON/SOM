import requests
from requests.auth import HTTPBasicAuth
import json
from datetime import datetime
import pytz
import os

# Disable SSL warnings (if necessary)
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# API URLs
servers_url = "https://41.133.92.45/api/public/servers"
tables_url = "https://41.133.92.45/api/public/tables"
date_range_url = "https://41.133.92.45/api/public/date-range"
download_url = "https://41.133.92.45/api/public/download"  # New download API endpoint

username = "Marc"
password = "Pienaar"

# Define your desired directory for the download
download_directory = "/Users/privateprivate/Downloads"

# Ensure the directory exists (optional: will create it if it doesn't exist)
os.makedirs(download_directory, exist_ok=True)

# Headers
headers = {
    "Accept": "application/json"
}

# Define SAST timezone
sast_tz = pytz.timezone("Africa/Johannesburg")

def convert_to_sast(utc_str):
    # Convert the UTC string to a datetime object
    utc_dt = datetime.strptime(utc_str, "%Y-%m-%dT%H:%M:%S.%fZ")
    
    # Localize the UTC datetime
    utc_dt = pytz.utc.localize(utc_dt)
    
    # Convert to SAST
    sast_dt = utc_dt.astimezone(sast_tz)
    
    return sast_dt.strftime("%Y-%m-%d %H:%M:%S")  # Return a formatted SAST string

try:
    # Step 1: Get the list of servers (sites)
    response = requests.get(servers_url, headers=headers, auth=HTTPBasicAuth(username, password), verify=False)

    # Check if the request was successful
    if response.status_code == 200:
        servers_data = response.json()
        
        # Pretty-print the server names
        print("List of available sites:")
        for idx, site in enumerate(servers_data):
            print(f"{idx + 1}. {site['site_name']}")

        # Choose a site (e.g., first one)
        chosen_site = servers_data[0]['site_name']
        print(f"\nUsing site: {chosen_site}")

        # Step 2: Get the tables for the chosen site
        tables_params = {
            "server": chosen_site  # Pass the site name as a query parameter
        }

        tables_response = requests.get(tables_url, headers=headers, params=tables_params, auth=HTTPBasicAuth(username, password), verify=False)

        # Check if the tables request was successful
        if tables_response.status_code == 200:
            tables_data = tables_response.json()
            
            print(f"\nTables for site '{chosen_site}':")
            for idx, table in enumerate(tables_data):
                print(f"{idx + 1}. {table['display_table_name']}")

            # Choose a table (e.g., first one)
            chosen_table = tables_data[2]['display_table_name']
            print(f"\nUsing table: {chosen_table}")

            # Step 3: Get the date range and missing dates for the chosen server and table
            date_range_params = {
                "server": chosen_site,  # Pass the site (server) name
                "table": chosen_table    # Pass the table name
            }

            date_range_response = requests.get(date_range_url, headers=headers, params=date_range_params, auth=HTTPBasicAuth(username, password), verify=False)

            # Check if the date range request was successful
            if date_range_response.status_code == 200:
                date_range_data = date_range_response.json()
                
                # Convert start and end dates to SAST
                start_date_sast = convert_to_sast(date_range_data['start_date'])
                end_date_sast = convert_to_sast(date_range_data['end_date'])

                # Print the start and end dates in SAST
                print(f"\nData Range for '{chosen_site}' - '{chosen_table}':")
                print(f"Start Date (SAST): {start_date_sast}")
                print(f"End Date (SAST): {end_date_sast}")

                # Step 4: Download the data using the chosen server, table, and date range
                download_params = {
                    "tableName": chosen_table,
                    "serverName": chosen_site,
                    "startDate": date_range_data['start_date'],
                    "endDate": date_range_data['end_date'],
                    "consent": "yes"  # Log consent for download
                }

                download_response = requests.get(download_url, headers=headers, params=download_params, auth=HTTPBasicAuth(username, password), verify=False, stream=True)

                if download_response.status_code == 200:
                    
                    downloaded_size = 0  # Track how much has been downloaded

                    # Construct the full path for the download file
                    download_filename = os.path.join(download_directory, f"{chosen_table}_{chosen_site}_data.csv")
                    with open(download_filename, 'wb') as f:
                        for chunk in download_response.iter_content(chunk_size=8192):
                            f.write(chunk)
                            downloaded_size += len(chunk)                            
                    
                    print(f"\nData successfully downloaded and saved as {download_filename}")
                else:
                    print(f"Failed to download data. Status code: {download_response.status_code}")
                    print(f"Response: {download_response.text}")
            else:
                print(f"Failed to fetch date range. Status code: {date_range_response.status_code}")
                print(f"Response: {date_range_response.text}")
        else:
            print(f"Failed to fetch tables. Status code: {tables_response.status_code}")
            print(f"Response: {tables_response.text}")
    else:
        print(f"Failed to fetch servers. Status code: {response.status_code}")
        print(f"Response: {response.text}")

except Exception as e:
    print(f"An error occurred: {e}")
    