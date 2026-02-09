# n8n AI Manager

This project is an AI-enhanced manager for n8n, designed to streamline the creation and management of workflows through a command-line interface (CLI) and AI integration.

## Project Structure

- **docker/**: Contains Docker-related files for building and running the n8n application.
  - **n8n/**: Dockerfile for setting up the n8n environment.
  
- **docker-compose.yml**: Defines the services and configurations for running the n8n container.

- **.env**: Environment variables for database connections and API keys.

- **src/**: Source code for the CLI and AI functionalities.
  - **cli/**: Command-line interface implementation.
    - **commands/**: Contains commands for creating workflows, installing integrations, and listing workflows.
    - **utils/**: Utility functions for interacting with the n8n API.
  - **ai/**: AI agent and prompt definitions.
  - **server/**: Server setup and initialization.
  - **types/**: Type definitions used throughout the project.

- **workflows/**: Contains sample workflows in JSON format.

- **integrations/**: Custom integration nodes for extending n8n functionality.

- **scripts/**: Shell scripts for starting and setting up the application.

- **package.json**: npm configuration file for managing dependencies and scripts.

- **tsconfig.json**: TypeScript configuration file.

## Setup Instructions

1. Clone the repository:
   ```
   git clone <repository-url>
   cd n8n-ai-manager
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Configure environment variables in the `.env` file.

### Gemini CLI + Google AI Studio

This project uses **Gemini CLI** to generate workflow JSON when you pass `--ai` to the CLI.

Set the following environment variables (via `.env` or your shell):

- `GEMINI_CLI_BIN` (default: `gemini`) — CLI binary name.
- `GEMINI_CLI_ARGS` — extra args for your Gemini CLI setup (space-separated).
- `GEMINI_CLI_PROMPT_ARG` — if your CLI expects the prompt as a flag, set this (e.g. `--prompt`).
- `N8N_MODE` (default: `files`) — choose `files` (local JSON files) or `api` (n8n REST API).
- `N8N_FILES_PATH` (default: project root) — base path for `workflows/` and `integrations/`.

Google AI Studio should be configured by the Gemini CLI itself (API keys or auth files). Follow the
Gemini CLI installation instructions and ensure it can respond to prompts in your environment.

4. Build and run the Docker containers:
   ```
   docker-compose up --build
   ```

5. Use the CLI to manage workflows and integrations:
   ```
   npm run cli <command>
   ```

### CLI Examples

- Create a workflow JSON file (default `files` mode):
   - `npm run cli create-workflow "My Workflow"`

- Create a workflow with Gemini:
   - `npm run cli create-workflow "Sales Pipeline" --ai --description "Capture leads and notify Slack"`

- Install a local integration scaffold:
   - `npm run cli install-integration "My Custom Node" --description "Internal tooling"`

- List workflows from files:
   - `npm run cli list-workflows`

- Use API mode (requires `N8N_API_BASE_URL`):
   - `npm run cli create-workflow "My Workflow" --mode api`

## Usage

- **Create a Workflow**: Use the CLI command to create a new workflow.
- **Install an Integration**: Use the CLI command to install a new integration.
- **List Workflows**: Retrieve and display all existing workflows.

## Contributing

Contributions are welcome! Please submit a pull request or open an issue for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.