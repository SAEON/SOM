# Assuming you paste your data as a string:
#https://lognet.saeon.ac.za/?command=dataquery&uri=Server:CR1000_Constantiaberg.Public&format=json&mode=most-recent&p1=2800
#CREATE SCHEMA cr1000_dwarsberg_jonkershoek;
#GRANT USAGE ON SCHEMA cr1000_dwarsberg_jonkershoek TO saeon;
#GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA cr1000_dwarsberg_jonkershoek TO saeon;


data_str = """
[
            {
                "name": "LWmV_Max",
                "type": "xsd:float",
                "units": "mV",
                "process": "Max",
                "settable": false
            },
            {
                "name": "LWmV_Min",
                "type": "xsd:float",
                "units": "mV",
                "process": "Min",
                "settable": false
            },
            {
                "name": "LWMDry_Tot",
                "type": "xsd:float",
                "units": "Minutes",
                "process": "Tot",
                "settable": false
            },
            {
                "name": "LWMCon_Tot",
                "type": "xsd:float",
                "units": "Minutes",
                "process": "Tot",
                "settable": false
            },
            {
                "name": "LWMWet_Tot",
                "type": "xsd:float",
                "units": "Minutes",
                "process": "Tot",
                "settable": false
            },
            {
                "name": "LWmV_2_Max",
                "type": "xsd:float",
                "units": "mV",
                "process": "Max",
                "settable": false
            },
            {
                "name": "LWmV_2_Min",
                "type": "xsd:float",
                "units": "mV",
                "process": "Min",
                "settable": false
            },
            {
                "name": "LWMDry_2_Tot",
                "type": "xsd:float",
                "units": "Minutes",
                "process": "Tot",
                "settable": false
            },
            {
                "name": "LWMCon_2_Tot",
                "type": "xsd:float",
                "units": "Minutes",
                "process": "Tot",
                "settable": false
            },
            {
                "name": "LWMWet_2_Tot",
                "type": "xsd:float",
                "units": "Minutes",
                "process": "Tot",
                "settable": false
            }
        ]
"""

# Convert 'false' and 'true' to 'False' and 'True'
data_str = data_str.replace("false", "False").replace("true", "True")

# Evaluate the corrected string to get a Python list
fields = eval(data_str)



# Define a type mapping (in case you have other types in the future)
type_mapping = {
    "xsd:float": "FLOAT",
    "xsd:int": "INTEGER",   # Add mapping for xsd:int
    "xsd:string": "TEXT"
    # Add other mappings as needed
}



# Start constructing the SQL statement
table_name = "cr1000_dwarsberg_jonkershoek.table4"
sql = f"CREATE TABLE {table_name} (\n  time TIMESTAMP,"

# Add fields to the SQL statement
for field in fields:
    sql_type = type_mapping.get(field["type"], "UNKNOWN_TYPE")
    sql += f"\n  {field['name'].lower()} {sql_type},"

# Remove the trailing comma, close the parentheses, and append additional SQL statements
sql = sql.rstrip(",") + "\n);\n\n"
# Extracting schema and table from table_name
schema_name, table_only_name = table_name.split('.')

# SQL statements generated from table_name
sql += f"SET search_path TO {schema_name};\n"
sql += f"ALTER TABLE {table_only_name} ADD CONSTRAINT unique_time_{table_only_name}_{schema_name} UNIQUE (time);\n"
sql += f"GRANT INSERT, UPDATE, DELETE ON TABLE {table_name} TO saeon;\n"
sql += f"GRANT USAGE ON SCHEMA {schema_name} TO saeon;\n"
sql += f"GRANT INSERT ON TABLE {table_name} TO saeon;\n"
sql += f"GRANT SELECT ON ALL TABLES IN SCHEMA {schema_name} TO saeon;\n"


# ... [rest of your code above]


# Add metadata table creation
metadata_table_name = f"{schema_name}.{table_only_name}_metadata"
sql += f"\nCREATE TABLE {metadata_table_name} ("
sql += "\n  name TEXT PRIMARY KEY,"
sql += "\n  type TEXT,"
sql += "\n  units TEXT,"
sql += "\n  process TEXT,"
sql += "\n  settable BOOLEAN"
sql += "\n);\n"


# Add the insertion to the metadata table
sql += f"\nINSERT INTO {metadata_table_name} (name, type, units, process, settable)\nVALUES"
values_list = []
for field in fields:
    # Using the get method to handle potential missing keys
    name = field.get('name', 'NULL')
    type_ = field.get('type', 'NULL')
    units = field.get('units', 'NULL')
    process = field.get('process', 'NULL')  # using get to handle missing 'process' key
    settable = field.get('settable', 'False')
    values_list.append(f"('{name}', '{type_}', '{units}', '{process}', {settable})")
sql += ',\n'.join(values_list) + ";\n"



## Add the insertion to the metadata table
#sql += f"\nINSERT INTO {metadata_table_name} (name, type, units, process, settable)\nVALUES"
#values_list = []
#for field in fields:
#   values_list.append(f"('{field['name']}', '{field['type']}', '{field['units']}', '{field['process']}', {field['settable']})")
#sql += ',\n'.join(values_list) + ";\n"

# SQL permissions for metadata table
sql += f"SET search_path TO {schema_name};\n"
sql += f"GRANT INSERT, UPDATE, DELETE ON TABLE {metadata_table_name} TO saeon;\n"
sql += f"GRANT USAGE ON SCHEMA {schema_name} TO saeon;\n"
sql += f"GRANT INSERT ON TABLE {metadata_table_name} TO saeon;\n"
sql += f"GRANT SELECT ON ALL TABLES IN SCHEMA {schema_name} TO saeon;\n"

print(sql)

# Prepending 'TIMESTAMP': 'time' to the mapping
column_mapping = {'TIMESTAMP': 'time'}

# Looping through the fields list and adding to the column mapping
for field in fields:
    column_mapping[field['name']] = field['name'].lower().replace('_', '_')
    
print(column_mapping)
