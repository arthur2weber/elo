# Guia de Integração Samsung Smart TV (Tizen) para ELO

Este documento serve como a "Fonte de Verdade" para o Gemini e desenvolvedores sobre como implementar drivers funcionais para TVs Samsung modernas.

## 1. Descoberta e Protocolos
- **Portas Abertas Comuns:** 8001 (HTTP), 8002 (HTTPS/WSS), 9197 (UPnP), 7678 (UPnP), 8008 (DIAL).
- **Endpoint de Info:** `http://<ip>:8001/api/v2/` retorna JSON com metadados da TV.

## 2. Controle Remoto via WebSockets (Método Principal)
As TVs Samsung modernas (pós-2016) exigem WebSockets para simular teclas de controle remoto. Chamadas `POST` simples na porta 8001/8002 geralmente retornam `404` ou `401`.

### Configuração do Driver ELO:
- **Método:** `WS` (ou `WSS` dependendo da porta).
- **Porta:** 8002 (Recomendada por ser segura e mais estável).
- **URL de Conexão:**
  `wss://<ip>:8002/api/v2/channels/samsung.remote.control?name=RUxPLVNtYXJ0JmF1dGg9MQ==&token={token}`
  - `name`: Nome do dispositivo Base64-encoded (ex: "ELO-Smart").
  - `token`: **Obrigatório**. Use o placeholder `{token}`. O motor ELO substituirá isso pelo token salvo nas `notes` do dispositivo.

### Formato do Payload (Body):
```json
{
  "method": "ms.remote.control",
  "params": {
    "Cmd": "Click",
    "DataOfCmd": "KEY_XXXX",
    "Option": "false",
    "TypeOfRemote": "SendRemoteKey"
  }
}
```

### Lista de Teclas (DataOfCmd):
| Função | Tecla |
| :--- | :--- |
| Power | `KEY_POWER` |
| Volume Up | `KEY_VOLUP` |
| Volume Down | `KEY_VOLDOWN` |
| Mute | `KEY_MUTE` |
| Home | `KEY_HOME` |
| Return/Back | `KEY_RETURN` |
| Enter/OK | `KEY_ENTER` |
| Setas | `KEY_UP`, `KEY_DOWN`, `KEY_LEFT`, `KEY_RIGHT` |
| Canais | `KEY_CHUP`, `KEY_CHDOWN` |

## 3. Fluxo de Autorização (Token)
1. Na primeira conexão (sem token), a TV exibirá um pop-up: **"Deseja permitir que ELO-Smart controle esta TV?"**.
2. O usuário deve selecionar **Permitir**.
3. A TV enviará uma mensagem via WebSocket contendo o campo `"token": "12345678"`.
4. O motor ELO detecta este token via `GenericHttpDriver`.
5. **Ação do Usuário/IA:** O token deve ser copiado para o campo `notes` no `devices.json` sob a chave `"token"`.

## 4. Troubleshooting
- Se a TV parar de responder: Verifique se o IP mudou ou se o token foi revogado nas configurações da TV (Geral > Gerenciador de Dispositivos Externos).
- Erro 404 em POST: A TV não suporta mais o método de API REST legado; use WebSockets.
