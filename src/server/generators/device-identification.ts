export const IDENTIFICATION_TABLES = {
    oui: [
        { name: "Apple", subtype: "iPhone / iPad / Watch", prefix: ["D0:D2:B0", "FC:FC:48", "00:0A:95"], ports: [62078, 5353], protocol: "mDNS (Bonjour), AWDL" },
        { name: "Apple", subtype: "Apple TV", prefix: ["D0:03:4B", "40:4D:7F"], ports: [7000, 3689], protocol: "Bonjour (_airplay._tcp)" },
        { name: "Android", subtype: "Samsung Galaxy", prefix: ["40:4E:36", "50:85:69", "A8:7D:12"], ports: [7236], protocol: "SSDP, DHCP Option 12" },
        { name: "Android", subtype: "Google Pixel / Genérico", prefix: ["DA:A1:19", "94:E6:86"], ports: [], protocol: "mDNS (_googlecast._tcp)" },
        { name: "Smart Home", subtype: "Lâmpadas Tuya / SmartLife", prefix: ["44:17:93", "EC:FA:BC", "AC:D0:74"], ports: [6668, 6667], protocol: "UDP Broadcast (Porta 6666/6667)" },
        { name: "Smart Home", subtype: "Philips Hue Bridge", prefix: ["00:17:88"], ports: [80, 443, 1900], protocol: "SSDP (UPnP)" },
        { name: "Smart Home", subtype: "Sonoff (eWeLink)", prefix: ["DC:4F:22", "24:6F:28"], ports: [8081], protocol: "mDNS (_ewelink._tcp)" },
        { name: "Smart Home", subtype: "Shelly", prefix: ["84:0D:8E", "C8:C9:A3"], ports: [80, 1883], protocol: "mDNS (_shelly._tcp)" },
        { name: "Assistentes", subtype: "Amazon Echo (Alexa)", prefix: ["FC:65:DE", "44:65:0D", "00:BB:3A"], ports: [55444, 80, 443], protocol: "SSDP, mDNS" },
        { name: "Assistentes", subtype: "Google Nest / Home", prefix: ["D8:24:BD", "A4:77:33", "00:1A:11"], ports: [8008, 8009, 10001], protocol: "mDNS (_googlecast._tcp)" },
        { name: "Streaming", subtype: "Roku", prefix: ["88:DE:A9", "2C:3A:E8"], ports: [8060, 1900], protocol: "SSDP (roku:ecp)" },
        { name: "Streaming", subtype: "Chromecast", prefix: ["6C:AD:F8", "E8:07:BF"], ports: [8008, 8009], protocol: "mDNS (_googlecast._tcp)" },
        { name: "Consoles", subtype: "PlayStation 4/5", prefix: ["00:D9:D1", "FC:C2:DE", "BC:60:A7"], ports: [9295, 9304], protocol: "SSDP" },
        { name: "Consoles", subtype: "Xbox One/Series", prefix: ["2C:F0:5D", "50:1A:C5"], ports: [5050, 49152], protocol: "SSDP, Portas Xbox Live" },
        { name: "Consoles", subtype: "Nintendo Switch", prefix: ["94:58:CB", "E0:E5:CF"], ports: [], protocol: "DHCP Hostname: Nintendo-Switch" },
        { name: "Smart TV", subtype: "LG (WebOS)", prefix: ["3C:CD:36", "A8:23:FE"], ports: [9955, 3000, 8080], protocol: "SSDP, mDNS (_lg_smart_tv._tcp)" },
        { name: "Smart TV", subtype: "Samsung (Tizen)", prefix: ["48:44:F7", "64:1C:AE", "BC:72:B1", "D0:C2:4E", "CC:6E:A4", "70:2A:D5", "38:BB:23", "00:00:F0", "70:2A:D5"], ports: [8001, 8002, 1515], protocol: "SSDP, DLNA" },
        { name: "Smart TV", subtype: "Sony Bravia", prefix: ["00:24:BE", "3C:07:71", "40:83:DE", "54:53:ED"], ports: [80, 8080, 2022], protocol: "SSDP (_sony-bravia._tcp)" },
        { name: "Smart TV", subtype: "Vizio", prefix: ["00:07:D1", "00:1E:AE"], ports: [7345, 9000], protocol: "mDNS (_vizio._tcp)" },
        { name: "Smart TV", subtype: "Panasonic", prefix: ["00:0B:97", "44:61:32"], ports: [8080], protocol: "UPnP (Viera)" },
        { name: "IoT", subtype: "Espressif (ESP8266/ESP32)", prefix: ["24:0A:C4", "30:AE:A4", "A4:CF:12", "D8:F1:5B", "EC:FA:BC"], ports: [80, 8266], protocol: "mDNS, HTTP" },
        { name: "IoT", subtype: "Shelly (Allterco)", prefix: ["40:22:D8", "84:F3:EB", "C8:C9:A3"], ports: [80, 1883], protocol: "mDNS (_shelly._tcp)" },
        { name: "Network", subtype: "Ubiquiti UniFi", prefix: ["00:15:6D", "04:18:D6", "18:E8:29", "24:A4:3C", "44:D9:E7", "68:72:51", "70:A7:41", "74:83:C2", "80:2A:A8", "B4:FB:E4", "FC:EC:DA"], ports: [80, 443, 8080], protocol: "mDNS, HTTP" },
        { name: "Network", subtype: "MikroTik", prefix: ["00:0C:42", "2C:C8:1B", "48:8F:5A", "64:D1:54", "E4:8D:8C"], ports: [80, 443, 8291, 8728], protocol: "MNDP, SNMP" },
        { name: "Computador", subtype: "Windows PC", prefix: ["00:15:5D", "A4:BB:6D"], ports: [135, 139, 445, 3389], protocol: "NetBIOS, LLMNR, SSDP" },
        { name: "Computador", subtype: "MacBook / Mac Mini", prefix: ["F4:0F:24", "AC:BC:32"], ports: [548, 5900], protocol: "Bonjour (_afpovertcp._tcp)" },
        { name: "Impressora", subtype: "HP / Epson / Brother", prefix: ["00:18:71", "00:80:77"], ports: [9100, 631], protocol: "mDNS, SNMP" }
    ],
    ports: {
        502: "Modbus TCP (Inversores Solares, Medidores)",
        47808: "BACnet (HVAC, Chillers)",
        1911: "Fox / Niagara (BMS)",
        5060: "SIP (VoIP)",
        554: "RTSP (Câmeras, NVRs)",
        8000: "SDK Fabricante (DVR/NVR)",
        1883: "MQTT (IoT, Zigbee Hubs)",
        5683: "CoAP (IoT Baixo Consumo)",
        9100: "JetDirect (Impressoras)",
        5000: "Synology / Mobile (NAS)",
        32400: "Plex (Media Server)",
        8060: "ECP (Roku)",
        8008: "Google Cast (Chromecast/Google Home)",
        62078: "iOS Lockdown (iPhone/iPad)",
        3689: "DAAP (Apple TV/iTunes)",
        7000: "AirPlay (Apple)",
        8001: "SmartView (Samsung TV - Tizen)",
        8002: "SmartView Secure (Samsung TV - Tizen)",
        9955: "WebOS Pairing (LG TV)",
        3000: "Grafana / WebOS",
        1900: "SSDP (UPnP Discovery)",
        5353: "mDNS (Bonjour)",
        5900: "VNC",
        3389: "RDP (Windows)",
        22: "SSH",
        23: "Telnet",
        161: "SNMP",
        10001: "Ubiquiti (Unifi) / Google Home",
        55444: "Alexa Remote",
        6668: "Tuya Cloud",
        9999: "Kasa Protocol (TP-Link)",
        548: "AFP (Apple)",
        2000: "SCCP (Cisco)",
        8123: "Home Assistant",
        3722: "HomeKit",
        8888: "Xiaomi Miio",
        55055: "Denon/Marantz Receiver",
        60006: "Philips Hue Sync",
        49444: "Luxaflex/HunterDouglas",
        5005: "Sonos API",
        1400: "Sonos Web",
        40317: "IKEA Tradfri",
        51820: "WireGuard VPN",
        11111: "V-Sync / LED Control",
        4334: "GREE AC",
        20005: "Fronius Solar",
        8899: "Baichuan/Onvif",
        9080: "WD My Cloud",
        8200: "DLNA / MiniDLNA",
        8096: "Jellyfin",
        4567: "Denon HEOS",
        8384: "Syncthing",
        5031: "AVM Fritz!Box",
        21063: "Philips Hue API",
        5555: "ADB (Android)",
        49153: "Belkin WeMo",
        8083: "Z-Way",
        9090: "Cockpit / Kodi / OpenHab",
        6454: "Art-Net (DMX)",
        5040: "Samsung SideSync",
        8081: "Tasmota Admin",
        49000: "Fritz!UPnP",
        9001: "Tor ORPort",
        1962: "PCWorx",
        2222: "Ethernet/IP",
        10002: "Cisco Apex",
        5959: "DJI Video",
        50001: "Isonas Access",
        60000: "SRT Protocol",
        24555: "Brickd (LEGO)",
        8881: "Viessmann HVAC",
        25565: "Minecraft Server",
        9091: "Transmission",
        30005: "Dump1090 (ADS-B)",
        4000: "NoMachine / Core Home",
        6565: "ScreenConnect",
        8086: "InfluxDB",
        1515: "Samsung Home / Printers",
        8180: "Cisco Meeting",
        43000: "TP-Link Deco",
        55056: "Denon HEOS Alt",
        21047: "Logitech Media (Squeezebox)",
        25001: "SolarEdge Inverter",
        4070: "Spotify Connect",
        5631: "pcAnywhere",
        1901: "Guided Discovery (TVs)",
        49155: "TV Control (Philips/Sharp)"
    } as Record<number, string>
};

export const identifyDevice = (ip: string, port: number, mac?: string, extra?: { name?: string, manufacturer?: string, model?: string }): { hint: string, template?: string } | null => {
    console.log(`[DeviceIdentification] Identifying device ${ip}:${port}, manufacturer: ${extra?.manufacturer}, name: ${extra?.name}, model: ${extra?.model}`);
    let hints: string[] = [];
    let templateId: string | undefined;

    const normalizedName = (extra?.name || '').toLowerCase();
    const normalizedManufacturer = (extra?.manufacturer || '').toLowerCase();
    const normalizedModel = (extra?.model || '').toLowerCase();

    console.log(`[DeviceIdentification] Checking: manufacturer="${extra?.manufacturer}", model="${extra?.model}", name="${extra?.name}"`);
    console.log(`[DeviceIdentification] Normalized: manufacturer="${normalizedManufacturer}", model="${normalizedModel}", name="${normalizedName}"`);

    // 1. Check OUI/MAC
    if (mac) {
        const cleanMac = (mac || '').toUpperCase().replace(/-/g, ':');
        
        const match = IDENTIFICATION_TABLES.oui.find(entry => 
            entry.prefix.some(p => cleanMac.startsWith(p.toUpperCase()))
        );

        if (match) {
            hints.push(`MAC Address suggests: ${match.name} (${match.subtype}). Protocol: ${match.protocol}`);
            if (match.subtype.includes('Samsung')) templateId = 'samsung-tizen-tv';
        }
    }

    // 2. Check Port
    const portService = IDENTIFICATION_TABLES.ports[port];
    if (portService) {
        hints.push(`Port ${port} is typically used by: ${portService}.`);
        if (port === 8001 || port === 8002) templateId = 'samsung-tizen-tv';
    }

    // 3. Check Metadata (Name, Manufacturer)
    if (normalizedManufacturer.includes('samsung') || normalizedName.includes('samsung') || normalizedModel.includes('qaq80')) {
        hints.push(`Metadata indicates a Samsung device.`);
        templateId = 'samsung-tizen-tv';
    }

    // 4. Check for Camera devices
    const cameraPorts = [554, 8899, 80, 8080, 8000, 5000]; // RTSP, ONVIF, HTTP variants
    const cameraKeywords = ['camera', 'cam', 'ipcam', 'nvr', 'dvr', 'surveillance', 'security', 'onvif'];
    
    if (cameraPorts.includes(port) || 
        cameraKeywords.some(keyword => normalizedName.includes(keyword) || normalizedManufacturer.includes(keyword))) {
        hints.push(`Device appears to be a camera or surveillance system.`);
        
        // Check for specific brands
        if (normalizedManufacturer.toLowerCase().includes('hikvision') || 
            normalizedModel.toLowerCase().includes('hikvision') ||
            normalizedName.toLowerCase().includes('hikvision')) {
            hints.push(`Detected Hikvision camera - using optimized template.`);
            templateId = 'hikvision-camera';
        } else if (normalizedManufacturer.toLowerCase().includes('tp-link') || 
                   normalizedModel.toLowerCase().includes('tp-link') ||
                   normalizedName.toLowerCase().includes('tp-link')) {
            hints.push(`Detected TP-Link camera - using optimized template.`);
            templateId = 'tplink-camera';
        } else if (normalizedManufacturer.toLowerCase().includes('reolink') || 
                   normalizedModel.toLowerCase().includes('reolink') ||
                   normalizedName.toLowerCase().includes('reolink')) {
            hints.push(`Detected Reolink camera - using optimized template.`);
            templateId = 'reolink-camera';
        } else if (normalizedManufacturer.toLowerCase().includes('amcrest') || 
                   normalizedModel.toLowerCase().includes('amcrest') ||
                   normalizedName.toLowerCase().includes('amcrest')) {
            hints.push(`Detected Amcrest camera - using optimized template.`);
            templateId = 'amcrest-camera';
        } else if (normalizedManufacturer.toLowerCase().includes('yoosee') || 
                   normalizedModel.toLowerCase().includes('yoosee') ||
                   normalizedName.toLowerCase().includes('yoosee') ||
                   normalizedName.toLowerCase().includes('cloudedge') ||
                   normalizedName.toLowerCase().includes('camhi')) {
            hints.push(`Detected Yoosee/CamHi camera. CRITICAL: Port 80 is usually CLOSED on these cameras. Use ONVIF on port 5000 for PTZ (SOAP ContinuousMove) and RTSP on port 554 for streaming (/onvif1 path).`);
            templateId = 'yoosee-camera';
        } else if (port === 5000 || port === 8899) {
            // ONVIF port detected but no specific brand match
            hints.push(`Detected ONVIF camera on port ${port}. Using ONVIF PTZ template with SOAP ContinuousMove. Profile token is typically "IPCProfilesToken0".`);
            templateId = 'onvif-ptz-camera';
        } else if (port === 554) {
            // RTSP port - likely a camera, try ONVIF template as default
            hints.push(`RTSP port 554 detected. Camera likely supports ONVIF on port 5000 for PTZ control.`);
            templateId = 'onvif-ptz-camera';
        } else {
            hints.push(`Using generic camera template.`);
            templateId = 'generic-camera';
        }
    }

    // 3. Combine hints
    if (hints.length === 0) {
        return null;
    }

    return {
        hint: `Device Identification Analysis:\n- ${hints.join('\n- ')}`,
        template: templateId
    };
};
