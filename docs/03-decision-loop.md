# Loop de Decisão (Decision Loop)

O **Decision Loop** (`src/server/decision-loop.ts`) é o componente que diferencia o ELO de uma automação residencial comum. Ele é um processo em segundo plano que roda periodicamente para analisar o comportamento do sistema e propor melhorias.

## ⚙️ O Ciclo de Melhoria Contínua

1. **Coleta de Dados:**
   - O loop lê os últimos N registros de `events.jsonl` (o que aconteceu na casa).
   - Lê os últimos M registros de `requests.jsonl` (o que o usuário pediu).
   - Analisa o sumário de preferências do usuário (`src/cli/utils/preferences.ts`).

2. **Geração de Código (Self-Coding):**
   - O sistema passa esses dados para a IA com o prompt `workflowUpdateJson`.
   - A IA analisa se as automações atuais (`src/automations/*.ts`) estão atendendo bem os pedidos do usuário.
   - **Exemplo:** Se o usuário sempre pede para desligar a luz da sala 5 minutos depois de ligar a TV, a IA detecta esse padrão.

3. **Proposta de Refatoração:**
   - A IA reescreve o código TypeScript da automação.
   - O código não é aplicado imediatamente. Ele entra como uma "Sugestão" (`logs/suggestions.json`).

## 🚦 Política de Aprovação

O ELO possui um sistema de confiança para decidir quando aplicar mudanças de código sozinho.

### Lógica de Aprovação (`approvalPolicy`)
Para cada sugestão de mudança de código, a IA avalia:
- **Risco:** A mudança é perigosa? (Ex: destrancar porta vs mudar cor da luz).
- **Confiança:** O padrão é claro?
- **Histórico:** O usuário já aprovou mudanças similares antes?

### Estados da Sugestão
- **`AUTO_APPLIED`**: A IA concluiu que é seguro e o usuário confia no sistema. O código em `automations/` é sobrescrito na hora.
- **`PENDING`**: A IA acha que é uma boa ideia, mas requer confirmação humana (via UI).
- **`REJECTED`**: A IA ou o usuário descartaram a ideia.

## 📝 Arquitetura de Preferências

O sistema mantém um registro de "Decisões Humanas" em `logs/decisions.json`.
- Cada vez que você aceita ou rejeita uma sugestão, o modelo estatístico do `shouldAutoApprove` é atualizado.
- O objetivo do sistema é maximizar o número de `AUTO_APPLIED` seguros ao longo do tempo, reduzindo a carga cognitiva sobre o usuário.
