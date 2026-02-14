# ELO — Avaliação Arquitetural Completa

> **Data:** Junho 2025  
> **Visão alvo:** ELO como cérebro doméstico com STT/TTS local + Gemini 2.5 Flash para inteligência/aprendizado  
> **Capacidades alvo:** (1) Aprendizado por reforço, (2) Reconhecimento facial + segurança, (3) Mapeamento de rotinas por observação, (4) Mordomo invisível/preditivo

---

## 1. Estado Atual — Radiografia

### 1.1 Stack Técnica
| Componente | Tecnologia | Maturidade |
|---|---|---|
| Runtime | Node.js 20, TypeScript | ✅ Sólido |
| HTTP Server | Express 4.x | ✅ Funcional |
| Database | better-sqlite3 (elo.db) | ⚠️ Funcional, schema limitado |
| AI | Gemini API (gemini-1.5-flash padrão) | ⚠️ Funcional, sem memory |
| Streaming | go2rtc v1.9.14 (Docker, host network) | ✅ Bem integrado |
| Discovery | mDNS + TCP scan + UDP broadcast + SSDP | ✅ Robusto |
| Driver execution | GenericHttpDriver (HTTP/WS/SOAP) | ✅ Flexível |
| Frontend | Vanilla JS (app.js, sem framework) | ⚠️ Funcional, não escala |
| Containerização | Docker Compose (elo-core + go2rtc) | ✅ Funcional |

### 1.2 Módulos Core e Suas Capacidades

#### ✅ Funcionando Bem
- **Discovery** (851 linhas): Multi-protocol (mDNS, TCP, UDP, SSDP), fingerprinting via Gemini, métricas, dedup por IP registrado, concurrency limiter
- **Driver Generator**: Pipeline completo (port scan → identify → template match → LLM fallback → verify → save), ONVIF probing, knowledge base
- **Action Dispatcher**: Resolve driver → injeta parâmetros do device → executa via GenericHttpDriver → captura tokens
- **Device Monitor**: Polling com state hash (só loga mudanças), health checks
- **Camera Streaming**: go2rtc com dual-source (nativo + ffmpeg H265→H264), proxy WebSocket, frame API
- **Chat**: Persona de mordomo (português), memória de sessão (8 mensagens), context com status dos devices

#### ⚠️ Funcional mas Limitado
- **Decision Loop**: Só atualiza automações existentes, não cria novas proativamente. Depende de `ELO_DECISION_AUTOMATIONS` env var. Intervalo fixo (10s padrão)
- **Automation Engine** (58 linhas): Loader simples — importa .js/.ts de `automations/`, executa no POST /events. Sem scheduler, sem condições, sem hot-reload, sem dependency injection
- **Pattern Recognition** (agent.ts): Conta padrões recorrentes por hora+device+action (threshold ≥3). Não faz correlação causal entre sensores/dispositivos
- **Preferences**: Auto-approve com ≥3 aceitos e ≥70% taxa. Funciona por actionKey, mas não tem contexto temporal (dia/noite, dia da semana)
- **Storage**: Agregação por hora (events, ai_usage). Perde granularidade temporal. Requests não têm agregação real

#### ❌ Inexistente
- **STT/TTS**: Nenhum processamento de voz
- **Reconhecimento Facial**: Nenhum pipeline de visão computacional
- **Event Bus**: Sem pub/sub — eventos vão direto ao automation_engine via POST /events
- **Perfis de Usuário**: Sem conceito de pessoas/identidades/preferências individuais
- **Scheduler**: Sem cron/scheduling nativo para automações
- **Aprendizado por Reforço**: Sem loop de correção → ajuste comportamental
- **Análise de Séries Temporais**: Sem trending, anomaly detection, previsão
- **Notificações Push**: Sem Telegram, push notifications, alertas
- **Testes Automatizados**: Sem test suite (apenas smoke test)

---

## 2. Gap Analysis — Visão vs. Realidade

### 2.1 Capacidade 1: Aprendizado por Reforço de Intenções

**Cenário:** "Ligar TV" → volume alto → Arthur reclama "muito alto" → ELO aprende que às 22h o volume deve ser baixo.

| Requisito | Estado | Gap |
|---|---|---|
| Capturar ação executada | ✅ Events table | — |
| Capturar correção do usuário | ❌ | Não existe conceito de "correção" vs "novo comando" |
| Associar contexto temporal | ❌ | Preferences não têm hora/dia. Events agregados por hora perdem granularidade |
| Criar regra contextual | ❌ | Decision loop só atualiza automações existentes |
| Graduar confiança | ⚠️ | Auto-approve existe (≥3/70%) mas sem contexto temporal |
| Aplicar regra aprendida | ❌ | Sem engine de regras contextuais |

**O que falta construir:**
1. **Feedback Loop** — Tabela `corrections` (device, action, original_params, corrected_params, context: {time, day, people_present})
2. **Contextual Rules Engine** — Regras com condições temporais: `IF device=tv AND action=turnOn AND hour>=22 THEN volume=15`
3. **Confidence Scoring** — Cada regra ganha/perde peso baseado em aceitação/correção
4. **Decision Loop v2** — Consulta regras contextuais ANTES de executar ações, não só depois

### 2.2 Capacidade 2: Reconhecimento Facial + Segurança (Lucca)

**Cenário:** Câmera detecta rosto desconhecido → alerta Telegram. Lucca tenta ligar fogão → ELO bloqueia e avisa Arthur.

| Requisito | Estado | Gap |
|---|---|---|
| Capturar frames das câmeras | ✅ | go2rtc frame API funciona |
| Detectar rostos | ❌ | Nenhum pipeline de visão |
| Cadastro de rostos conhecidos | ❌ | Sem banco de embeddings faciais |
| Identificar pessoa | ❌ | — |
| Perfis por pessoa | ❌ | Sem tabela de pessoas/restrições |
| Alertas (Telegram) | ❌ | Sem sistema de notificações |
| Bloqueio de ações por perfil | ❌ | Action dispatcher não verifica permissões |

**O que falta construir:**
1. **Face Detection Pipeline** — Worker que captura frames via go2rtc → detecta/reconhece rostos. Opções locais: face-api.js (TensorFlow.js), InsightFace (Python sidecar), ou DeepFace
2. **People Registry** — Tabela `people` (id, name, face_embeddings[], role: admin|child|guest, restrictions: {blocked_devices, blocked_actions, time_limits})
3. **Notification Service** — Módulo plugável: Telegram Bot API, push notification, webhook
4. **Permission Middleware** — Interceptor no action-dispatcher que verifica `who` + `what` contra regras de permissão

### 2.3 Capacidade 3: Mapeamento Genérico de Rotinas

**Cenário:** ELO observa que janela abre + temperatura >28°C sempre resulta em fechar cortinas → propõe automação.

| Requisito | Estado | Gap |
|---|---|---|
| Coletar estados dos sensores | ✅ | Device monitor com state hash |
| Armazenar histórico granular | ⚠️ | Agregação por hora perde granularidade |
| Correlacionar eventos | ❌ | Pattern recognition é count-based, não causal |
| Detectar co-ocorrências | ❌ | — |
| Propor automação | ⚠️ | Suggestions existem mas são geradas pelo decision loop (que é limitado) |
| Validar com usuário | ✅ | Approval flow funciona |

**O que falta construir:**
1. **Event Store Granular** — Não agregar events por hora. Manter cada evento com timestamp preciso. Criar views agregadas separadamente para economia de storage
2. **Correlation Engine** — Detectar padrões tipo "evento A acontece consistentemente N minutos antes de evento B". Sliding window analysis
3. **Rule Proposer** — Gemini recebe correlações detectadas + contexto → propõe automação com trigger+condition+action
4. **Confidence + Decay** — Regras propostas ganham confiança se o padrão persiste, perdem se o comportamento muda

### 2.4 Capacidade 4: Mordomo Invisível (Preditivo)

**Cenário:** AC perdendo eficiência gradualmente → ELO detecta e avisa "Filtro do ar precisa de limpeza".

| Requisito | Estado | Gap |
|---|---|---|
| Monitorar métricas contínuas | ⚠️ | Device monitor existe mas só tracks on/off, não métricas numéricas |
| Séries temporais | ❌ | Sem trending/baseline |
| Anomaly detection | ❌ | — |
| Previsão de degradação | ❌ | — |
| Alerta proativo | ❌ | Sem notificações |

**O que falta construir:**
1. **Metrics Store** — Tabela `device_metrics` (device_id, metric_name, value, timestamp) com retenção configurável
2. **Baseline Calculator** — Média móvel por device+metric, com desvio padrão para anomaly detection
3. **Trend Analyzer** — Regressão linear simples para detectar degradação lenta (ex: tempo para atingir temperatura alvo aumentando)
4. **Proactive Alerts** — Gemini analisa trends + baselines → gera sugestões de manutenção

---

## 3. STT/TTS Local — Análise Técnica

### 3.1 Por Que Local?
- **Privacidade**: Conversas domésticas nunca saem de casa
- **Latência zero**: Essencial para interação com criança de 6 anos (Lucca)
- **Economia de tokens**: Gemini recebe apenas texto limpo, não áudio

### 3.2 Opções STT (Speech-to-Text)

| Solução | Runtime | Qualidade PT-BR | Latência | RAM |
|---|---|---|---|---|
| **Whisper.cpp** | C++ (nativo) | ★★★★★ | ~1-3s (small model) | ~500MB |
| **Faster-Whisper** | Python (CTranslate2) | ★★★★★ | ~0.5-2s | ~1GB |
| **Vosk** | Python/C++ | ★★★☆☆ | <500ms (streaming) | ~50MB |
| **whisper-node** | Node.js binding | ★★★★★ | ~2-4s | ~500MB |

**Recomendação:** **Faster-Whisper** como sidecar Python com modelo `small` ou `medium` para PT-BR. Alternativa: **Vosk** se latência <500ms for prioridade (streaming mode).

### 3.3 Opções TTS (Text-to-Speech)

| Solução | Runtime | Qualidade PT-BR | Latência |
|---|---|---|---|
| **Piper TTS** | C++ (ONNX) | ★★★★☆ | <200ms |
| **Coqui TTS** | Python | ★★★★★ | ~500ms |
| **espeak-ng** | C | ★★☆☆☆ | <50ms |
| **edge-tts** | Python (Azure Edge) | ★★★★★ | ~300ms (usa rede) |

**Recomendação:** **Piper TTS** para produção (C++, rápido, offline). Vozes PT-BR disponíveis. Container separado no docker-compose.

### 3.4 Arquitetura de Integração

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Microphone  │───▶│  STT Worker  │───▶│  ELO Brain   │───▶│  TTS Worker  │───▶ Speaker
│ (ESP32/USB) │    │ Faster-Whisper│   │ (Node.js)    │    │ (Piper)      │
└─────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                         │                    │
                    texto puro          texto resposta
                         │                    │
                         ▼                    ▼
                   POST /api/stt        POST /api/tts
                   → { text }           → audio/wav
                         │
                         ▼
                   POST /api/chat (existente)
                   → Gemini só recebe texto
```

**Adições ao docker-compose.yml:**
- `elo-stt` — Faster-Whisper ou Vosk, expõe API HTTP na porta 8501
- `elo-tts` — Piper TTS, expõe API HTTP na porta 8502
- Hardware: Microfone USB no host ou ESP32-S3 com wake word local (OpenWakeWord/Micro Wake Word)

---

## 4. Gemini 2.5 Flash — Upgrade Path

### 4.1 Estado Atual
- Modelo padrão: `gemini-1.5-flash`
- maxOutputTokens: 200 (muito baixo para automações complexas)
- Temperature: 0.3, topP: 0.8
- Thinking budget suportado mas raramente usado
- Chamadas diretas via axios (sem SDK oficial)

### 4.2 Melhorias Necessárias

1. **Modelo** — Trocar `gemini-1.5-flash` → `gemini-2.5-flash` (já configurado como default no fingerprint)
2. **maxOutputTokens** — Aumentar de 200 para 2048 (automações e drivers precisam de mais espaço)
3. **System Instructions** — Gemini 2.5 suporta system instructions separadas do prompt. Mover a persona do mordomo para system instruction permanente
4. **Structured Output** — Usar `response_mime_type: "application/json"` + schema para eliminar parsing de markdown
5. **Long Context** — Gemini 2.5 Flash tem 1M tokens. Usar para enviar todo o contexto da casa de uma vez (devices + history + preferences + rules)
6. **Caching** — Gemini API Context Caching para o contexto estável da casa (devices, regras fixas)

---

## 5. Problemas Estruturais Identificados

### 5.1 Ausência de Event Bus
**Impacto:** Componentes não se comunicam reativamente. Device monitor descobre mudança de estado mas não notifica ninguém exceto logging. Automations só rodam via POST /events externo.

**Solução:** EventEmitter nativo do Node.js ou implementação mínima de pub/sub:
```
eventBus.emit('device:state_changed', { deviceId, oldState, newState, timestamp })
eventBus.emit('person:detected', { cameraId, personId, confidence })
eventBus.emit('user:correction', { deviceId, action, correction })
```

### 5.2 Automation Engine Primitivo
**Impacto:** Sem scheduler, sem condições compostas, sem triggers reativos, sem hot-reload.

**Solução:**
- Triggers: `on_event`, `on_schedule` (cron), `on_state` (device state matches condition)
- Conditions: `and/or/not` composições, time windows, state checks
- Actions: Sequência com error handling, delays, parallel execution
- Hot-reload: Watch no diretório `automations/` com chokidar

### 5.3 Database Schema Incompleto
**Impacto atual:** Tabelas mínimas (devices, drivers, events, requests, decisions, suggestions, ai_usage). Não suporta people, metrics, rules, corrections, face_embeddings.

### 5.4 Frontend Não Escala
**Impacto:** app.js monolítico (vanilla JS). Funciona para dashboard simples, mas não para gestão de pessoas, regras, métricas, timeline de eventos.

**Solução de longo prazo:** Migrar para React/Preact/Solid com Vite. Curto prazo: manter vanilla mas modularizar em múltiplos .js.

### 5.5 Sem Testes
**Impacto:** Qualquer refatoração grande é arriscada. Smoke test (`scripts/smoke.ts`) não testa lógica de negócio.

---

## 6. Roadmap Priorizado por Fases

### Fase 0 — Fundação (1-2 semanas)
> Pré-requisitos para tudo que vem depois

- [ ] **Event Bus** — EventEmitter centralizado, device-monitor e automations assinam/publicam
- [ ] **Granular Event Store** — Parar de agregar events por hora. Cada evento com timestamp preciso. View materializada para agregação
- [ ] **Upgrade Gemini 2.5 Flash** — Modelo, maxOutputTokens=2048, structured output (JSON mode)
- [ ] **Schema Migration** — Adicionar tabelas: `people`, `rules`, `corrections`, `device_metrics`
- [ ] **Testes Core** — Vitest para: action-dispatcher, preferences, device-registry, pattern detection

### Fase 1 — Aprendizado por Reforço (2-3 semanas)
> O ELO que corrige e aprende

- [ ] **Corrections API** — `POST /api/corrections` com device, action, original, corrected, context
- [ ] **Contextual Rules Engine** — Rules com condições temporais (hora, dia, pessoas presentes)
- [ ] **Decision Loop v2** — Consulta rules antes de executar. Gemini propõe novas rules baseado em corrections
- [ ] **Confidence Scoring** — Rules ganham peso com aceitação, perdem com novas correções
- [ ] **Chat Integration** — Interpretar "muito alto", "muito frio" como correções, não comandos novos

### Fase 2 — Voz Local (2-3 semanas)
> STT/TTS para interação natural

- [ ] **Piper TTS Container** — Docker sidecar, voz PT-BR, API HTTP
- [ ] **Faster-Whisper Container** — Docker sidecar, modelo small/medium, API HTTP
- [ ] **Voice Gateway** — Módulo ELO que: recebe áudio → STT → /api/chat → resposta texto → TTS → áudio
- [ ] **Wake Word** — OpenWakeWord ou Micro Wake Word em ESP32-S3 ou no próprio container
- [ ] **Streaming STT** — WebSocket para STT em tempo real (voice activity detection + streaming)

### Fase 3 — Segurança + Pessoas (3-4 semanas)
> Reconhecimento facial e perfis

- [ ] **People Registry** — CRUD de pessoas, roles (admin/child/guest), restrições por device/action
- [ ] **Face Detection Worker** — Sidecar Python (InsightFace ou face-api.js) captura frames do go2rtc, extrai embeddings
- [ ] **Face Recognition** — Comparação contra embeddings cadastrados, threshold de confiança
- [ ] **Permission Middleware** — Action dispatcher verifica WHO + WHAT contra rules de permissão
- [ ] **Telegram Notifications** — Bot para alertas de: pessoa desconhecida, criança em área restrita, eventos críticos
- [ ] **Presence Detection** — "Quem está em casa?" baseado em última detecção facial por cômodo

### Fase 4 — Rotinas Inteligentes (2-3 semanas)
> Observação e correlação de padrões

- [ ] **Correlation Engine** — Sliding window: detectar "A acontece antes de B" com frequência estatística
- [ ] **Rule Proposer** — Gemini recebe correlações → propõe automação com trigger+condition+action
- [ ] **Automation Engine v2** — Scheduler (cron), triggers compostos, hot-reload com chokidar
- [ ] **Confidence + Decay** — Regras propostas com TTL, ganham/perdem peso baseado em comportamento

### Fase 5 — Mordomo Invisível (2-3 semanas)
> Manutenção preditiva e antecipação

- [ ] **Metrics Store** — Tabela device_metrics com retenção configurável
- [ ] **Baseline Calculator** — Média móvel + desvio padrão por device+metric
- [ ] **Trend Analyzer** — Regressão linear para detectar degradação lenta
- [ ] **Proactive Suggestions** — Gemini analisa trends → sugere manutenção antes da falha
- [ ] **Daily Briefing** — "Bom dia Arthur. Hoje: AC do quarto levou 15% mais tempo para resfriar. Lucca dormiu às 21:30."

---

## 7. Diagrama Arquitetural Alvo

```
                                  ┌─────────────────────────┐
                                  │     Hardware Layer      │
                                  │  Mic (ESP32) │ Cameras  │
                                  │  Sensors     │ Switches │
                                  └──────┬──────────┬───────┘
                                         │          │
                              ┌──────────▼──┐  ┌────▼──────────┐
                              │  STT Worker │  │   go2rtc      │
                              │ (Whisper)   │  │ (streaming)   │
                              └──────┬──────┘  └────┬──────────┘
                                     │              │
                        texto puro   │    frames    │
                                     │              │
┌──────────────────────────────────────▼──────────────▼─────────────────────┐
│                           ELO BRAIN (Node.js)                            │
│                                                                          │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Event Bus  │──│ Automation   │  │ Rules Engine │  │ Correlation   │  │
│  │ (pub/sub)  │  │ Engine v2    │  │ (contextual) │  │ Engine        │  │
│  └─────┬──────┘  └──────────────┘  └──────────────┘  └───────────────┘  │
│        │                                                                 │
│  ┌─────▼──────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Device     │  │ Decision     │  │ People &     │  │ Metrics &     │  │
│  │ Monitor    │  │ Loop v2      │  │ Permissions  │  │ Trends        │  │
│  └────────────┘  └──────┬───────┘  └──────────────┘  └───────────────┘  │
│                         │                                                │
│                    ┌────▼────┐                                           │
│                    │ Gemini  │ ← só recebe texto + contexto estruturado  │
│                    │ 2.5Flash│                                           │
│                    └─────────┘                                           │
│                                                                          │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐                    │
│  │ Discovery  │  │ Driver Gen   │  │ Action       │                    │
│  │ (multi)    │  │ (templates)  │  │ Dispatcher   │                    │
│  └────────────┘  └──────────────┘  └──────────────┘                    │
└──────────────────────────────────────────────────────────────────────────┘
                              │              │
                     ┌────────▼──┐    ┌──────▼──────┐
                     │ TTS Worker│    │ Notification│
                     │ (Piper)   │    │ (Telegram)  │
                     └───────────┘    └─────────────┘
                           │
                        áudio
                           │
                       Speaker
```

---

## 8. Métricas de Sucesso

| Fase | Métrica | Alvo |
|---|---|---|
| 0 | Cobertura de testes core | >70% |
| 1 | Rules aprendidas por semana | ≥3 após 1 mês |
| 1 | Taxa de correção do mesmo erro | <10% após aprender |
| 2 | Latência STT→resposta→TTS | <3 segundos |
| 2 | Acurácia STT PT-BR | >90% |
| 3 | Acurácia facial (known) | >95% |
| 3 | Falsos positivos (unknown) | <5% |
| 4 | Automações propostas aceitas | >60% |
| 5 | Alertas preditivos corretos | >70% |

---

## 9. Riscos e Mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| STT consome muita RAM | Host não aguenta (RPi) | Usar modelo `tiny` ou `base`. Ou hardware x86 dedicado |
| Face recognition falsos positivos | Alarmes desnecessários | Threshold alto (>0.85) + cooldown de 5min por pessoa |
| Gemini API instável | Sistema para de aprender | Cache agressivo de respostas. Fallback para rules locais |
| Event storm (muitos sensores) | DB cresce rápido, CPU alta | Rate limiting no event bus. Agregação após 24h. Retention policy |
| Complexidade do code | Difícil manter solo | Manter módulos independentes. Testes. Documentação |

---

## 10. Quick Wins (Podem ser feitos já)

1. **`maxOutputTokens: 200 → 2048`** em `gemini-api.ts` — Automações truncam com 200 tokens
2. **`gemini-1.5-flash → gemini-2.5-flash`** como default model — Melhor raciocínio
3. **Event Bus simples** — 30 linhas com EventEmitter do Node.js, integrar no device-monitor
4. **Parar agregação de events** — Remover o UPDATE que merge events por hora. Cada INSERT é único
5. **Telegram Bot básico** — `node-telegram-bot-api` + POST /api/notify → já serve para alertas manuais
