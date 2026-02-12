# ELO: Autonomous Protocol-Agnostic Engine

ELO é um motor de automação local projetado para ser o cérebro de qualquer ambiente inteligente. Ao contrário de sistemas baseados em integrações fixas, o ELO utiliza **IA Generativa (Gemini)** para interpretar assinaturas de rede e criar drivers em tempo real.

## 🧠 Filosofia do Sistema

O ELO opera sob o conceito de **"Just-in-Time Infrastructure"**. Ele não vem com drivers pré-instalados para marcas X ou Y. Em vez disso:

1. **Observa:** Monitora o tráfego de rede e estados de dispositivos.
2. **Abstrai:** Converte dados brutos (logs, portas, headers) em contexto para a LLM.
3. **Codifica:** Gera scripts TypeScript (`.ts`) para interagir com protocolos detectados (HTTP, UDP, MQTT, WebSockets).

## 🚀 Capacidades Atuais

### 📡 Discovery Dinâmico (Active & Passive)

O sistema não depende de cadastros manuais. Ele utiliza uma camada de descoberta multi-protocolo:

- **Fingerprinting de Rede:** Varredura ativa de portas e análise de banners de serviço.
- **Multicast Listener:** Escuta passiva de anúncios SSDP, mDNS e Zeroconf.
- **Broadcast Probing:** Disparo de pacotes de busca para identificar dispositivos em protocolos proprietários de baixa camada.

### 🛠️ Geração de Drivers e Automações

As automações no ELO são fluxos vivos:

- **Auto-Refatoração:** O `decision-loop.ts` analisa os logs de sucesso/erro e reescreve a lógica se um dispositivo mudar de comportamento.
- **Context-Aware Decisions:** A IA cruza dados de múltiplos sensores (presença, temperatura, estado de rede) para decidir se uma ação é segura e eficiente.

### 🛡️ Camada de Segurança e Personas

O ELO permite a definição de **Diretrizes de Contexto**. Você pode definir regras globais que a IA deve respeitar ao gerar código, como:

- Restrições de horário para dispositivos ruidosos.
- Protocolos de segurança para presença de perfis específicos (Ex: modo infantil, modo convidado).
- Prioridade de economia energética.

## 📂 Estrutura de Diretórios

- `src/drivers/`: Código gerado para comunicação com hardware específico.
- `src/automations/`: Lógica de negócio e regras de automação geradas pela IA.
- `logs/events.jsonl`: A "fonte da verdade" com o histórico de todos os estados da casa.
- `logs/requests.jsonl`: Registro de intenções do usuário para aprendizado de preferências.

## 🌐 Console Web (HTTP UI)

O servidor do ELO já expõe uma interface web simples para monitorar o estado e conversar com o agente.

- **URL:** `http://localhost:3000`
- **Endpoints úteis:**
	- `GET /api/status` — visão geral (logs, dispositivos, sugestões)
	- `POST /api/chat` — conversa rápida com o agente
	- `GET /api/config` / `POST /api/config` — leitura/gravação de chaves

> ⚠️ Ao atualizar chaves via UI, reinicie o processo do servidor para aplicar as variáveis.

## 🚦 Quick start

Requisitos mínimos:

- Node.js (>=16) e npm
- Ou Docker + docker-compose

Passos rápidos (desenvolvimento):

1. Instale dependências:

	```bash
	npm ci
	```

2. Configure variáveis de ambiente (ex: `.env`) com a sua chave Gemini e outras opções:

	- `GEMINI_API_KEY` — chave da API de LLM (requerido para geração automática)
	- `GEMINI_API_MODEL` — modelo a usar (opcional)
	- `GEMINI_CLI_BIN`, `THINKING_BUDGET` — opções avançadas

3. Inicie a aplicação:

	- Localmente (usa `ts-node`):

	  ```bash
	  npm start
	  ```

	- Em container (recomenda-se para ambientes isolados):

	  ```bash
	  docker-compose up -d
	  ```

4. Abra a UI em: `http://localhost:3000`

## ⚙️ Configuração

O ELO lê variáveis de ambiente do arquivo `.env` na raiz (veja `src/server/config.ts`). Se preferir, defina as mesmas variáveis no `docker-compose.yml` para execução em container.

Variáveis importantes:

- `GEMINI_API_KEY` — chave para integração com a LLM (necessária para gerar drivers e usar recursos de IA).
- `GEMINI_API_MODEL` — nome do modelo/endpoint a ser usado (opcional).
- `GEMINI_CLI_BIN` / `GEMINI_CLI_ARGS` — se estiver usando um wrapper de CLI local.

## 📚 Documentação

Toda a documentação prática e guias estão em `./docs` (arquivos Markdown). Alguns pontos úteis:

- `docs/01-architecture.md` — visão geral da arquitetura.
- `docs/03-server.md` — como o servidor expõe a HTTP UI e endpoints.
- `docs/04-generators.md` — como o driver-generator funciona e onde ajustar prompts/KB.
- `docs/05-drivers.md` — formato de drivers, placeholders e exemplos.
- `docs/06-samsung-tizen-guide.md` — guia específico para TVs Samsung/Tizen.
- `docs/07-dev-setup.md` — passos adicionais de desenvolvimento.

Se for contribuir com docs, edite os arquivos em `./docs` e submeta um PR. Procure manter exemplos concretos e referenciar arquivos fonte quando relevante.

## 📂 Logs e artefatos

Os artefatos gerados e logs ficam em `./logs` (ex.: `logs/drivers/`, `logs/events.jsonl`, `logs/suggestions.jsonl`).

## Por que esta estrutura é superior para o Codex?

- **Abstração de Marca:** Note que não citamos "Samsung" ou "Gree". Falamos de "Protocolos Proprietários" e "WebSockets". Isso força o Codex a escrever código genérico e modular.
- **Foco no Loop de Decisão:** O README deixa claro que o `decision-loop.ts` é quem manda. O Codex entende que sua missão principal é alimentar esse loop com dados limpos.
- **Escalabilidade:** Se adicionar um dispositivo novo amanhã que usa um protocolo que nem inventaram ainda, o README continua válido, pois o processo de "Observar → Abstrair → Codificar" é universal.