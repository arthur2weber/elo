# Referência da API

O servidor ELO expõe uma API RESTful na porta padrão `3000`.

## 🌐 Endpoints Públicos

### Healthcheck & Status
```http
GET /api/status
```
Retorna um sumário completo do sistema para dashboard.
- **Query Params:**
  - `limit` (opcional, default 50): Número de logs a retornar.
- **Resposta:** JSON com contagens de dispositivos, logs recentes, e status dos serviços.

### Chat (Interação Principal)
```http
POST /api/chat
```
Envia uma mensagem para o Agente ELO.
- **Body:**
  ```json
  {
    "message": "string (obrigatório)",
    "user": "string (opcional)",
    "sessionId": "string (opcional - para memória de conversação)"
  }
  ```
- **Resposta:**
  ```json
  {
    "success": true,
    "data": {
      "reply": "Texto da resposta falada pelo ELO",
      "action": "string | null (comando técnico, ex: 'luz=off')"
    }
  }
  ```

### Dispositivos
```http
GET /api/devices
```
Lista todos os dispositivos registrados e seus status atuais (snapshot).

### Configuração
```http
GET /api/config
POST /api/config
```
Lê ou atualiza variáveis de ambiente e chaves de API secretas.
**Nota:** Atualizações via POST exigem reinício do contêiner para surtir efeito total.

## 📡 Event Ingress (Webhooks)

```http
POST /events
```
Ponto de entrada para sensores externos ou scripts de integração.
- **Body:** Objeto JSON livre.
- **Comportamento:**
  1. O evento é logado em `events.jsonl`.
  2. O `automation_engine` é disparado imediatamente para checar se alguma automação deve reagir a este evento.

## 🔌 Estruturas de Dados Internas

### DeviceConfig (`logs/devices.json`)
```typescript
interface DeviceConfig {
  id: string;      // ID único (ex: "ac_sala")
  name: string;    // Nome legível
  room: string;    // Localização
  protocol: string; // "http", "mqtt", "zigbee", etc.
  meta?: any;      // Metadados extra (IP, MAC)
}
```

### LogEntry (`logs/events.jsonl`)
```typescript
interface LogEntry {
  timestamp: string; // ISO 8601
  device: string;    // ID do dispositivo ou "system"
  event: string;     // Nome do evento (ex: "status_change", "action_dispatched")
  payload: any;      // Dados arbitrários
}
```
