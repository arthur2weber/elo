# 04 — Generators (driver-generator e templates)

Este capítulo documenta o que o gerador de drivers faz, passo a passo, e as decisões que o código realmente toma.

Fluxo principal de `triggerDriverGeneration` (comportamento real observado)

1. Evita duplicação
  - Constrói uma chave `deviceKey` e usa `GENERATION_QUEUE` para evitar trabalho duplicado.
  - Mantém um `GLOBAL_ATTEMPT_TRACKER` (3 tentativas por padrão).

2. Heurísticas e enriquecimento
  - Escaneia portas comuns (`COMMON_PORTS`) usando `probeTcpPort` e tenta fetch HTTP em rotas úteis (`/`, `/api/v2/`, `/description.xml`).
  - Consulta `knowledge-base` (arquivo `knowledge-base.ts`) procurando padrões por assinatura/porta (ex: Tizen em 8001/8002).
  - Se `signatureMatch` ou heurísticas apontarem para Tizen, coloca um `extraHint` explicando que o payload padrão é `{ "method":"ms.remote.control", ... }`.

3. Prompt para Gemini
  - Compõe um prompt usando `prompts` (contratos em `src/ai/prompts.ts`) e envia para Gemini (`runGeminiPrompt`).
  - Regras importantes observadas no prompt:
    - Deve retornar JSON driver com `actions` indexadas.
    - URLs devem usar `{ip}` placeholder (não IPs fixos).
    - Quando necessário, só permitir placeholders `{ip}`, `{token}`, `{mac}` em `body`.

4. Verificação e persistência
  - A proposta recebida é passada para `verifyDriverProposal` que inspeciona estrutura básica (format, required fields).
  - Se verificada, escrita em `logs/drivers/<id>.json`.
  - O gerador pode também marcar o dispositivo como `pending` no device-registry.

Pontos práticos para manutenção
- Ajuste de prompt: `src/ai/prompts.ts` contém o template e exemplos. Melhorar a taxa de sucesso envolve 1) ajustar `prompts` para mais restrições e 2) atualizar `knowledge-base` com exemplos concretos (já feito para Tizen).
- O gerador não substitui drivers existentes por padrão; usa `forceRegenerate` para forçar.

Exemplo de template de driver (observado em `templates.ts`)
- Estrutura esperada:
  {
    "deviceName": "samsung_tv",
    "deviceType": "smart_tv",
    "capabilities": ["media_control","volume","on_off"],
    "actions": { "volume_up": { "method": "WS", "url": "wss://{ip}:8002/....&token={token}", "body": "{...}" } }
  }

- Caveats reais observados
- O gerador tende a omitir comandos de navegação (up/down/left/right/enter) se o prompt não enfatizar explicitamente que TVs precisam dessas ações. Atualizamos `prompts.ts` e `templates.ts` para corrigir isso.
- A geração depende de disponibilidade do endpoint HTTP no host (timeouts e porta bloqueada reduz a qualidade do prompt).

## Referências de código (fonte)

Principais pontos de implementação citados neste capítulo:

- `src/server/generators/driver-generator.ts` — função `export const triggerDriverGeneration(payload)` contém toda a lógica de varredura de portas, heurísticas, chamadas ao Gemini (`runGeminiPrompt`) e persistência em `logs/drivers/`.
- `src/server/generators/templates.ts` — modelos de driver utilizados como fallback quando a identificação é confiável.
- `src/server/generators/knowledge-base.ts` — `PROTOCOL_REFERENCES` e `DISCOVERY_MAP` que enriquecem prompts com padrões conhecidos (ex: Tizen).

Consulte esses arquivos para ver o comportamento exato do gerador e as heurísticas aplicadas.
