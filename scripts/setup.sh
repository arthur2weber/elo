#!/bin/bash

# This script sets up the initial environment and configurations for the ELO engine.

# Create necessary directories
mkdir -p automations logs

# Install dependencies
npm install

# Build TypeScript files
npm run build

echo "Setup completed successfully."