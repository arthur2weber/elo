# ELO (n8n AI Manager)

ELO is a local CLI tool that **writes and reads n8n workflow files** and scaffolds basic integration folders. It can optionally call a running n8n instance via REST API, and it can ask **Gemini CLI** to generate workflow JSON. There is no AI server in this repo; the “AI” is only invoked when the CLI calls the Gemini binary.

## 🎯 Vision (objective of ELO)

ELO is meant to be a **proactive smart‑home butler** that constantly adapts automations based on user preferences and daily device logs. The intended behavior is:

- Use AI decisions to **add nodes, conditions, integrations, and validations** fluidly.
- Treat automations as living flows: **nothing is fixed**, and workflows evolve as the user’s tastes change.
- Learn from **continuous device logs** to keep the house optimized and responsive.

> Note: The current codebase does not implement this full vision yet; the section above describes the intended direction of the project.

## ✅ What it really does today

- **Creates workflow JSON files** in `workflows/` (default mode).
- **Lists workflow JSON files** from `workflows/`.
- **Scaffolds a basic integration folder** in `integrations/<name>/` with a minimal `package.json` + `src/index.ts`.
- **Stores smart‑home device logs** in `logs/events.jsonl` via the CLI.
- **Monitors registered devices every second** when the server is running.
- **Stores user requests** in `logs/requests.jsonl`.
- **Runs a decision loop** that updates workflows from logs + requests + preferences.
- **Provides structured device context** (registry + status snapshot) to Gemini.
- **Validates device ids** in generated workflows using the `device:<id>` convention.
- **Updates workflow JSON files using AI** when you run `update-workflow --ai`.
- **Learns preference patterns** from user decisions (accept/reject suggestions).
- **Optionally uses Gemini CLI** to generate the workflow JSON content.
- **Optionally calls the n8n REST API** (if you choose `--mode api` and provide auth credentials when required).

## 🚫 What it does NOT do yet

- It **does not install integrations into a running n8n instance**. The CLI only creates local folders.
- It **does not validate or run workflows**.
- It **does not learn preferences automatically**; preferences come from recorded decisions and are summarized on demand.
- Preference learning today is **rule-based** (acceptance rate thresholds), not a full ML model.
- The `src/server/` Express app is just a placeholder and has no API routes.
- API mode uses `POST /workflows` only (no update endpoint yet).

## Project structure (real files in use)

- `src/cli/` — CLI entry and commands.
- `src/ai/` — Gemini CLI wrapper and prompt generator.
- `workflows/` — JSON files created by the CLI.
- `integrations/` — folder scaffolds created by the CLI.
- `logs/` — device logs stored as JSON Lines (created by the CLI).
- `logs/decisions.jsonl` — user acceptance/rejection history.
- `logs/requests.jsonl` — user requests history.
- `logs/devices.json` — device registry used by the monitor.
- `docker-compose.yml` — runs n8n + Postgres (not wired to the CLI by default).

## Setup

Install dependencies:

```bash
npm install
```

## Dockerized CLI (no local Gemini CLI needed)

The `elo-cli` service runs the CLI inside Docker, so your local machine does not need the Gemini CLI.
It builds from `docker/elo/Dockerfile` and includes **Google Cloud CLI + Gemini Code Assist (cloud-code-enterprise)**.

Build arg supported:

- `GEMINI_CLI_INSTALL`: shell command to install your Gemini CLI inside the image (leave empty to skip).

The container uses these runtime environment variables (same as local usage):

- `GEMINI_CLI_BIN` (default: `gemini`)
- `GEMINI_CLI_ARGS` (extra CLI args)
- `GEMINI_CLI_PROMPT_ARG` (if your CLI uses a flag to pass the prompt)

### Gemini Code Assist CLI (Google Cloud)

The container image installs:

- `gcloud` (Google Cloud CLI)
- `cloud-code-enterprise` component (Gemini Code Assist CLI)

Authentication happens inside the container and is persisted in a volume (`gcloud_config`).
Run both logins once per environment:

```bash
docker compose run --rm elo-cli gcloud auth login
docker compose run --rm elo-cli gcloud auth application-default login
```

After authentication, set `GEMINI_CLI_BIN` + `GEMINI_CLI_ARGS` to the command that invokes Gemini Code Assist in your setup.
This project will call that command with the prompt you provide.

## Gemini CLI + Google AI Studio

The CLI calls a local **Gemini CLI** binary. Configure your Gemini CLI separately (tokens, Google AI Studio, etc).

Environment variables used by the code:

- `GEMINI_CLI_BIN` (default: `gemini`)
- `GEMINI_CLI_ARGS` (extra CLI args)
- `GEMINI_CLI_PROMPT_ARG` (if your CLI uses a flag to pass the prompt)
- `N8N_MODE` (`files` or `api`, default: `files`)
- `N8N_FILES_PATH` (default: project root)
- `N8N_API_BASE_URL` (default: `http://localhost:5678/rest`)
- `N8N_BASIC_AUTH_USER` / `N8N_BASIC_AUTH_PASSWORD` (optional, for protected n8n)

## CLI usage (tested behavior)

```bash
npm run cli create-workflow "My Workflow"
npm run cli create-workflow "Sales Pipeline" --ai --description "Capture leads and notify Slack"
npm run cli install-integration "My Custom Node" --description "Internal tooling"
npm run cli list-workflows
npm run cli add-log --device "thermostat" --event "temperature" --payload '{"value":23}'
npm run cli add-device --id "office-thermostat" --name "Thermostat" --room "office" --endpoint "http://localhost:8081/status"
npm run cli add-request --request "Ajuste o ar para 23C" --user "arthur" --context "office"
npm run cli record-decision --action-key "set-office-temp-23" --suggestion "Adjust office temp" --accepted
npm run cli summarize-preferences
npm run cli update-workflow "My Workflow" --ai --preferences "Prefer warmer evenings" --log-limit 100
npm run cli create-workflow "My Workflow" --mode api
```

## Example flow (smart-home butler)

1) **Ingest device logs** during the day:

```bash
npm run cli add-log --device "office-thermostat" --event "temperature" --payload '{"value":27}'
npm run cli add-log --device "office-thermostat" --event "temperature" --payload '{"value":28}'
```

2) **Record user decisions** when the butler suggests something:

```bash
npm run cli record-decision --action-key "set-office-temp-23" \
	--suggestion "Adjust office temperature to 23C and enable silent mode" \
	--accepted
```

3) **Review inferred preferences**:

```bash
npm run cli summarize-preferences
```

4) **Update the workflow using AI + logs + preferences**:

```bash
npm run cli update-workflow "Office Comfort" --ai --log-limit 100
```

## AI decision examples (based on device status + requests)

Example 1:

- User request: "Ligue o ar condicionado do escritório"
- Device status: window is open
- Expected AI behavior: ask for confirmation before turning on AC.

Example 2:

- Calendar: meeting at 19h
- Device status: office at 29°C, window open
- Expected AI behavior: skip turning on AC until the window is closed, log the reason, and notify later.

## Docker (optional)

`docker-compose.yml` spins up **n8n + Postgres**, but the CLI still defaults to file mode unless you pass `--mode api`.

```bash
docker-compose up --build
```

## Always-on monitoring

When the server starts, it polls registered devices every second and appends status logs.

```bash
npm start
```

Environment variables:

- `ELO_MONITOR_ENABLED` (default: true)
- `ELO_MONITOR_INTERVAL_MS` (default: 1000)
- `N8N_HEALTH_URL` (default: `http://localhost:5678/healthz`)
- `ELO_DECISION_LOOP_ENABLED` (default: true)
- `ELO_DECISION_INTERVAL_MS` (default: 10000)
- `ELO_DECISION_LOG_LIMIT` (default: 100)
- `ELO_DECISION_REQUEST_LIMIT` (default: 50)
- `ELO_DECISION_WORKFLOWS` (comma-separated workflow names)

## n8n startup + workflow API test

This script brings up n8n via Docker Compose and performs a basic workflow CLI import/export check.

```bash
npm run test:n8n
```

## Smoke test

This repo includes a small smoke test that validates file-based workflow + integration creation.

```bash
npm run smoke
```