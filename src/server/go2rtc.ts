/**
 * go2rtc integration module
 * 
 * Manages camera stream registration with go2rtc for WebRTC/MSE playback
 * and snapshot retrieval via go2rtc API.
 */
import axios from 'axios';

const GO2RTC_URL = process.env.GO2RTC_URL || 'http://127.0.0.1:1984';

/** Sanitize a device id into a valid go2rtc stream name */
export function streamName(deviceId: string): string {
  return deviceId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Register (or update) a camera stream in go2rtc with one or more sources.
 * Uses the go2rtc REST API: PUT /api/streams?name=<name>&src=<url1>&src=<url2>
 * 
 * Multiple sources allow go2rtc to pick the best one for each consumer.
 * E.g. native RTSP (for H265-capable clients) + ffmpeg transcode (for H264 browsers).
 */
export async function registerStream(deviceId: string, ...sources: string[]): Promise<boolean> {
  const name = streamName(deviceId);
  if (sources.length === 0) return false;
  try {
    // Build URL with multiple src params: ?name=X&src=Y1&src=Y2
    const params = new URLSearchParams();
    params.set('name', name);
    for (const src of sources) {
      params.append('src', src);
    }
    const url = `${GO2RTC_URL}/api/streams?${params.toString()}`;
    await axios.put(url, null, { timeout: 5000 });
    for (const src of sources) {
      console.log(`[go2rtc] Stream registered: ${name} → ${src.replace(/\/\/[^@]+@/, '//***:***@')}`);
    }
    return true;
  } catch (error) {
    console.error(`[go2rtc] Failed to register stream ${name}:`, (error as Error).message);
    return false;
  }
}

/**
 * Remove a camera stream from go2rtc.
 */
export async function unregisterStream(deviceId: string): Promise<boolean> {
  const name = streamName(deviceId);
  try {
    await axios.delete(`${GO2RTC_URL}/api/streams?name=${encodeURIComponent(name)}`, { timeout: 5000 });
    console.log(`[go2rtc] Stream removed: ${name}`);
    return true;
  } catch (error) {
    console.error(`[go2rtc] Failed to remove stream ${name}:`, (error as Error).message);
    return false;
  }
}

/**
 * Get the list of currently registered streams in go2rtc.
 */
export async function listStreams(): Promise<Record<string, any>> {
  try {
    const resp = await axios.get(`${GO2RTC_URL}/api/streams`, { timeout: 5000 });
    return resp.data || {};
  } catch (error) {
    console.error(`[go2rtc] Failed to list streams:`, (error as Error).message);
    return {};
  }
}

/**
 * Check if go2rtc is reachable.
 */
export async function isAvailable(): Promise<boolean> {
  try {
    await axios.get(`${GO2RTC_URL}/api/streams`, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get a JPEG snapshot frame from a go2rtc stream.
 * Returns the raw image buffer or null on failure.
 */
export async function getFrame(deviceId: string): Promise<{ data: Buffer; contentType: string } | null> {
  const name = streamName(deviceId);
  try {
    const resp = await axios.get(`${GO2RTC_URL}/api/frame.jpeg`, {
      params: { src: name },
      responseType: 'arraybuffer',
      timeout: 10000
    });
    return {
      data: Buffer.from(resp.data),
      contentType: resp.headers['content-type'] || 'image/jpeg'
    };
  } catch (error) {
    console.error(`[go2rtc] Failed to get frame for ${name}:`, (error as Error).message);
    return null;
  }
}

// ── URL builders ──────────────────────────────────────────────

/** URL for go2rtc built-in stream viewer (iframe-embeddable) */
export function viewerUrl(deviceId: string): string {
  const name = streamName(deviceId);
  return `${GO2RTC_URL}/stream.html?src=${encodeURIComponent(name)}&mode=webrtc`;
}

/** URL for go2rtc WebRTC stream (for custom players) */
export function webrtcUrl(deviceId: string): string {
  const name = streamName(deviceId);
  return `${GO2RTC_URL}/api/ws?src=${encodeURIComponent(name)}`;
}

/** URL for go2rtc MSE stream (Media Source Extensions – fallback) */
export function mseUrl(deviceId: string): string {
  const name = streamName(deviceId);
  return `${GO2RTC_URL}/api/stream.mp4?src=${encodeURIComponent(name)}`;
}

/** URL for JPEG snapshot frame */
export function frameUrl(deviceId: string): string {
  const name = streamName(deviceId);
  return `${GO2RTC_URL}/api/frame.jpeg?src=${encodeURIComponent(name)}`;
}
