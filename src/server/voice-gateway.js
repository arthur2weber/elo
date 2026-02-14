const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const VOICE_UPLOAD_DIR = path.join(process.cwd(), 'temp', 'voice');
const STT_URL = process.env.STT_URL || 'http://localhost:8501';
const TTS_URL = process.env.TTS_URL || 'http://localhost:8502';

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
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/flac', 'audio/webm', 'audio/ogg'];
        const allowedExtensions = ['.wav', '.mp3', '.flac', '.webm', '.ogg', '.m4a'];
        const fileExtension = path.extname(file.originalname).toLowerCase();
        
        if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only audio files are allowed.'));
        }
    }
});

const createVoiceGateway = (options = {}) => {
    const router = express.Router();
    const sttUrl = options.sttUrl || STT_URL;
    const ttsUrl = options.ttsUrl || TTS_URL;
    const chatEndpoint = options.chatEndpoint || 'http://localhost:3000/api/chat';

    /**
     * POST /api/voice/process
     * Process complete voice pipeline: audio → STT → chat → TTS → audio
     */
    router.post('/process', upload.single('audio'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No audio file provided' });
            }

            const audioPath = req.file.path;

            // Step 1: STT - Convert audio to text
            console.log('[Voice Gateway] Starting STT...');
            console.log(`[Voice Gateway] Audio file: ${req.file.originalname}, path: ${audioPath}`);
            const sttForm = new FormData();
            sttForm.append('audio', fs.createReadStream(audioPath), req.file.originalname || 'audio.wav');

            const sttResponse = await axios.post(`${sttUrl}/stt`, sttForm, {
                headers: sttForm.getHeaders(),
                timeout: 30000
            });

            const transcript = sttResponse.data.transcript || sttResponse.data.text;
            console.log(`[Voice Gateway] STT Result: "${transcript}"`);

            // Step 2: Chat - Process text with AI
            console.log('[Voice Gateway] Starting chat processing...');
            const chatResponse = await axios.post(chatEndpoint, {
                message: transcript,
                context: 'voice'
            }, {
                timeout: 30000
            });

            const aiResponse = chatResponse.data.response || chatResponse.data.message;
            console.log(`[Voice Gateway] AI Response: "${aiResponse}"`);

            // Step 3: TTS - Convert AI response to audio
            console.log('[Voice Gateway] Starting TTS...');
            const ttsResponse = await axios.post(`${ttsUrl}/tts`, {
                text: aiResponse,
                voice: 'pt_BR-faber-medium'
            }, {
                responseType: 'stream',
                timeout: 30000
            });

            // Clean up uploaded file
            fs.unlinkSync(audioPath);

            // Stream audio response back to client
            res.setHeader('Content-Type', 'audio/wav');
            res.setHeader('Content-Disposition', 'attachment; filename="response.wav"');
            ttsResponse.data.pipe(res);

        } catch (error) {
            console.error('[Voice Gateway] Process error:', error.message);

            // Clean up uploaded file if it exists
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            res.status(500).json({
                error: 'Voice processing failed',
                details: error.message
            });
        }
    });

    /**
     * POST /api/voice/stt-only
     * Speech-to-text only
     */
    router.post('/stt-only', upload.single('audio'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No audio file provided' });
            }

            const audioPath = req.file.path;

            console.log('[Voice Gateway] Starting STT-only...');
            console.log(`[Voice Gateway] Audio file: ${req.file.originalname}, path: ${audioPath}`);
            const sttForm = new FormData();
            sttForm.append('audio', fs.createReadStream(audioPath), req.file.originalname || 'audio.wav');

            const sttResponse = await axios.post(`${sttUrl}/stt`, sttForm, {
                headers: sttForm.getHeaders(),
                timeout: 30000
            });

            // Clean up uploaded file
            fs.unlinkSync(audioPath);

            res.json(sttResponse.data);

        } catch (error) {
            console.error('[Voice Gateway] STT-only error:', error.message);

            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            res.status(500).json({
                error: 'STT failed',
                details: error.message
            });
        }
    });

    /**
     * POST /api/voice/tts-only
     * Text-to-speech only
     */
    router.post('/tts-only', async (req, res) => {
        try {
            const { text, voice = 'pt_BR-faber-medium' } = req.body;

            if (!text) {
                return res.status(400).json({ error: 'No text provided' });
            }

            console.log(`[Voice Gateway] Starting TTS-only for: "${text}"`);
            const ttsResponse = await axios.post(`${ttsUrl}/tts`, {
                text,
                voice
            }, {
                responseType: 'stream',
                timeout: 30000
            });

            res.setHeader('Content-Type', 'audio/wav');
            res.setHeader('Content-Disposition', 'attachment; filename="tts.wav"');
            ttsResponse.data.pipe(res);

        } catch (error) {
            console.error('[Voice Gateway] TTS-only error:', error.message);
            res.status(500).json({
                error: 'TTS failed',
                details: error.message
            });
        }
    });

    /**
     * GET /api/voice/status
     * Voice gateway status
     */
    router.get('/status', async (req, res) => {
        try {
            // Check all voice services
            const services = {};

            try {
                const sttStatus = await axios.get(`${sttUrl}/status`, { timeout: 5000 });
                services.stt = sttStatus.data;
            } catch (e) {
                services.stt = { error: 'unavailable' };
            }

            try {
                const ttsStatus = await axios.get(`${ttsUrl}/status`, { timeout: 5000 });
                services.tts = ttsStatus.data;
            } catch (e) {
                services.tts = { error: 'unavailable' };
            }

            res.json({
                status: 'healthy',
                service: 'voice-gateway',
                services,
                endpoints: {
                    process: '/api/voice/process',
                    sttOnly: '/api/voice/stt-only',
                    ttsOnly: '/api/voice/tts-only'
                }
            });

        } catch (error) {
            res.status(500).json({
                status: 'error',
                service: 'voice-gateway',
                error: error.message
            });
        }
    });

    return router;
};

module.exports = { createVoiceGateway };