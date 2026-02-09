#!/bin/bash

# This script sets up the initial environment and configurations for the n8n AI Manager project.

# Create necessary directories
mkdir -p workflows integrations/custom-node/src

# Copy sample workflow
cp ./workflows/sample-workflow.json ./workflows/sample-workflow.json.bak

# Install dependencies
npm install

# Build TypeScript files
npm run build

echo "Setup completed successfully."