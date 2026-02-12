# 02 — Módulos do projeto

Este arquivo lista os módulos reais do repositório e descreve, objetivamente, o que cada um faz (comportamento verificado pelo código).

- `src/server`
  - Ponto de entrada da aplicação (`index.ts`), expõe API HTTP e registra UI.
  - `http-ui.ts`: implementa endpoints REST e a UI estática (dashboard). Gera contexto para o agente (dispositivos, logs). Roteia comandos para `dispatchAction`.
  - `action-dispatcher.ts`: recebe ações na forma `device=action`, carrega driver JSON em `logs/drivers/<device>.json` e executa via `GenericHttpDriver`.
  - `discovery.ts` / `device-monitor.ts`: descoberta em rede (SSDP/mDNS) e monitoramento de saúde; responsáveis por alimentar geradores.
  - `generators/*`: módulo para gerar drivers automaticamente.

- `src/drivers`
  - `http-generic.ts` (GenericHttpDriver): executor genérico de ações declarativas (HTTP/WS). Suporta placeholders `{ip}`, `{token}`, `{mac}` e trata handshakes WebSocket para dispositivos que exigem pairing (ex: Samsung Tizen).

- `src/server/generators`
  - `driver-generator.ts`: lógica que decide quando e como gerar drivers (varredura de portas, heurísticas, prompts para Gemini, retries, gravação em `logs/drivers`).
  - `driver-verifier.ts`: valida propostas antes da publicação (verificação básica).
  - `templates.ts` e `knowledge-base.ts`: templates e KB usados para sugerir drivers iniciais.

- `src/ai`
  - `gemini-api.ts`: wrapper HTTP para a API Gemini (configura URL, model e payload), coleta métricas de uso.
  - `gemini.ts`: adaptador simples que exporta `runGeminiPrompt`.
  - `agent.ts`: consumidor de prompts e orquestrador de chamadas para Gemini; faz parsing de JSON/resposta.
  - `prompts.ts`: contratos de prompt usados por geradores, chat e políticas de aprovação.

- `src/cli` e `scripts`
  - Utilitários para ingestão de dados, testes e manutenção. Mantêm os arquivos de logs/local (e.g., `logs/devices.json`, `logs/drivers/*.json`).

- `logs/drivers`
  - Local onde drivers JSON gerados ou editados manualmente são armazenados para execução por `dispatchAction`.

Observação: Os nomes dos arquivos e a presença de módulos no diretório `docs` podem já conter guias e anotações (ex.: `06-samsung-tizen-guide.md`), revise-os para manter um único ponto de verdade.
