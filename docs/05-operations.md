# Guia de Operações

## 🐳 Executando com Docker (Recomendado)

O projeto foi desenhado para rodar containierizado.

### Pré-requisitos
- Docker Engine
- Docker Compose v2+
- Uma chave da API do Google Gemini (`GEMINI_API_KEY`).

### Iniciar o Sistema (Produção)
```bash
# 1. Crie seu .env com a chave da API
echo "GEMINI_API_KEY=sua_chave_aqui" > .env

# 2. Suba os serviços
docker compose up -d
```

### Iniciar em Modo de Desenvolvimento
Se você está alterando o código fonte (`src/`) e quer ver mudanças refletidas (necessita rebuild se alterar estruturas core):
```bash
# Recontrói a imagem para garantir que o código TypeScript mais recente foi transpilado
docker compose up -d --build
```
> **Nota:** O Dockerfile compila o TypeScript (`npm run build`). Se você editar arquivos e apenas reiniciar o container sem `--build`, ele pode continuar usando a versão antiga compilada em `dist/` se o volume não estiver mapeando corretamente o ambiente de dev.

## 🧪 Rodando Testes & Debug

### Testes Unitários
```bash
# Roda script de teste básico de sanidade
npx ts-node scripts/test-core.ts
```

### Injeção Manual de Eventos
Você pode simular sensores injetando logs manualmente:
```bash
# Adicionar um registro de evento (ex: sensor de temperatura)
echo '{"timestamp":"2026-02-11T12:00:00Z","device":"sensor_temp","event":"reading","payload":{"value":25}}' >> logs/events.jsonl
```

### Resetar Logs
Para limpar a "memória" do sistema:
```bash
rm logs/*.jsonl
# O sistema recriará os arquivos vazios na próxima execução
```

## ⚠️ Troubleshooting Comum

### "Conexão Recusada" (Connection Refused)
- O container pode estar reiniciando em loop. Verifique os logs:
  ```bash
  docker compose logs -f elo-core
  ```

### A IA responde "Como um modelo de linguagem..."
- Isso indica falha na injeção de contexto ou violação da Persona.
- Verifique se `logs/devices.json` existe e não está vazio.
- Verifique os logs de requisição para ver o `fallbackReason`:
  ```bash
  cat logs/requests.jsonl
  ```

### Erro 429 (Too Many Requests)
- A API do Gemini Flash tem limites de taxa. O sistema tenta ser eficiente, mas conversas muito rápidas ou loops de decisão muito curtos (`ELO_DECISION_INTERVAL_MS`) podem estourar a cota gratuita. Aumente os intervalos no `.env`.
