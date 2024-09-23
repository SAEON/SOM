import pandas as pd
from sshtunnel import SSHTunnelForwarder
import psycopg2
import sys

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

# Define the path to your CSV file
csv_file_path = '/Users/privateprivate/Downloads/phentab_sts_db.csv'

# Read the CSV file into a DataFrame
df = pd.read_csv(csv_file_path)

# Filter out rows where uz_phen_name is invalid or NaN
df = df.dropna(subset=['uz_phen_name'])
df = df[df['uz_phen_name'].apply(lambda x: isinstance(x, str) and x.strip() != '')]

# Establish an SSH tunnel and connect to PostgreSQL
with SSHTunnelForwarder(
    (ssh_host, 22),
    ssh_username=ssh_username,
    ssh_password=ssh_password,
    remote_bind_address=(db_host, db_port),
    local_bind_address=('localhost', local_port)
) as tunnel:
    conn = psycopg2.connect(
        dbname=db_name,
        user=db_user,
        password=db_password,
        host='localhost',
        port=local_port
    )
    cur = conn.cursor()
    
    # Fetch data from the units_mapping table
    cur.execute("SELECT id, uz_phen_name FROM units_mapping")
    rows = cur.fetchall()
    
    # Create a dictionary for easy lookup
    units_mapping_dict = {row[1]: row[0] for row in rows}
    
    # Prepare the update statement
    update_query = """
    UPDATE units_mapping
    SET phen_name_full = %s, phen_type = %s, phen_name = %s, units = %s, measure = %s,
        "offset" = %s, var_type = %s, uz_units = %s, uz_measure = %s
    WHERE id = %s
    """
    
    # Prepare the insert statement
    insert_query = """
    INSERT INTO units_mapping (phen_name_full, phen_type, phen_name, units, measure, "offset", var_type, uz_phen_name, uz_units, uz_measure)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    
    total_rows = len(df)
    for index, row in df.iterrows():
        uz_phen_name = row['uz_phen_name']
        
        try:
            # Check if uz_phen_name exists in the PostgreSQL table
            if uz_phen_name in units_mapping_dict:
                # Get the ID of the matching row
                row_id = units_mapping_dict[uz_phen_name]
                
                # Update the row in the PostgreSQL table
                cur.execute(update_query, (
                    row['phen_name_full'], row['phen_type'], row['phen_name'], row['units'], 
                    row['measure'], row['offset'], row['var_type'], row['uz_units'], 
                    row['uz_measure'], row_id
                ))
            else:
                # Insert the new row into the PostgreSQL table
                cur.execute(insert_query, (
                    row['phen_name_full'], row['phen_type'], row['phen_name'], row['units'], 
                    row['measure'], row['offset'], row['var_type'], row['uz_phen_name'], 
                    row['uz_units'], row['uz_measure']
                ))
                
            # Commit the transaction for each row
            conn.commit()
            
        except psycopg2.errors.UniqueViolation:
            print(f"Skipping duplicate entry for uz_phen_name {uz_phen_name}", file=sys.stderr)
            conn.rollback()  # Rollback the current transaction to avoid blocking subsequent commands
        except Exception as e:
            print(f"Error processing row {index+1}/{total_rows} for uz_phen_name {uz_phen_name}: {e}", file=sys.stderr)
            conn.rollback()  # Rollback the current transaction to avoid blocking subsequent commands
            
        if (index + 1) % 10 == 0 or (index + 1) == total_rows:
            print(f"Processed {index + 1} of {total_rows} rows")
            
    # Close the connection
    cur.close()
    conn.close()
    