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
            'requestPairing': {
                method: 'WS',
                url: 'wss://<ip>:8002/api/v2/channels/samsung.remote.control?name=RUxPLVByb2plY3Q=&token={token}',
                body: ''
            },
            'powerOff': {
                method: 'WS',
                url: 'wss://<ip>:8002/api/v2/channels/samsung.remote.control?name=RUxPLVByb2plY3Q=&token={token}',
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
            'volumeUp': {
                method: 'WS',
                url: 'wss://<ip>:8002/api/v2/channels/samsung.remote.control?name=RUxPLVByb2plY3Q=&token={token}',
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
            'volumeDown': {
                method: 'WS',
                url: 'wss://<ip>:8002/api/v2/channels/samsung.remote.control?name=RUxPLVByb2plY3Q=&token={token}',
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
                url: 'wss://<ip>:8002/api/v2/channels/samsung.remote.control?name=RUxPLVByb2plY3Q=&token={token}',
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
