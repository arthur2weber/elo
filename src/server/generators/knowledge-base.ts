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
        patterns: 'WebSocket wss://<ip>:8002/api/v2/channels/samsung.remote.control',
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
    'urn:schemas-wiz-com:device:WizDevice:1': 'wiz'
};
