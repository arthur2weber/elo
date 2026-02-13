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
            'up': {
                method: 'WS',
                url: 'wss://<ip>:8002/api/v2/channels/samsung.remote.control?name=RUxPLUNvbnNvbGU=&token={token}',
                body: JSON.stringify({
                    method: 'ms.remote.control',
                    params: { Cmd: 'Click', DataOfCmd: 'KEY_UP', Option: 'false', TypeOfRemote: 'SendRemoteKey' }
                })
            },
            'down': {
                method: 'WS',
                url: 'wss://<ip>:8002/api/v2/channels/samsung.remote.control?name=RUxPLUNvbnNvbGU=&token={token}',
                body: JSON.stringify({
                    method: 'ms.remote.control',
                    params: { Cmd: 'Click', DataOfCmd: 'KEY_DOWN', Option: 'false', TypeOfRemote: 'SendRemoteKey' }
                })
            },
            'left': {
                method: 'WS',
                url: 'wss://<ip>:8002/api/v2/channels/samsung.remote.control?name=RUxPLUNvbnNvbGU=&token={token}',
                body: JSON.stringify({
                    method: 'ms.remote.control',
                    params: { Cmd: 'Click', DataOfCmd: 'KEY_LEFT', Option: 'false', TypeOfRemote: 'SendRemoteKey' }
                })
            },
            'right': {
                method: 'WS',
                url: 'wss://<ip>:8002/api/v2/channels/samsung.remote.control?name=RUxPLUNvbnNvbGU=&token={token}',
                body: JSON.stringify({
                    method: 'ms.remote.control',
                    params: { Cmd: 'Click', DataOfCmd: 'KEY_RIGHT', Option: 'false', TypeOfRemote: 'SendRemoteKey' }
                })
            },
            'enter': {
                method: 'WS',
                url: 'wss://<ip>:8002/api/v2/channels/samsung.remote.control?name=RUxPLUNvbnNvbGU=&token={token}',
                body: JSON.stringify({
                    method: 'ms.remote.control',
                    params: { Cmd: 'Click', DataOfCmd: 'KEY_ENTER', Option: 'false', TypeOfRemote: 'SendRemoteKey' }
                })
            },
            'home': {
                method: 'WS',
                url: 'wss://<ip>:8002/api/v2/channels/samsung.remote.control?name=RUxPLUNvbnNvbGU=&token={token}',
                body: JSON.stringify({
                    method: 'ms.remote.control',
                    params: { Cmd: 'Click', DataOfCmd: 'KEY_HOME', Option: 'false', TypeOfRemote: 'SendRemoteKey' }
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
    },
    'hikvision-camera': {
        id: 'hikvision_camera',
        name: 'Hikvision IP Camera',
        type: 'camera',
        capabilities: ['video_stream', 'snapshot', 'ptz_control'],
        actions: {
            'getStream': {
                method: 'GET',
                url: 'rtsp://{username}:{password}@{ip}:554/Streaming/Channels/101',
                headers: {
                    'User-Agent': 'ELO-Camera-Client/1.0'
                }
            },
            'getSnapshot': {
                method: 'GET',
                url: 'http://{ip}/ISAPI/Streaming/channels/101/picture',
                headers: {
                    'Authorization': 'Basic {base64_credentials}'
                }
            },
            'getStatus': {
                method: 'GET',
                url: 'http://{ip}/ISAPI/System/status'
            },
            'moveUp': {
                method: 'PUT',
                url: 'http://{ip}/ISAPI/PTZCtrl/channels/1/continuous',
                headers: {
                    'Authorization': 'Basic {base64_credentials}',
                    'Content-Type': 'application/xml'
                },
                body: '<PTZData><pan>0</pan><tilt>1</tilt><zoom>0</zoom></PTZData>'
            },
            'moveDown': {
                method: 'PUT',
                url: 'http://{ip}/ISAPI/PTZCtrl/channels/1/continuous',
                headers: {
                    'Authorization': 'Basic {base64_credentials}',
                    'Content-Type': 'application/xml'
                },
                body: '<PTZData><pan>0</pan><tilt>-1</tilt><zoom>0</zoom></PTZData>'
            },
            'moveLeft': {
                method: 'PUT',
                url: 'http://{ip}/ISAPI/PTZCtrl/channels/1/continuous',
                headers: {
                    'Authorization': 'Basic {base64_credentials}',
                    'Content-Type': 'application/xml'
                },
                body: '<PTZData><pan>-1</pan><tilt>0</tilt><zoom>0</zoom></PTZData>'
            },
            'moveRight': {
                method: 'PUT',
                url: 'http://{ip}/ISAPI/PTZCtrl/channels/1/continuous',
                headers: {
                    'Authorization': 'Basic {base64_credentials}',
                    'Content-Type': 'application/xml'
                },
                body: '<PTZData><pan>1</pan><tilt>0</tilt><zoom>0</zoom></PTZData>'
            }
        }
    },
    'tplink-camera': {
        id: 'tplink_camera',
        name: 'TP-Link IP Camera',
        type: 'camera',
        capabilities: ['video_stream', 'snapshot'],
        actions: {
            'getStream': {
                method: 'GET',
                url: 'rtsp://{username}:{password}@{ip}:554/stream1',
                headers: {
                    'User-Agent': 'ELO-Camera-Client/1.0'
                }
            },
            'getSnapshot': {
                method: 'GET',
                url: 'http://{ip}/snap.jpg',
                headers: {
                    'Authorization': 'Basic {base64_credentials}'
                }
            },
            'getStatus': {
                method: 'GET',
                url: 'http://{ip}/cgi-bin/status'
            }
        }
    },
    'reolink-camera': {
        id: 'reolink_camera',
        name: 'Reolink IP Camera',
        type: 'camera',
        capabilities: ['video_stream', 'snapshot', 'ptz_control'],
        actions: {
            'getStream': {
                method: 'GET',
                url: 'rtsp://{username}:{password}@{ip}:554/h264Preview_01_main',
                headers: {
                    'User-Agent': 'ELO-Camera-Client/1.0'
                }
            },
            'getSnapshot': {
                method: 'GET',
                url: 'http://{ip}/cgi-bin/api.cgi?cmd=Snap&channel=0&rs=wuuPhkmUCeI9WG7C&user={username}&password={password}'
            },
            'getStatus': {
                method: 'GET',
                url: 'http://{ip}/cgi-bin/api.cgi?cmd=GetDevInfo&user={username}&password={password}'
            },
            'moveUp': {
                method: 'GET',
                url: 'http://{ip}/cgi-bin/api.cgi?cmd=PtzCtrl&channel=0&op=up&speed=32&user={username}&password={password}'
            },
            'moveDown': {
                method: 'GET',
                url: 'http://{ip}/cgi-bin/api.cgi?cmd=PtzCtrl&channel=0&op=down&speed=32&user={username}&password={password}'
            },
            'moveLeft': {
                method: 'GET',
                url: 'http://{ip}/cgi-bin/api.cgi?cmd=PtzCtrl&channel=0&op=left&speed=32&user={username}&password={password}'
            },
            'moveRight': {
                method: 'GET',
                url: 'http://{ip}/cgi-bin/api.cgi?cmd=PtzCtrl&channel=0&op=right&speed=32&user={username}&password={password}'
            }
        }
    },
    'amcrest-camera': {
        id: 'amcrest_camera',
        name: 'Amcrest IP Camera',
        type: 'camera',
        capabilities: ['video_stream', 'snapshot', 'ptz_control'],
        actions: {
            'getStream': {
                method: 'GET',
                url: 'rtsp://{username}:{password}@{ip}:554/cam/realmonitor?channel=1&subtype=0',
                headers: {
                    'User-Agent': 'ELO-Camera-Client/1.0'
                }
            },
            'getSnapshot': {
                method: 'GET',
                url: 'http://{ip}/cgi-bin/snapshot.cgi',
                headers: {
                    'Authorization': 'Basic {base64_credentials}'
                }
            },
            'getStatus': {
                method: 'GET',
                url: 'http://{ip}/cgi-bin/devInfo.cgi'
            },
            'moveUp': {
                method: 'GET',
                url: 'http://{ip}/cgi-bin/ptz.cgi?action=start&channel=0&code=Up&arg1=0&arg2=1&arg3=0'
            },
            'moveDown': {
                method: 'GET',
                url: 'http://{ip}/cgi-bin/ptz.cgi?action=start&channel=0&code=Down&arg1=0&arg2=1&arg3=0'
            },
            'moveLeft': {
                method: 'GET',
                url: 'http://{ip}/cgi-bin/ptz.cgi?action=start&channel=0&code=Left&arg1=0&arg2=1&arg3=0'
            },
            'moveRight': {
                method: 'GET',
                url: 'http://{ip}/cgi-bin/ptz.cgi?action=start&channel=0&code=Right&arg1=0&arg2=1&arg3=0'
            }
        }
    },
    'yoosee-camera': {
        id: 'yoosee_camera',
        name: 'Yoosee IP Camera',
        type: 'camera',
        capabilities: ['video_stream', 'snapshot', 'ptz'],
        actions: {
            'getStream': {
                method: 'GET',
                url: 'rtsp://{username}:{password}@{ip}:554/onvif1',
            },
            'getSnapshot': {
                method: 'GET',
                url: 'http://localhost:1984/api/frame.jpeg?src={device_id}',
            },
            'getStatus': {
                method: 'POST',
                url: 'http://{ip}:5000/onvif/device_service',
                headers: { 'Content-Type': 'application/soap+xml' },
                body: '<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><GetDeviceInformation xmlns="http://www.onvif.org/ver10/device/wsdl"/></s:Body></s:Envelope>'
            },
            'moveUp': {
                method: 'POST',
                url: 'http://{ip}:5000/onvif/ptz_service',
                headers: { 'Content-Type': 'application/soap+xml' },
                body: '<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><ContinuousMove xmlns="http://www.onvif.org/ver20/ptz/wsdl"><ProfileToken>IPCProfilesToken0</ProfileToken><Velocity><PanTilt x="0" y="0.5" xmlns="http://www.onvif.org/ver10/schema"/></Velocity></ContinuousMove></s:Body></s:Envelope>'
            },
            'moveDown': {
                method: 'POST',
                url: 'http://{ip}:5000/onvif/ptz_service',
                headers: { 'Content-Type': 'application/soap+xml' },
                body: '<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><ContinuousMove xmlns="http://www.onvif.org/ver20/ptz/wsdl"><ProfileToken>IPCProfilesToken0</ProfileToken><Velocity><PanTilt x="0" y="-0.5" xmlns="http://www.onvif.org/ver10/schema"/></Velocity></ContinuousMove></s:Body></s:Envelope>'
            },
            'moveLeft': {
                method: 'POST',
                url: 'http://{ip}:5000/onvif/ptz_service',
                headers: { 'Content-Type': 'application/soap+xml' },
                body: '<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><ContinuousMove xmlns="http://www.onvif.org/ver20/ptz/wsdl"><ProfileToken>IPCProfilesToken0</ProfileToken><Velocity><PanTilt x="-0.5" y="0" xmlns="http://www.onvif.org/ver10/schema"/></Velocity></ContinuousMove></s:Body></s:Envelope>'
            },
            'moveRight': {
                method: 'POST',
                url: 'http://{ip}:5000/onvif/ptz_service',
                headers: { 'Content-Type': 'application/soap+xml' },
                body: '<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><ContinuousMove xmlns="http://www.onvif.org/ver20/ptz/wsdl"><ProfileToken>IPCProfilesToken0</ProfileToken><Velocity><PanTilt x="0.5" y="0" xmlns="http://www.onvif.org/ver10/schema"/></Velocity></ContinuousMove></s:Body></s:Envelope>'
            },
            'ptzStop': {
                method: 'POST',
                url: 'http://{ip}:5000/onvif/ptz_service',
                headers: { 'Content-Type': 'application/soap+xml' },
                body: '<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><ContinuousMove xmlns="http://www.onvif.org/ver20/ptz/wsdl"><ProfileToken>IPCProfilesToken0</ProfileToken><Velocity><PanTilt x="0" y="0" xmlns="http://www.onvif.org/ver10/schema"/></Velocity></ContinuousMove></s:Body></s:Envelope>'
            }
        }
    },
    'onvif-ptz-camera': {
        id: 'onvif_ptz_camera',
        name: 'ONVIF PTZ Camera',
        type: 'camera',
        capabilities: ['video_stream', 'snapshot', 'ptz'],
        actions: {
            'getStream': {
                method: 'GET',
                url: 'rtsp://{username}:{password}@{ip}:554/onvif1',
            },
            'getSnapshot': {
                method: 'GET',
                url: 'http://localhost:1984/api/frame.jpeg?src={device_id}',
            },
            'getStatus': {
                method: 'POST',
                url: 'http://{ip}:5000/onvif/device_service',
                headers: { 'Content-Type': 'application/soap+xml' },
                body: '<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><GetDeviceInformation xmlns="http://www.onvif.org/ver10/device/wsdl"/></s:Body></s:Envelope>'
            },
            'moveUp': {
                method: 'POST',
                url: 'http://{ip}:5000/onvif/ptz_service',
                headers: { 'Content-Type': 'application/soap+xml' },
                body: '<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><ContinuousMove xmlns="http://www.onvif.org/ver20/ptz/wsdl"><ProfileToken>IPCProfilesToken0</ProfileToken><Velocity><PanTilt x="0" y="0.5" xmlns="http://www.onvif.org/ver10/schema"/></Velocity></ContinuousMove></s:Body></s:Envelope>'
            },
            'moveDown': {
                method: 'POST',
                url: 'http://{ip}:5000/onvif/ptz_service',
                headers: { 'Content-Type': 'application/soap+xml' },
                body: '<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><ContinuousMove xmlns="http://www.onvif.org/ver20/ptz/wsdl"><ProfileToken>IPCProfilesToken0</ProfileToken><Velocity><PanTilt x="0" y="-0.5" xmlns="http://www.onvif.org/ver10/schema"/></Velocity></ContinuousMove></s:Body></s:Envelope>'
            },
            'moveLeft': {
                method: 'POST',
                url: 'http://{ip}:5000/onvif/ptz_service',
                headers: { 'Content-Type': 'application/soap+xml' },
                body: '<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><ContinuousMove xmlns="http://www.onvif.org/ver20/ptz/wsdl"><ProfileToken>IPCProfilesToken0</ProfileToken><Velocity><PanTilt x="-0.5" y="0" xmlns="http://www.onvif.org/ver10/schema"/></Velocity></ContinuousMove></s:Body></s:Envelope>'
            },
            'moveRight': {
                method: 'POST',
                url: 'http://{ip}:5000/onvif/ptz_service',
                headers: { 'Content-Type': 'application/soap+xml' },
                body: '<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><ContinuousMove xmlns="http://www.onvif.org/ver20/ptz/wsdl"><ProfileToken>IPCProfilesToken0</ProfileToken><Velocity><PanTilt x="0.5" y="0" xmlns="http://www.onvif.org/ver10/schema"/></Velocity></ContinuousMove></s:Body></s:Envelope>'
            },
            'ptzStop': {
                method: 'POST',
                url: 'http://{ip}:5000/onvif/ptz_service',
                headers: { 'Content-Type': 'application/soap+xml' },
                body: '<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><ContinuousMove xmlns="http://www.onvif.org/ver20/ptz/wsdl"><ProfileToken>IPCProfilesToken0</ProfileToken><Velocity><PanTilt x="0" y="0" xmlns="http://www.onvif.org/ver10/schema"/></Velocity></ContinuousMove></s:Body></s:Envelope>'
            }
        }
    },
    'generic-camera': {
        id: 'generic_camera',
        name: 'Generic IP Camera',
        type: 'camera',
        capabilities: ['video_stream', 'snapshot'],
        actions: {
            'getStream': {
                method: 'GET',
                url: 'rtsp://{username}:{password}@{ip}:554/onvif1',
            },
            'getSnapshot': {
                method: 'GET',
                url: 'http://localhost:1984/api/frame.jpeg?src={device_id}',
            },
            'getStatus': {
                method: 'POST',
                url: 'http://{ip}:5000/onvif/device_service',
                headers: { 'Content-Type': 'application/soap+xml' },
                body: '<?xml version="1.0"?><s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><GetDeviceInformation xmlns="http://www.onvif.org/ver10/device/wsdl"/></s:Body></s:Envelope>'
            }
        }
    }
};
