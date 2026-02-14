const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
import { appendAiUsageLog } from '../cli/utils/storage-files';

// Extend Express Request type for multer
declare global {
    namespace Express {
        interface Request {
            file?: any;
        }
    }
}

const VOICE_UPLOAD_DIR = path.join(process.cwd(), 'temp', 'voice');
const STT_URL = process.env.STT_URL || 'http://localhost:8501';
const TTS_URL = process.env.TTS_URL || 'http://localhost:8502';
const WAKEWORD_URL = process.env.WAKEWORD_URL || 'http://localhost:8503';

// Ensure upload directory exists
if (!fs.existsSync(VOICE_UPLOAD_DIR)) {
    fs.mkdirSync(VOICE_UPLOAD_DIR, { recursive: true });
}

// Configure multer for audio file uploads
const upload = multer({
    dest: VOICE_UPLOAD_DIR,
    limits: {
        fileSize: 25 * 1024 * 1024, // 25MB limit
    },
    fileFilter: (req: any, file: any, cb: any) => {
        const allowedTypes = [
            'audio/wav', 'audio/x-wav', 'audio/wave',
            'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a',
            'audio/flac', 'audio/x-flac',
            'audio/webm', 'audio/ogg',
            'audio/aac', 'audio/amr',
            'application/octet-stream' // Browsers sometimes send this for audio
        ];
        const allowedExtensions = ['.wav', '.mp3', '.flac', '.webm', '.ogg', '.m4a', '.aac', '.mp4', '.amr'];
        const fileExtension = path.extname(file.originalname).toLowerCase();
        
        if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
            cb(null, true);
        } else {
            console.warn(`[VoiceGateway] Rejected file: ${file.originalname} (mimetype: ${file.mimetype})`);
            cb(new Error(`Invalid file type '${file.mimetype}'. Only audio files are allowed.`));
        }
    }
});

export interface VoiceGatewayOptions {
    sttUrl?: string;
    ttsUrl?: string;
    chatEndpoint?: string;
}

export const createVoiceGateway = (options: VoiceGatewayOptions = {}) => {
    const router = express.Router();
    const sttUrl = options.sttUrl || STT_URL;
    const ttsUrl = options.ttsUrl || TTS_URL;
    const chatEndpoint = options.chatEndpoint || 'http://localhost:3000/api/chat';

    /**
     * POST /api/voice/process
     * Process complete voice pipeline: audio → STT → chat → TTS → audio
     */
    router.post('/process', upload.single('audio'), async (req: any, res: any) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No audio file provided' });
            }

            const audioPath = req.file.path;
            const user = req.body.user || 'voice-user';

            console.log(`[VoiceGateway] Processing audio file: ${req.file.originalname} (${req.file.size} bytes)`);

            // Step 1: Speech-to-Text
            console.log('[VoiceGateway] Converting speech to text...');
            const sttFormData = createFormData(audioPath, req.file.mimetype, req.file.originalname);
            const sttResponse = await axios.post(`${sttUrl}/stt`, sttFormData, {
                headers: sttFormData.getHeaders(),
                timeout: 30000
            });

            const transcription = sttResponse.data;
            if (!transcription.text || transcription.text.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'No speech detected in audio',
                    transcription: transcription
                });
            }

            console.log(`[VoiceGateway] Transcribed: "${transcription.text}" (confidence: ${transcription.confidence})`);

            // Log STT usage
            await appendAiUsageLog({
                timestamp: new Date().toISOString(),
                source: 'voice:stt',
                tags: ['voice', 'stt', 'faster-whisper'],
                model: 'faster-whisper-small',
                promptChars: 0,
                responseChars: transcription.text.length,
                latencyMs: 0, // Would need to track this
                extra: {
                    confidence: transcription.confidence,
                    language: transcription.language,
                    audioSize: req.file.size
                }
            });

            // Step 2: Process with Chat
            console.log('[VoiceGateway] Processing with chat...');
            const chatResponse = await axios.post(chatEndpoint, {
                message: transcription.text,
                user: user,
                context: 'voice-interaction',
                sessionId: `voice-${user}-${Date.now()}`
            }, {
                timeout: 30000
            });

            const chatData = chatResponse.data;
            if (!chatData.success) {
                return res.status(500).json({
                    success: false,
                    error: 'Chat processing failed',
                    transcription: transcription
                });
            }

            const replyText = chatData.data?.reply;
            if (!replyText) {
                return res.status(500).json({
                    success: false,
                    error: 'No reply from chat',
                    transcription: transcription
                });
            }

            console.log(`[VoiceGateway] Chat reply: "${replyText}"`);

            // Step 3: Text-to-Speech
            console.log('[VoiceGateway] Converting text to speech...');
            const ttsResponse = await axios.post(`${ttsUrl}/tts`, {
                text: replyText,
                voice: 'pt_BR' // Try Portuguese first
            }, {
                responseType: 'arraybuffer',
                timeout: 30000
            });

            const audioBuffer = Buffer.from(ttsResponse.data);

            // Log TTS usage
            await appendAiUsageLog({
                timestamp: new Date().toISOString(),
                source: 'voice:tts',
                tags: ['voice', 'tts', 'piper'],
                model: 'piper-pt-br',
                promptChars: replyText.length,
                responseChars: 0,
                latencyMs: 0, // Would need to track this
                extra: {
                    audioSize: audioBuffer.length,
                    textLength: replyText.length
                }
            });

            console.log(`[VoiceGateway] Generated audio: ${audioBuffer.length} bytes`);

            // Clean up uploaded file
            try {
                fs.unlinkSync(audioPath);
            } catch (err) {
                console.warn('[VoiceGateway] Failed to clean up temp file:', err);
            }

            // Return audio response
            res.set({
                'Content-Type': 'audio/wav',
                'Content-Length': audioBuffer.length,
                'X-Transcription': encodeURIComponent(transcription.text),
                'X-Reply-Text': encodeURIComponent(replyText),
                'X-STT-Confidence': transcription.confidence
            });

            res.send(audioBuffer);

        } catch (error: any) {
            console.error('[VoiceGateway] Pipeline error:', error);

            // Clean up file on error
            if (req.file?.path) {
                try {
                    fs.unlinkSync(req.file.path);
                } catch {}
            }

            res.status(500).json({
                success: false,
                error: error.message,
                details: error.response?.data
            });
        }
    });

    /**
     * POST /api/voice/stt-only
     * Only perform speech-to-text conversion
     */
    router.post('/stt-only', upload.single('audio'), async (req: any, res: any) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No audio file provided' });
            }

            const audioPath = req.file.path;

            console.log(`[VoiceGateway] STT-only for: ${req.file.originalname}`);

            const sttForm = createFormData(audioPath, req.file.mimetype, req.file.originalname);
            const sttResponse = await axios.post(`${sttUrl}/stt`, sttForm, {
                headers: sttForm.getHeaders(),
                timeout: 30000
            });

            // Clean up
            try {
                fs.unlinkSync(audioPath);
            } catch {}

            res.json({
                success: true,
                data: sttResponse.data
            });

        } catch (error: any) {
            console.error('[VoiceGateway] STT error:', error);

            if (req.file?.path) {
                try {
                    fs.unlinkSync(req.file.path);
                } catch {}
            }

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /api/voice/tts-only
     * Only perform text-to-speech conversion
     */
    router.post('/tts-only', async (req: any, res: any) => {
        try {
            const { text, voice } = req.body;

            if (!text || typeof text !== 'string') {
                return res.status(400).json({ success: false, error: 'Text is required' });
            }

            console.log(`[VoiceGateway] TTS-only for: "${text.substring(0, 50)}..."`);

            const ttsResponse = await axios.post(`${ttsUrl}/tts`, {
                text: text,
                voice: voice || 'pt_BR'
            }, {
                responseType: 'arraybuffer',
                timeout: 30000
            });

            const audioBuffer = Buffer.from(ttsResponse.data);

            res.set({
                'Content-Type': 'audio/wav',
                'Content-Length': audioBuffer.length
            });

            res.send(audioBuffer);

        } catch (error: any) {
            console.error('[VoiceGateway] TTS error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * GET /api/voice/status
     * Check status of voice services
     */
    router.get('/status', async (req: any, res: any) => {
        try {
            const wakewordUrl = WAKEWORD_URL;
            const [sttStatus, ttsStatus, wakewordStatus] = await Promise.allSettled([
                axios.get(`${sttUrl}/health`, { timeout: 5000 }),
                axios.get(`${ttsUrl}/health`, { timeout: 5000 }),
                axios.get(`${wakewordUrl}/health`, { timeout: 5000 })
            ]);

            res.json({
                success: true,
                data: {
                    stt: sttStatus.status === 'fulfilled' ? sttStatus.value.data : { status: 'unavailable' },
                    tts: ttsStatus.status === 'fulfilled' ? ttsStatus.value.data : { status: 'unavailable' },
                    wakeword: wakewordStatus.status === 'fulfilled' ? wakewordStatus.value.data : { status: 'unavailable' },
                    gateway: {
                        status: 'healthy',
                        sttUrl,
                        ttsUrl,
                        wakewordUrl,
                        chatEndpoint
                    }
                }
            });

        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    /**
     * POST /api/voice/detect-wakeword
     * Send audio chunk and check for wake word activation
     */
    router.post('/detect-wakeword', upload.single('audio'), async (req: any, res: any) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No audio file provided' });
            }

            const audioPath = req.file.path;
            const wakewordUrl = WAKEWORD_URL;

            console.log(`[VoiceGateway] Checking wake word in: ${req.file.originalname}`);

            const wakeForm = createFormData(audioPath, req.file.mimetype, req.file.originalname);
            const response = await axios.post(`${wakewordUrl}/detect`, wakeForm, {
                headers: wakeForm.getHeaders(),
                timeout: 10000
            });

            // Clean up
            try {
                fs.unlinkSync(audioPath);
            } catch {}

            res.json({
                success: true,
                data: response.data
            });
        } catch (error: any) {
            console.error('[VoiceGateway] Wake word detection error:', error);

            if (req.file?.path) {
                try { fs.unlinkSync(req.file.path); } catch {}
            }

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    return router;
};

const createFormData = (filePath: string, mimetype: string, originalFilename?: string) => {
    const form = new FormData();
    const filename = originalFilename || 'audio.wav';
    form.append('audio', fs.createReadStream(filePath), {
        contentType: mimetype,
        filename: filename
    });
    return form;
};