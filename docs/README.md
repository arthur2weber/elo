# ELO: Documentação do Sistema

Bem-vindo à documentação oficial do **ELO Automation Engine**.

O ELO é um motor de automação residencial agnóstico a protocolos, projetado para operar sob o conceito de **"Just-in-Time Infrastructure"**. Ele utiliza IA Generativa (Google Gemini) para observar o ambiente, entender dispositivos desconhecidos e escrever seus próprios drivers e automações dinamicamente.

## 📚 Índice de Documentação

1. [Arquitetura do Sistema](./01-architecture.md)
   - Visão geral dos componentes (Server, Discovery, AI Agent).
   - Fluxo de dados.
2. [IA e Persona](./02-ai-persona.md)
   - Engenharia de Prompt (Chat Butler).
   - Protocolos JSON.
   - Guardrails e Filtros de Alucinação.
3. [Loop de Decisão & Automação](./03-decision-loop.md)
   - O cérebro autônomo.
   - Ciclo Observar → Abstrair → Codificar.
   - Sistema de Aprovações.
4. [API & Interfaces](./04-api-reference.md)
   - Endpoints do Servidor.
   - Gerenciamento de Dispositivos e Drivers.
5. [Guias de Dispositivos Específicos](./06-samsung-tizen-guide.md)
   - Integração com Samsung Smart TV (Tizen).
   - Uso de WebSockets e Tokens.
6. [Operações & Deploy](./05-operations.md)
   - Docker-compose, Logs e Volumes.

## 🚀 Conceitos Chave

- **Passive & Active Discovery:** O sistema não espera você cadastrar dispositivos. Ele os encontra via Nmap (ativo) e mDNS (passivo).
- **Context Injection:** A IA nunca "alucina" o estado da casa; ela recebe um snapshot JSON rigoroso do estado atual de todos os sensores antes de responder.
- **Self-Healing Code:** Se uma automação falha ou o comportamento do usuário muda, o sistema propõe refatorações no código TypeScript.
