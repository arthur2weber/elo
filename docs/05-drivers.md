# 05 — Drivers (GenericHttpDriver e formato de driver JSON)

Objetivo: documentar, fielmente, como drivers são consumidos e executados.

Local: `logs/drivers/*.json` — drivers já gerados (ou manuais).

Formato mínimo de driver JSON

- `deviceName`: string
- `deviceType`: string
- `capabilities`: string[]
- `actions`: Record<string, { method: 'GET'|'POST'|'PUT'|'WS', url: string, headers?: Record<string,string>, body?: string }>

Como o `GenericHttpDriver` executa ações (comportamento real)

1. `dispatchAction` carrega o driver JSON e cria `new GenericHttpDriver(driverConfig)`.
2. `executeAction(actionName, params?)`:
   - Valida que action exista; se não, lança erro.
   - Faz substituição de placeholders somente para chaves em `params` (tenta `{token}` e `<token>`). Permite `{ip}`, `{token}`, `{mac}`.
   - Não remove chaves JSON não substituídas (correção aplicada: não usa regex agressivo que destruía payload JSON).
   - Se `method` é `WS` ou url começa com `wss://`/`ws://`, chama `executeWsAction`.
   - Para HTTP: tenta fazer `axios({ method, url, headers, data: payload })` onde `payload` é `body` parseado se for JSON válido.

3. WebSocket behavior (`executeWsAction`):
   - Abre socket com `handshakeTimeout` e `rejectUnauthorized:false`.
   - Ao `open`, aguarda mensagens do dispositivo.
   - Quando recebe `ms.channel.connect`:
     - Se o `msg.data.token` estiver presente, resolve com metadata contendo token (o dispatcher grava esse token no device-registry).
     - Se a handshake ocorreu (ms.channel.connect) e há `body`, então envia o `body` *após* handshake. (Isto é necessário para Tizen.)
   - Captura `unauthorized` events e espera o usuário autorizar no dispositivo.
   - Fecha socket e resolve com sucesso em muitos códigos de fechamento (1000, 1005, 1006), consideradas execuções aceitáveis.

Placeholders e parâmetros (regra observada)
- Substituições permitidas no `GenericHttpDriver` são feitas somente se `params` forem passados a `executeAction`.
- `dispatchAction` popula `params` a partir do device registry (config, secrets, notes) e inclui `ip`.
- Se um action body contiver placeholders desconhecidos, agora o sistema os preserva, para não destruir JSON válido.

Erros e comportamento observado
- Erros de conexão HTTP/WS são registrados e retornados como `success:false` com `error`.
- Em casos de pairing, o socket pode fechar com código 1005 e a ação é ainda tratada como executada (comportamento adotado para TVs).

Recomendações para autor de drivers
- Use `{ip}` no `url` para suportar DHCP.
- Use `{token}` no `url`/`body` somente quando souber que o token será capturado durante pairing.
- Prefira manter `body` como JSON string (por exemplo `"{ \"method\": \"ms.remote.control\", ... }"`) e permita que `GenericHttpDriver` o parseie antes do envio HTTP (WS envia string direto).

Exemplos reais
- Veja `logs/drivers/samsung_tv.json` para um driver Tizen que contém `volume_up`, `volume_down`, `mute`, `on`, `off`, `requestPairing`.

## Referências de código (fonte)

Para inspeção direta das implementações descritas acima:

- `src/drivers/http-generic.ts` — a classe `GenericHttpDriver` e suas funções `executeAction(actionName, params?)` e `private executeWsAction(url, body?)` implementam o comportamento de execução HTTP e WebSocket (handshake, token capture, envio de payload após `ms.channel.connect`).
- `src/server/action-dispatcher.ts` — carga dos drivers JSON, montagem de `params` (injetando `ip`, `secrets`, etc.) e atualização do device-registry quando um token é capturado.

Abra esses arquivos e procure pelos identificadores `class GenericHttpDriver`, `executeAction` e `executeWsAction` para ver o comportamento linha-a-linha.
