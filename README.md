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

## Por que esta estrutura é superior para o Codex?

- **Abstração de Marca:** Note que não citamos "Samsung" ou "Gree". Falamos de "Protocolos Proprietários" e "WebSockets". Isso força o Codex a escrever código genérico e modular.
- **Foco no Loop de Decisão:** O README deixa claro que o `decision-loop.ts` é quem manda. O Codex entende que sua missão principal é alimentar esse loop com dados limpos.
- **Escalabilidade:** Se adicionar um dispositivo novo amanhã que usa um protocolo que nem inventaram ainda, o README continua válido, pois o processo de "Observar → Abstrair → Codificar" é universal.