import os
import pandas as pd
import csv

# Function to detect the delimiter in a file
def detect_delimiter(file_path):
    with open(file_path, 'r') as file:
        first_line = file.readline()
        sniffer = csv.Sniffer()
        delimiter = sniffer.sniff(first_line).delimiter
        return delimiter
    
# Function to read .dat or .csv file and extract metadata
def read_dat_file(file_path, delimiter='\t'):
    try:
        # Read file into DataFrame, skipping metadata lines
        df = pd.read_csv(file_path, delimiter=delimiter, skiprows=4, header=None)
        print(f"Read file {file_path} with {len(df)} rows and {len(df.columns)} columns.")
        return df
    except Exception as e:
        print(f"An error occurred while reading the file: {e}")
        return None

# Function to consolidate headers, units, and process lines, ensuring TIMESTAMP and RECORD are first
def consolidate_metadata(all_headers):
    # Start with TIMESTAMP and RECORD as the first columns
    headers = ['TIMESTAMP', 'RECORD']
    units = [all_headers['TIMESTAMP']['units'], all_headers['RECORD']['units']]
    process = [all_headers['TIMESTAMP']['process'], all_headers['RECORD']['process']]
    
    # Add the remaining headers, units, and process information
    for header in sorted(all_headers.keys()):
        if header not in ['TIMESTAMP', 'RECORD']:
            headers.append(header)
            units.append(all_headers[header]['units'])
            process.append(all_headers[header]['process'])

    return headers, units, process

# Function to process multiple .dat files in a folder and consolidate them into one output file
def consolidate_dat_files_to_dat(folder_path, output_file_path):
    all_headers = {}
    data_rows = []

    # Read each file in the folder
    for file_name in os.listdir(folder_path):
        if file_name.endswith(".dat"):
            file_path = os.path.join(folder_path, file_name)
            delimiter = detect_delimiter(file_path)

            # Extract headers, units, and process lines
            with open(file_path, 'r') as file:
                lines = file.readlines()
                headers = [h.strip('"') for h in lines[1].strip().split(delimiter)]
                units = [u.strip('"') for u in lines[2].strip().split(delimiter)]
                process = [p.strip('"') for p in lines[3].strip().split(delimiter)]
                
                # Store metadata in dictionary
                for i, header in enumerate(headers):
                    if header not in all_headers:
                        all_headers[header] = {'units': units[i], 'process': process[i]}
            
            # Read data and map to consolidated headers
            df = read_dat_file(file_path, delimiter=delimiter)
            if df is not None:
                # Ensure data rows are aligned to the consolidated headers
                df.columns = headers
                data_rows.append(df)

    # Consolidate headers, units, and process lines
    consolidated_headers, consolidated_units, consolidated_process = consolidate_metadata(all_headers)

    # Create consolidated DataFrame
    consolidated_df = pd.DataFrame(columns=consolidated_headers)

    # Map data from each file to the consolidated DataFrame
    for df in data_rows:
        for header in consolidated_headers:
            if header not in df.columns:
                df[header] = pd.NA
        consolidated_df = pd.concat([consolidated_df, df[consolidated_headers]], ignore_index=True)

    # Convert 'TIMESTAMP' column to datetime format and sort
    consolidated_df['TIMESTAMP'] = pd.to_datetime(consolidated_df['TIMESTAMP'], errors='coerce')
    consolidated_df = consolidated_df.sort_values('TIMESTAMP')

    # Remove exact duplicate rows
    consolidated_df.drop_duplicates(inplace=True)

#   # Add a column to flag duplicates with the same TIMESTAMP but different RECORD
#   consolidated_df['is_duplicate'] = consolidated_df.duplicated(subset=['TIMESTAMP'], keep=False) & ~consolidated_df.duplicated(subset=['TIMESTAMP', 'RECORD'], keep=False)

    # Write the metadata and consolidated data to the output file
    with open(output_file_path, 'w') as output_file:
        # Write common metadata
        output_file.write('TOA5,"Consolidated","CR1000","0000","CR1000.Std.32.05","CPU:Unknown.CR1","00000","Hourly"\n')
        output_file.write(','.join(consolidated_headers) + '\n')
        output_file.write(','.join(consolidated_units) + '\n')
        output_file.write(','.join(consolidated_process) + '\n')

        # Write the consolidated data
        consolidated_df.to_csv(output_file, sep=',', index=False, header=False, mode='a')

    print(f"Consolidated data saved to {output_file_path}")

# Example usage
folder_path = '/Users/privateprivate/Downloads/drive-download-20240920T101540Z-001/New Folder With Items/'  # Specify the folder containing the .dat files
output_file_path = '/Users/privateprivate/Downloads/drive-download-20240920T101540Z-001/New Folder With Items/consolidated_data.dat'  # Specify the output .dat file path
consolidate_dat_files_to_dat(folder_path, output_file_path)
