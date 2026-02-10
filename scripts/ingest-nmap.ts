import { promises as fs } from 'fs';
import path from 'path';
import { appendLogEntry } from '../src/cli/utils/storage-files';
import http from 'http';
import https from 'https';
import net from 'net';
import dgram from 'dgram';

const args = process.argv.slice(2);
const inputIndex = args.findIndex((arg) => arg === '--input');
const inputPath = inputIndex >= 0 ? args[inputIndex + 1] : undefined;

if (!inputPath) {
  console.error('Usage: ts-node scripts/ingest-nmap.ts --input <file.gnmap>');
  process.exit(1);
}

const signatureFromPort = (port: number) => {
  if (port === 4387) return 'gree';
  if (port === 554 || port === 8899 || port === 8000) return 'camera';
  if (port === 8001 || port === 8002 || port === 1515) return 'samsung';
  if (port === 1900) return 'ssdp';
  if (port === 80 || port === 443 || port === 8080) return 'http';
  return 'unknown';
};

const normalizeMac = (mac?: string) => (mac || '').replace(/[^a-fA-F0-9]/g, '').toLowerCase();

const sendWakeOnLan = (mac: string, broadcast = '255.255.255.255') =>
  new Promise<void>((resolve, reject) => {
    const normalized = normalizeMac(mac);
    if (normalized.length !== 12) {
      resolve();
      return;
    }
    const buffer = Buffer.alloc(6 + 16 * 6, 0xff);
    for (let i = 0; i < 16; i += 1) {
      Buffer.from(normalized, 'hex').copy(buffer, 6 + i * 6);
    }
    const socket = dgram.createSocket('udp4');
    socket.once('error', (error) => {
      socket.close();
      reject(error);
    });
    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(buffer, 9, broadcast, (error) => {
        socket.close();
        if (error) reject(error);
        else resolve();
      });
    });
  });

const probeHttp = (ip: string, port: number) =>
  new Promise<Record<string, unknown>>((resolve) => {
    const client = port === 443 ? https : http;
    const request = client.request(
      {
        host: ip,
        port,
        method: 'HEAD',
        path: '/',
        timeout: 1500,
        rejectUnauthorized: false
      },
      (response) => {
        const headers = response.headers || {};
        resolve({
          port,
          status: response.statusCode,
          server: headers.server,
          poweredBy: headers['x-powered-by'],
          contentType: headers['content-type'],
          wwwAuthenticate: headers['www-authenticate']
        });
        response.resume();
      }
    );
    request.on('timeout', () => {
      request.destroy();
      resolve({ port, error: 'timeout' });
    });
    request.on('error', (error) => resolve({ port, error: error.message }));
    request.end();
  });

const probeHttpBody = (ip: string, port: number) =>
  new Promise<Record<string, unknown>>((resolve) => {
    const client = port === 443 ? https : http;
    const request = client.request(
      {
        host: ip,
        port,
        method: 'GET',
        path: '/',
        timeout: 2000,
        rejectUnauthorized: false
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          if (body.length < 4096) {
            body += chunk.toString();
          }
        });
        response.on('end', () => {
          const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);
          const title = titleMatch ? titleMatch[1].trim() : undefined;
          resolve({
            port,
            status: response.statusCode,
            title,
            snippet: body.slice(0, 512)
          });
        });
      }
    );
    request.on('timeout', () => {
      request.destroy();
      resolve({ port, error: 'timeout' });
    });
    request.on('error', (error) => resolve({ port, error: error.message }));
    request.end();
  });

const probeRtsp = (ip: string, port: number) =>
  new Promise<Record<string, unknown>>((resolve) => {
    const socket = new net.Socket();
    let resolved = false;
    const finish = (payload: Record<string, unknown>) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(payload);
    };
    socket.setTimeout(1500);
    socket.on('connect', () => {
      const payload = 'OPTIONS rtsp://'+ ip +'/ RTSP/1.0\r\nCSeq: 1\r\n\r\n';
      socket.write(payload);
    });
    socket.on('data', (data) => {
      const text = data.toString('utf8');
      const serverMatch = text.match(/Server:\s*(.+)\r\n/i);
      finish({ port, responseLine: text.split('\r\n')[0], server: serverMatch ? serverMatch[1] : undefined });
    });
    socket.on('timeout', () => finish({ port, error: 'timeout' }));
    socket.on('error', (error) => finish({ port, error: error.message }));
    socket.connect(port, ip);
  });

const probeTcpBanner = (ip: string, port: number) =>
  new Promise<Record<string, unknown>>((resolve) => {
    const socket = new net.Socket();
    let resolved = false;
    const finish = (payload: Record<string, unknown>) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(payload);
    };
    socket.setTimeout(1500);
    socket.on('connect', () => {
      setTimeout(() => {
        finish({ port, error: 'no-banner' });
      }, 500);
    });
    socket.on('data', (data) => {
      const text = data.toString('utf8');
      finish({ port, banner: text.slice(0, 512) });
    });
    socket.on('timeout', () => finish({ port, error: 'timeout' }));
    socket.on('error', (error) => finish({ port, error: error.message }));
    socket.connect(port, ip);
  });

const probeUdp = (ip: string, port: number, payload: string) =>
  new Promise<Record<string, unknown>>((resolve) => {
    const socket = dgram.createSocket('udp4');
    let resolved = false;
    const finish = (result: Record<string, unknown>) => {
      if (resolved) return;
      resolved = true;
      socket.close();
      resolve(result);
    };
    socket.on('message', (message, rinfo) => {
      finish({
        port,
        from: rinfo.address,
        response: message.toString('utf8').slice(0, 2048)
      });
    });
    socket.on('error', (error) => finish({ port, error: error.message }));
    socket.send(payload, port, ip, (error) => {
      if (error) {
        finish({ port, error: error.message });
      }
    });
    setTimeout(() => finish({ port, error: 'timeout' }), 1500);
  });

const parseSsdpHeaders = (payload: string) => {
  const getHeader = (name: string) => {
    const match = payload.match(new RegExp(`^${name}:\\s*(.+)$`, 'mi'));
    return match ? match[1].trim() : undefined;
  };
  return {
    location: getHeader('LOCATION'),
    server: getHeader('SERVER'),
    st: getHeader('ST'),
    usn: getHeader('USN')
  };
};

const extractXmlTag = (xml: string, tag: string) => {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? match[1].trim() : undefined;
};

const fetchSsdpDescription = (location: string) =>
  new Promise<Record<string, unknown>>((resolve) => {
    try {
      const url = new URL(location);
      const client = url.protocol === 'https:' ? https : http;
      const request = client.request(
        {
          hostname: url.hostname,
          port: url.port ? Number.parseInt(url.port, 10) : url.protocol === 'https:' ? 443 : 80,
          path: url.pathname + url.search,
          method: 'GET',
          timeout: 2000,
          rejectUnauthorized: false
        },
        (response) => {
          let body = '';
          response.setEncoding('utf8');
          response.on('data', (chunk) => {
            if (body.length < 12000) {
              body += chunk.toString();
            }
          });
          response.on('end', () => {
            resolve({
              location,
              status: response.statusCode,
              friendlyName: extractXmlTag(body, 'friendlyName'),
              manufacturer: extractXmlTag(body, 'manufacturer'),
              manufacturerURL: extractXmlTag(body, 'manufacturerURL'),
              modelName: extractXmlTag(body, 'modelName'),
              modelNumber: extractXmlTag(body, 'modelNumber'),
              serialNumber: extractXmlTag(body, 'serialNumber'),
              udn: extractXmlTag(body, 'UDN')
            });
          });
        }
      );
      request.on('timeout', () => {
        request.destroy();
        resolve({ location, error: 'timeout' });
      });
      request.on('error', (error) => resolve({ location, error: error.message }));
      request.end();
    } catch (error) {
      resolve({ location, error: (error as Error).message });
    }
  });

const parsePorts = (portsSegment: string) => {
  const ports: Array<{ port: number; protocol: string; service?: string }> = [];
  const entries = portsSegment.split(',').map((entry) => entry.trim()).filter(Boolean);
  for (const entry of entries) {
    const parts = entry.split('/');
    const port = Number.parseInt(parts[0], 10);
    const state = parts[1];
    const protocol = parts[2];
    const service = parts[4];
    if (Number.isNaN(port) || state !== 'open') continue;
    ports.push({ port, protocol, service: service || undefined });
  }
  return ports;
};

const parseLine = (line: string) => {
  if (!line.startsWith('Host:')) return null;
  const [hostPart, rest] = line.split('\t');
  if (!hostPart) return null;
  const hostMatch = hostPart.match(/Host:\s+([^\s]+)/);
  if (!hostMatch) return null;
  const ip = hostMatch[1];
  const macMatch = line.match(/MAC Address:\s+([0-9A-F:]+)/i);
  const mac = macMatch ? macMatch[1] : undefined;
  const vendorMatch = line.match(/MAC Address:\s+[0-9A-F:]+\s+\(([^)]+)\)/i);
  const vendor = vendorMatch ? vendorMatch[1] : undefined;
  const portsMatch = line.match(/Ports:\s+([^\t]+)/);
  const ports = portsMatch ? parsePorts(portsMatch[1]) : [];
  return { ip, mac, vendor, ports, hostnames: [] as string[] };
};

const run = async () => {
  const resolved = path.resolve(inputPath);
  const content = await fs.readFile(resolved, 'utf-8');
  if (content.trim().startsWith('<?xml')) {
    const extractAddress = (block: string, addrType: string) => {
      const patternOne = new RegExp(`addrtype="${addrType}"[^>]*addr="([^"]+)"`, 'i');
      const patternTwo = new RegExp(`addr="([^"]+)"[^>]*addrtype="${addrType}"`, 'i');
      return block.match(patternOne)?.[1] || block.match(patternTwo)?.[1];
    };
    const hostBlocks = content.split('<host').slice(1).map((block) => '<host' + block);
    for (const block of hostBlocks) {
      const ip = extractAddress(block, 'ipv4');
      if (!ip) continue;
      const mac = extractAddress(block, 'mac');
      const vendorMatch = block.match(/addrtype="mac"[^>]*vendor="([^"]+)"/i);
      const hostnameMatches = [...block.matchAll(/<hostname[^>]*name="([^"]+)"/gi)].map(
        (match) => match[1]
      );

      await appendLogEntry({
        timestamp: new Date().toISOString(),
        device: 'discovery',
        event: 'device_discovery',
        payload: {
          source: 'nmap-xml',
          ip,
          mac: mac,
          vendor: vendorMatch ? vendorMatch[1] : undefined,
          hostnames: hostnameMatches
        }
      });
    }
    return;
  }

  const lines = content.split('\n').filter(Boolean);

  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) continue;
  const { ip, mac, vendor, ports, hostnames } = parsed;
    const openPorts = ports.map((entry) => ({
      port: entry.port,
      protocol: entry.protocol,
      service: entry.service,
      signature: signatureFromPort(entry.port)
    }));

    await appendLogEntry({
      timestamp: new Date().toISOString(),
      device: 'discovery',
      event: 'device_discovery',
      payload: {
        source: 'nmap',
        ip,
        mac,
        vendor,
        openPorts
      }
    });

    if (ports.length === 0) {
      continue;
    }

    const httpPorts = ports.filter((entry) => [80, 443, 8080, 8001, 8002].includes(entry.port));
    const rtspPorts = ports.filter((entry) => [554, 8899, 8000].includes(entry.port));
    const tcpBannerPorts = ports.filter(
      (entry) =>
        entry.protocol === 'tcp' &&
        ![80, 443, 8080, 8001, 8002, 1515, 554, 8899, 8000].includes(entry.port)
    );
    const udpPorts = ports.filter((entry) => entry.protocol === 'udp');

    const httpDetails = [] as Record<string, unknown>[];
    for (const portInfo of httpPorts) {
      httpDetails.push(await probeHttp(ip, portInfo.port));
      httpDetails.push(await probeHttpBody(ip, portInfo.port));
    }

    const rtspDetails = [] as Record<string, unknown>[];
    for (const portInfo of rtspPorts) {
      rtspDetails.push(await probeRtsp(ip, portInfo.port));
    }

    const tcpBannerDetails = [] as Record<string, unknown>[];
    for (const portInfo of tcpBannerPorts) {
      tcpBannerDetails.push(await probeTcpBanner(ip, portInfo.port));
    }

    const udpDetails = [] as Record<string, unknown>[];
    for (const portInfo of udpPorts) {
      if (portInfo.port === 1900) {
        const ssdpPayload =
          'M-SEARCH * HTTP/1.1\r\n' +
          'HOST: 239.255.255.250:1900\r\n' +
          'MAN: "ssdp:discover"\r\n' +
          'MX: 1\r\n' +
          'ST: ssdp:all\r\n\r\n';
        const response = await probeUdp(ip, portInfo.port, ssdpPayload);
        if (typeof response.response === 'string') {
          const headers = parseSsdpHeaders(response.response);
          const enriched: Record<string, unknown> = { ...response, headers };
          if (headers.location) {
            enriched.description = await fetchSsdpDescription(headers.location);
          }
          udpDetails.push(enriched);
        } else {
          udpDetails.push(response);
        }
      } else if (portInfo.port === 4387) {
        udpDetails.push(await probeUdp(ip, portInfo.port, '{"t":"scan"}'));
      }
    }

    if (httpDetails.length || rtspDetails.length || tcpBannerDetails.length || udpDetails.length) {
      await appendLogEntry({
        timestamp: new Date().toISOString(),
        device: 'discovery',
        event: 'device_probe',
        payload: {
          source: 'nmap',
          ip,
          mac,
          vendor,
          http: httpDetails,
          rtsp: rtspDetails,
          tcpBanner: tcpBannerDetails,
          udp: udpDetails
        }
      });
    }

    const wolEnabled = process.env.ELO_WOL_ENABLED !== 'false';
    const samsungHint = (vendor || '').toLowerCase().includes('samsung') ||
      hostnames.some((name) => name.toLowerCase().includes('samsung'));
    if (wolEnabled && samsungHint && mac && openPorts.every((entry) => ![8001, 8002, 1515].includes(entry.port))) {
      try {
        await sendWakeOnLan(mac, process.env.ELO_WOL_BROADCAST || '255.255.255.255');
        await appendLogEntry({
          timestamp: new Date().toISOString(),
          device: 'discovery',
          event: 'device_wol',
          payload: {
            source: 'nmap',
            ip,
            mac,
            vendor,
            broadcast: process.env.ELO_WOL_BROADCAST || '255.255.255.255',
            reason: 'Samsung device detected without API ports open.'
          }
        });
      } catch (error) {
        await appendLogEntry({
          timestamp: new Date().toISOString(),
          device: 'discovery',
          event: 'device_wol_failed',
          payload: {
            source: 'nmap',
            ip,
            mac,
            vendor,
            error: (error as Error).message
          }
        });
      }
    }
  }
};

run().catch((error) => {
  console.error('[ELO] Failed to ingest nmap output:', error);
  process.exit(1);
});
