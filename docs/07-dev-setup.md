# 07 — Desenvolvimento local e como rodar

Passos mínimos para rodar localmente (observado no repositório):

1. Pré-requisitos
   - Node.js 18+ ou 20.
   - Docker e docker-compose (opcional, mas recomendado para reproduzir ambiente em contêineres).

2. Instalar dependências
```bash
npm install
# ou
pnpm install
```

3. Variáveis de ambiente necessárias (as essenciais)
- `GEMINI_API_KEY` — chave para a API de linguagem (se for usar Gemini).
- `PORT` — porta do servidor (padrão 3000).

4. Rodar local (modo desenvolvedor)
```bash
# rodar diretamente
npm run start
# ou com ts-node (conforme package.json)
# docker-compose up --build
```

5. Debug e logs
- Logs são emitidos no stdout e também há arquivos em `logs/` (devices.json, ai-usage.jsonl, drivers/*.json).
- Para debugar prompts: `ELO_DEBUG_PROMPT=true` no ambiente.

6. Testes e smoke
- `scripts/smoke.ts` e `smoke` no package.json podem existir para checagens rápidas (verifique scripts/ na raiz).

7. Dicas práticas
- Ao trabalhar com drivers/TV, use a porta 8002 (wss) e teste pairing com um cliente WebSocket manual antes de confiar na geração automática.
- Quando editar prompts, incrementar `ELO_DEBUG_PROMPT` e observar `logs/ai-usage.jsonl` para entender taxa de sucesso.

8. Reinicializar dados durante desenvolvimento
- Use `echo "[]" > logs/devices.json` para limpar registro de dispositivos.
- Delete arquivos em `logs/drivers/` para forçar regeneração quando testar `triggerDriverGeneration`.
