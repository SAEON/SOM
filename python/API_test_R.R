# Clear workspace
rm(list = ls())

# Function to install and load necessary libraries
setup_workspace <- function(packages) {
  new_packages <- packages[!(packages %in% installed.packages()[, "Package"])]
  if (length(new_packages) > 0) {
    install.packages(new_packages)
  }
  lapply(packages, library, character.only = TRUE)
}

required_packages <- c("httr", "jsonlite", "dplyr")
setup_workspace(required_packages)

# SSH and API connection details
ssh_host <- '192.168.115.73'
ssh_username <- 'paul' #check your username for ssh
ssh_password <- 'Elephant!32Rain' #your password here for ssh if changed

# JSON payload for authentication
data <- list(
  username = 'pauljeco',  # Replace with your username for the loggernet monitor website
  password = 'password'   # Replace with your password for the loggernet monitor website
)


# Local port for the SSH tunnel
local_port <- 6545  # some unused local port

# API endpoint
api_url <- paste0('http://localhost:', local_port, '/api/get-server-data')


# Remote API server and port
remote_host <- 'localhost'
remote_port <- 4000

# Create SSH tunnel using system call
ssh_tunnel_command <- paste0("sshpass -p '", ssh_password, "' ssh -N -L ", local_port, ":", remote_host, ":", remote_port, " ", ssh_username, "@", ssh_host)

# Run the SSH tunnel in the background
system(ssh_tunnel_command, wait = FALSE)

# Give the SSH tunnel some time to establish
Sys.sleep(2)  # Wait for 2 seconds for the SSH tunnel to be ready

# Make API call via the established tunnel
response <- httr::POST(
  url = api_url,
  body = data,
  encode = "json",
  add_headers('Content-Type' = 'application/json')
)

# Check and print response
if (response$status_code == 200) {
  result <- httr::content(response, "text")  # Get the response JSON as text
  
  # Convert the JSON response to a data frame using jsonlite
  df <- jsonlite::fromJSON(result, flatten = TRUE)
  
  # Rename columns for clarity if needed
  colnames(df) <- c("Server", "Table", "Field Name")
  
  # Print the data frame in a readable format
  print(df)
  
} else {
  print(paste('API call failed with status code:', response$status_code))
  print(paste('Response:', httr::content(response, "text")))
}

# Close the SSH tunnel
system("pkill -f 'ssh -N -L'")

