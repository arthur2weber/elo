/**
 * ELO Knowledge Base 
 * Mapeamento de assinaturas de redes para padrões de drivers baseados em repositórios Open Source
 */

export const PROTOCOL_REFERENCES = {
    'tuya': {
        repo: 'jasonacox/tinytuya',
        ports: [6668, 6667],
        patterns: 'Apresenta JSON com "gwId" e "dps". Requer local_key para AES-128.',
        url_template: 'http://<ip>:80/'
    },
    'tizen': {
        repo: 'home-assistant/core/tree/dev/homeassistant/components/samsungtv',
        ports: [8001, 8002],
        patterns: 'WebSocket wss://<ip>:8002/api/v2/channels/samsung.remote.control. Payload: {"method":"ms.remote.control","params":{"Cmd":"Click","DataOfCmd":"KEY_XXX" ...}}',
    },
    'shelly': {
        repo: 'home-assistant/core/tree/dev/homeassistant/components/shelly',
        ports: [80],
        patterns: 'Endpoint /rpc para Shelly Gen2 ou /settings para Gen1.',
        api_docs: 'https://shelly-api-docs.shelly.cloud/'
    },
    'lg_webos': {
        repo: 'home-assistant/core/tree/dev/homeassistant/components/webostv',
        ports: [3000, 8080],
        patterns: 'WebSocket pairing via lgtv2 library protocol.',
    },
    'tasmota': {
        repo: 'home-assistant/core/tree/dev/homeassistant/components/tasmota',
        ports: [80],
        patterns: 'Status via http://<ip>/cm?cmnd=Status%200. Toggle via http://<ip>/cm?cmnd=Power%20TOGGLE.'
    },
    'wled': {
        repo: 'home-assistant/core/tree/dev/homeassistant/components/wled',
        ports: [80],
        patterns: 'JSON API at http://<ip>/json. State at /json/state.'
    },
    'yeelight': {
        repo: 'home-assistant/core/tree/dev/homeassistant/components/yeelight',
        ports: [55443],
        patterns: 'TCP raw protocol using JSON-encapsulated commands.'
    },
    'zigbee': {
        repo: 'Koenkk/zigbee-herdsman-converters',
        patterns: 'Referência principal para clusters e conversão de payloads Zigbee em JSON.',
        path: 'src/devices'
    },
    'zwave': {
        repo: 'zwave-js/node-zwave-js',
        patterns: 'Mapeamento de Command Classes e parâmetros de dispositivos Z-Wave.',
        path: 'packages/config/config/devices'
    },
    'matter': {
        repo: 'project-chip/matter.js',
        patterns: 'Implementação pura TypeScript do protocolo Matter/CHIP.'
    },
    'homebridge': {
        repo: 'homebridge/homebridge',
        patterns: 'A maior biblioteca de plugins e drivers baseados em Node.js.'
    },
    'scrypted': {
        repo: 'koush/scrypted',
        patterns: 'Especializado em drivers de alto desempenho para câmeras e vídeo.'
    },
    'onvif': {
        repo: 'home-assistant/core/tree/dev/homeassistant/components/onvif',
        ports: [5000, 8899, 80],
        patterns: [
            'ONVIF cameras expose SOAP services on a dedicated port (commonly 5000, 8899, or 80).',
            'Service endpoints: /onvif/device_service, /onvif/media_service, /onvif/ptz_service.',
            'PTZ uses ContinuousMove SOAP action. Stop is achieved by sending ContinuousMove with velocity (0,0).',
            'Profile token is typically "IPCProfilesToken0" for cheap Chinese cameras (Yoosee, Wansview, etc).',
            'Many budget cameras (Yoosee, CamHi, XMEye) have port 80 CLOSED - only RTSP:554 and ONVIF:5000 are open.',
            'RTSP streams are usually at rtsp://{user}:{pass}@{ip}:554/onvif1 (main) or /onvif2 (sub).',
            'Budget cameras often stream H265/HEVC which requires ffmpeg transcoding to H264 for browser playback.',
            'ONVIF SOAP Content-Type header MUST be "application/soap+xml".',
            'GetDeviceInformation on /onvif/device_service is the best connectivity check (getStatus).',
            'Snapshot via ONVIF GetSnapshotUri is unreliable on cheap cameras - use go2rtc frame API instead.',
            'ContinuousMove SOAP body: <ContinuousMove xmlns="http://www.onvif.org/ver20/ptz/wsdl"><ProfileToken>TOKEN</ProfileToken><Velocity><PanTilt x="X" y="Y" xmlns="http://www.onvif.org/ver10/schema"/></Velocity></ContinuousMove>',
            'Always include a ptzStop action that sends ContinuousMove with x="0" y="0" to halt movement.'
        ].join('\n'),
        url_template: 'http://{ip}:5000/onvif/device_service'
    },
    'yoosee': {
        repo: 'home-assistant/core/tree/dev/homeassistant/components/onvif',
        ports: [554, 5000],
        patterns: [
            'Yoosee/CamHi/CloudEdge cameras are budget Chinese IP cameras with ONVIF support.',
            'CRITICAL: Port 80 is usually CLOSED on these cameras. Do NOT use HTTP CGI for PTZ.',
            'Open ports: RTSP(554), ONVIF(5000). Some also have FTP(21) and Telnet(23).',
            'RTSP URL: rtsp://{username}:{password}@{ip}:554/onvif1 (main stream, H264 or H265)',
            'ONVIF PTZ: POST to http://{ip}:5000/onvif/ptz_service with SOAP ContinuousMove.',
            'ONVIF Status: POST to http://{ip}:5000/onvif/device_service with GetDeviceInformation.',
            'Profile token: "IPCProfilesToken0".',
            'Default credentials: admin/(device-specific password).',
            'The Stop command is NOT supported - use ContinuousMove with velocity (0,0) instead.',
            'H265 cameras need ffmpeg transcoding for browser playback via go2rtc.',
            'Snapshot: use go2rtc frame.jpeg API, NOT the camera HTTP endpoint.'
        ].join('\n'),
        url_template: 'rtsp://{username}:{password}@{ip}:554/onvif1'
    }
};

/**
 * Repositórios de referência por categoria (Minas de Ouro TS/JS)
 */
export const REPO_INDEX = {
    zigbee: 'https://github.com/Koenkk/zigbee-herdsman-converters/tree/master/src/devices',
    zwave: 'https://github.com/zwave-js/node-zwave-js/tree/master/packages/config/config/devices',
    tuya: 'https://github.com/tuya/tuya-smart-node-sdk',
    tp_link: 'https://github.com/plasticrake/tplink-smarthome-api',
    xiaomi: 'https://github.com/aholstenson/miio',
    matter: 'https://github.com/project-chip/matter.js'
};

/**
 * Mapeia tipos de mDNS/SSDP para integracoes do Home Assistant
 */
export const DISCOVERY_MAP: Record<string, string> = {
    '_googlecast._tcp': 'chromecast',
    '_airplay._tcp': 'apple_tv',
    '_axis-video._tcp': 'axis',
    '_elgato._tcp': 'elgato',
    '_hap._tcp': 'homekit',
    '_sonos._tcp': 'sonos',
    '_spotify-connect._tcp': 'spotify',
    '_yeelight._tcp': 'yeelight',
    '_wled._tcp': 'wled',
    '_shelly._tcp': 'shelly',
    '_esphomelib._tcp': 'esphome',
    '_ipp._tcp': 'ipp_printer',
    'urn:schemas-upnp-org:device:MediaRenderer:1': 'dlna_dmr',
    'urn:dial-multiscreen-org:service:dial:1': 'samsungtv',
    'urn:schemas-wiz-com:device:WizDevice:1': 'wiz',
    '_onvif._tcp': 'onvif',
    'urn:schemas-xmlsoap-org:service:onvif': 'onvif'
};
