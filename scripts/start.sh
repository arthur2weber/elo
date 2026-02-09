#!/bin/bash

# Navigate to the directory containing the Docker Compose file
cd "$(dirname "$0")/.."

# Start the n8n application using Docker Compose
docker-compose up -d

# Wait for a few seconds to ensure n8n is up and running
sleep 10

# Output the status of the n8n service
docker-compose logs -f n8n