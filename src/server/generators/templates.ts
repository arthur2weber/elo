export interface ActionDefinition {
    method: 'GET' | 'POST' | 'PUT' | 'WS';
    url: string;
    headers?: Record<string, string>;
    body?: string;
}

export interface DeviceTemplate {
    id: string;
    name: string;
    type: string;
    capabilities: string[];
    actions: Record<string, ActionDefinition>;
}

export const DEVICE_TEMPLATES: Record<string, DeviceTemplate> = {
    'samsung-tizen-tv': {
        id: 'samsung_tv',
        name: 'Samsung TV',
        type: 'smart_tv',
        capabilities: ['media_control', 'volume', 'on_off'],
        actions: {
            'status': {
                method: 'GET',
                url: 'http://<ip>:8001/api/v2/'
            },
            'requestPairing': {
                method: 'WS',
                url: 'wss://<ip>:8002/api/v2/channels/samsung.remote.control?name=RUxPLUNvbnNvbGU=',
                body: ''
            },
            'on': {
                method: 'WS',
                url: 'wss://<ip>:8002/api/v2/channels/samsung.remote.control?name=RUxPLUNvbnNvbGU=&token={token}',
                body: JSON.stringify({
                    method: 'ms.remote.control',
                    params: {
                        Cmd: 'Click',
                        DataOfCmd: 'KEY_POWER',
                        Option: 'false',
                        TypeOfRemote: 'SendRemoteKey'
                    }
                })
            },
            'off': {
                method: 'WS',
                url: 'wss://<ip>:8002/api/v2/channels/samsung.remote.control?name=RUxPLUNvbnNvbGU=&token={token}',
                body: JSON.stringify({
                    method: 'ms.remote.control',
                    params: {
                        Cmd: 'Click',
                        DataOfCmd: 'KEY_POWER',
                        Option: 'false',
                        TypeOfRemote: 'SendRemoteKey'
                    }
                })
            },
            'volume_up': {
                method: 'WS',
                url: 'wss://<ip>:8002/api/v2/channels/samsung.remote.control?name=RUxPLUNvbnNvbGU=&token={token}',
                body: JSON.stringify({
                    method: 'ms.remote.control',
                    params: {
                        Cmd: 'Click',
                        DataOfCmd: 'KEY_VOLUP',
                        Option: 'false',
                        TypeOfRemote: 'SendRemoteKey'
                    }
                })
            },
            'volume_down': {
                method: 'WS',
                url: 'wss://<ip>:8002/api/v2/channels/samsung.remote.control?name=RUxPLUNvbnNvbGU=&token={token}',
                body: JSON.stringify({
                    method: 'ms.remote.control',
                    params: {
                        Cmd: 'Click',
                        DataOfCmd: 'KEY_VOLDOWN',
                        Option: 'false',
                        TypeOfRemote: 'SendRemoteKey'
                    }
                })
            },
            'mute': {
                method: 'WS',
                url: 'wss://<ip>:8002/api/v2/channels/samsung.remote.control?name=RUxPLUNvbnNvbGU=&token={token}',
                body: JSON.stringify({
                    method: 'ms.remote.control',
                    params: {
                        Cmd: 'Click',
                        DataOfCmd: 'KEY_MUTE',
                        Option: 'false',
                        TypeOfRemote: 'SendRemoteKey'
                    }
                })
            }
        }
    }
};
