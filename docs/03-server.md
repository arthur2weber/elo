# 03 — Servidor e UI (comportamento real)

Este documento descreve o que o servidor faz exatamente e como os endpoints se comportam.

Ponto de entrada
- `src/server/index.ts` carrega automações, inicia monitor/discovery e registra a UI e APIs via `registerHttpUi(app)`.
- Porta padrão: `3000` (configurável via `PORT` env var).

Principais endpoints (implementados em `http-ui.ts`)
- `GET /api/status` — retorna um resumo do estado (dispositivos, logs recentes, sugestões).
- `GET /api/devices` — lista dispositivos registrados (lê `logs/devices.json`).
- `POST /api/devices/:id/actions/:action` — dispara `dispatchAction("<id>=<action>")` e devolve o resultado imediato do driver.
- `POST /api/chat` — passa a mensagem ao agente (`AIAgent.processInputWithContext`) usando contexto de dispositivos e histórico; espera JSON `{ action, message }` ou usa texto bruto como fallback.

Como ações são despachadas
- A UI só envia uma string do tipo `id=action` para `dispatchAction`.
- `dispatchAction` carrega `logs/drivers/<id>.json`. Se não encontrado, devolve `driver_not_found`.
- Se o driver existe, o driver é instanciado (`GenericHttpDriver`) e `executeAction(action, params)` é chamado.
- `dispatchAction` monta `params` a partir de `devices.json` (prioriza `secrets`, `config`, `notes`) e injeta `ip`.
- Se a execução retornar metadata.token, `dispatchAction` atualiza o dispositivo (salva token em `secrets`) via `addDevice`.

Logs e eventos
- A maior parte das ações é logada em `logs/requests.jsonl` / `logs/events.jsonl` por `appendLogEntry` e APIs auxiliares.
- O módulo também registra entradas para `ai-usage.jsonl` quando faz chamadas à API de linguagem.

Observações sobre comportamento real
- O chat espera JSON, mas _não bloqueia_ a experiência se a IA retornar texto não-JSON — atualmente o sistema exibirá o texto e seguirá sem executar ações se a chave `action` estiver ausente.
- Endpoints de pairing (ex.: TV Samsung) disparam WebSocket handshakes; o fluxo correto depende de `ms.channel.connect` e possivelmente da interação do usuário no dispositivo (apertar Allow).

Configurações relevantes (env vars)
- `PORT` — porta do servidor.
- `ELO_MONITOR_ENABLED`, `ELO_DISCOVERY_ENABLED`, `ELO_DECISION_LOOP_ENABLED` booleans para habilitar recursos.
- `GEMINI_API_KEY`, `GEMINI_API_MODEL`, `GEMINI_API_BASE_URL` para integração com modelo de linguagem.

Próximo: documentação detalhada do executor de drivers e dos geradores automáticos.

## Referências de código (fonte)

Veja as implementações reais a seguir para confirmar comportamento e rastrear mudanças no código:

- `src/server/index.ts` — arranque da aplicação e registro da UI (`registerHttpUi(app)`).
- `src/server/http-ui.ts` — função `export const registerHttpUi` que implementa todos os endpoints REST descritos neste documento (chat, dispositivos, actions, pairing, config, reset).
- `src/server/action-dispatcher.ts` — `export const dispatchAction(actionString)` faz o carregamento de `logs/drivers/<id>.json`, monta `params` (inclui `ip`, `secrets`, `notes`) e instancia `GenericHttpDriver`.

Abra os arquivos acima no editor para pular diretamente às funções listadas (procure pelos identificadores `registerHttpUi` e `dispatchAction`).
