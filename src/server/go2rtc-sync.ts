/**
 * Syncs existing camera devices with go2rtc on startup.
 * 
 * Reads all camera devices from the database, builds their RTSP URLs
 * from driver configs, and registers each stream with go2rtc.
 * 
 * For RTSP cameras: registers TWO sources per stream:
 *   1) Native RTSP with UDP transport (for snapshots and H265-capable clients)
 *   2) FFmpeg transcoding H265→H264 with UDP transport (for browser WebRTC/MSE)
 * go2rtc automatically selects the right source based on client codec support.
 */
import { readDevices } from '../cli/utils/device-registry';
import { getDriver } from '../cli/utils/drivers';
import * as go2rtc from './go2rtc';

/**
 * Build the RTSP URL for a camera device using its driver config.
 */
async function buildRtspUrl(device: { id: string; ip?: string; username?: string; password?: string }): Promise<string | null> {
  try {
    const driverEntry = await getDriver(device.id);
    if (!driverEntry) return null;

    const actions = (driverEntry.config as any)?.actions;
    const streamAction = actions?.getStream;
    if (!streamAction?.url) return null;

    let url: string = streamAction.url;
    if (device.username) url = url.replace(/{username}/g, device.username);
    if (device.password) url = url.replace(/{password}/g, device.password);
    if (device.ip) url = url.replace(/{ip}/g, device.ip);

    return url;
  } catch {
    return null;
  }
}

/**
 * Build the list of go2rtc sources for a camera stream URL.
 * 
 * For RTSP cameras, returns two sources:
 *   1) Native RTSP with #transport=udp (for snapshots/H265 clients)
 *   2) ffmpeg: with #input=rtsp/udp#video=h264 (H265→H264 transcoding for browsers)
 * 
 * For HTTP/HLS cameras, returns the URL as-is.
 */
function buildGo2rtcSources(rawUrl: string): string[] {
  if (rawUrl.startsWith('rtsp://')) {
    return [
      // Source 1: native RTSP with UDP (for snapshots and H265-capable clients like Safari)
      `${rawUrl}#transport=udp`,
      // Source 2: ffmpeg transcoding H265→H264 with UDP input (for Chrome/Firefox WebRTC)
      `ffmpeg:${rawUrl}#input=rtsp/udp#video=h264`,
    ];
  }
  // Non-RTSP sources (HTTP/HLS) – pass through as-is
  return [rawUrl];
}

/**
 * Register a single camera device with go2rtc.
 * Call this whenever a camera device is added or updated.
 */
export async function registerCameraStream(device: { id: string; ip?: string; username?: string; password?: string }): Promise<boolean> {
  const rawUrl = await buildRtspUrl(device);
  if (!rawUrl) {
    console.log(`[go2rtc-sync] No stream URL for device ${device.id}, skipping`);
    return false;
  }

  const sources = buildGo2rtcSources(rawUrl);
  return go2rtc.registerStream(device.id, ...sources);
}

/**
 * Sync all camera devices with go2rtc.
 * Called on server startup; waits for go2rtc to become available.
 */
export async function syncCameraStreams(): Promise<void> {
  // Wait a bit for go2rtc to be ready (it starts in a separate container)
  const maxRetries = 10;
  const retryDelay = 3000;

  for (let i = 0; i < maxRetries; i++) {
    const available = await go2rtc.isAvailable();
    if (available) break;

    if (i < maxRetries - 1) {
      console.log(`[go2rtc-sync] Waiting for go2rtc to be ready... (${i + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    } else {
      console.warn('[go2rtc-sync] go2rtc not available after retries, skipping camera sync');
      return;
    }
  }

  console.log('[go2rtc-sync] Syncing camera streams with go2rtc...');

  const devices = await readDevices();
  const cameras = devices.filter(d => d.type?.toLowerCase() === 'camera');

  if (cameras.length === 0) {
    console.log('[go2rtc-sync] No camera devices found');
    return;
  }

  let registered = 0;
  for (const camera of cameras) {
    const ok = await registerCameraStream(camera);
    if (ok) registered++;
  }

  console.log(`[go2rtc-sync] Registered ${registered}/${cameras.length} camera streams`);
}
