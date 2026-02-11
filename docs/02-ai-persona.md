# IA e Persona (Prompt Engineering)

O ELO utiliza o Google Gemini 1.5 Flash como seu cérebro. A "personalidade" e as regras de operação são definidas rigorosamente em `src/ai/prompts.ts`.

## 🤖 Persona: "O Mordomo Digital"

A IA é instruída a agir como o **ELO**, um mordomo de casa inteligente.
- **Tom de voz:** Educado, conciso, direto e prestativo.
- **Idioma:** Português Brasileiro (pt-BR).
- **Proibição Suprema:** A IA é estritamente proibida de "quebrar o personagem" (ex: dizer "Eu sou um modelo de linguagem" ou "Não tenho corpo físico").

## 🔄 Protocolo de Chat (JSON-Only)

Para garantir integridade sistêmica, a comunicação Chat -> Backend não é texto livre. A IA deve retornar um JSON estrito.

### Formato de Entrada (Prompt)
O sistema injeta dinamicamente:
1. **Histórico:** As últimas 8 mensagens.
2. **Contexto:** Um dump JSON do estado atual de todos os dispositivos (`logs/devices.json` + snapshot de `logs/events.jsonl`).
3. **Instrução de Verdade:** *"Contexto de dispositivos é sua ÚNICA fonte de verdade. ASSUMA que você TEM acesso via esse JSON."*

### Formato de Saída (Resposta da IA)
```json
{
  "action": "string | null",  // Ex: "ar_sala=on", "luz_teto=off"
  "message": "string"         // A resposta para ser lida/exibida ao usuário
}
```

### Exemplo Real
**Usuário:** "Liga o ar da sala."
**JSON Contexto:** `[{ "id": "ac_sala", "status": "off" }]`
**Resposta IA:**
```json
{
  "action": "ac_sala=on",
  "message": "Com certeza, ligando o ar condicionado da sala."
}
```

## 🛡️ Guardrails e Filtros (`src/server/http-ui.ts`)

O sistema implementa uma camada de segurança pós-processamento para evitar "alucinações de recusa".

### 1. Detecção de "Off-Topic" / "Refusal"
Um Regex varre a resposta da IA procurando termos proibidos que indicam que o modelo ignorou o prompt:
- `modelo de linguagem`
- `não tenho acesso`
- `mundo físico`
- `sou uma inteligência artificial`

### 2. Fallback Mechanism
Se a resposta contiver termos proibidos ou o JSON for inválido:
1. O backend **descarta** a resposta da IA.
2. O backend retorna uma mensagem hardcoded segura: *"Bom dia. Estou à disposição para cuidar da casa e dos dispositivos..."*
3. O incidente é logado em `requests.jsonl` com `fallbackReason: 'off_topic_detected'`.

## 🧠 Outros Prompts

- **`fingerprintDevice`**: Analisa dados hexadecimais brutos de rede para adivinhar qual é o dispositivo (Ex: "Isso parece uma lâmpada Yeelight via payload UDP").
- **`approvalPolicy`**: Decide se uma sugestão de automação é segura o suficiente para ser aplicada automaticamente ou se precisa de permissão humana.
