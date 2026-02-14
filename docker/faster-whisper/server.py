#!/usr/bin/env python3
"""
Faster-Whisper HTTP Server
Provides a simple HTTP API for speech-to-text using Faster-Whisper.
"""

import os
import tempfile
import logging
from flask import Flask, request, jsonify
from werkzeug.utils import secure_filename
from faster_whisper import WhisperModel
import io
import numpy as np
from pydub import AudioSegment

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Configuration
UPLOAD_FOLDER = '/tmp/uploads'
ALLOWED_EXTENSIONS = {'wav', 'mp3', 'flac', 'm4a', 'ogg', 'webm'}
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB

# Whisper model - lazy loading
model = None
MODEL_SIZE = os.getenv('WHISPER_MODEL', 'small')  # tiny, base, small, medium, large
LANGUAGE = os.getenv('WHISPER_LANGUAGE', 'pt')  # Portuguese

def get_model():
    """Lazy load the Whisper model."""
    global model
    if model is None:
        logger.info(f"Loading Whisper model: {MODEL_SIZE}")
        model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")
        logger.info("Model loaded successfully")
    return model

def allowed_file(filename):
    """Check if file extension is allowed."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def convert_audio_to_wav(audio_data, original_format):
    """Convert audio data to WAV format using pydub."""
    try:
        # Create AudioSegment from bytes
        if original_format.lower() in ['mp3', 'wav', 'flac', 'm4a', 'ogg', 'webm']:
            audio = AudioSegment.from_file(io.BytesIO(audio_data), format=original_format)
        else:
            # Try to detect format automatically
            audio = AudioSegment.from_file(io.BytesIO(audio_data))

        # Convert to mono, 16kHz WAV (optimal for Whisper)
        audio = audio.set_channels(1).set_frame_rate(16000)

        # Export as WAV
        wav_buffer = io.BytesIO()
        audio.export(wav_buffer, format='wav')
        return wav_buffer.getvalue()

    except Exception as e:
        logger.error(f"Audio conversion failed: {e}")
        raise

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "service": "faster-whisper",
        "model": MODEL_SIZE,
        "language": LANGUAGE
    })

@app.route('/status', methods=['GET'])
def status():
    """Status endpoint for compatibility."""
    return health()

@app.route('/models', methods=['GET'])
def list_models():
    """List available model sizes."""
    return jsonify({
        "available_models": ["tiny", "base", "small", "medium", "large"],
        "current_model": MODEL_SIZE
    })

@app.route('/stt', methods=['POST'])
def speech_to_text():
    """
    Convert speech to text.

    Accepts:
    - Multipart form data with 'audio' file
    - JSON with base64 encoded audio (future)

    Returns:
    {
        "text": "transcribed text",
        "language": "pt",
        "confidence": 0.95
    }
    """
    try:
        # Check if audio file was uploaded
        if 'audio' not in request.files:
            return jsonify({"error": "No audio file provided"}), 400

        file = request.files['audio']
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400

        if not allowed_file(file.filename):
            return jsonify({"error": "File type not allowed"}), 400

        # Read file data
        audio_data = file.read()
        if len(audio_data) > MAX_FILE_SIZE:
            return jsonify({"error": "File too large"}), 413

        # Get file extension
        filename = secure_filename(file.filename)
        file_ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else 'wav'

        logger.info(f"Processing audio file: {filename} ({len(audio_data)} bytes)")

        # Convert audio to WAV if needed
        if file_ext != 'wav':
            try:
                audio_data = convert_audio_to_wav(audio_data, file_ext)
                logger.info("Audio converted to WAV")
            except Exception as e:
                logger.warning(f"Audio conversion failed, trying original: {e}")

        # Save to temporary file for Whisper
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_file:
            temp_file.write(audio_data)
            temp_path = temp_file.name

        try:
            # Load model
            whisper_model = get_model()

            # Transcribe
            logger.info("Starting transcription...")
            segments, info = whisper_model.transcribe(
                temp_path,
                language=LANGUAGE,
                beam_size=5,
                patience=1,
                vad_filter=True,  # Voice activity detection
                vad_parameters=dict(threshold=0.5, min_speech_duration_ms=250)
            )

            # Collect all text segments
            text_segments = []
            confidence_scores = []

            for segment in segments:
                text_segments.append(segment.text)
                # Calculate confidence (Whisper doesn't provide per-segment confidence easily)
                # Using a simple heuristic based on segment length and repetition
                confidence = min(1.0, len(segment.text.strip()) / 100.0)  # Rough confidence
                confidence_scores.append(confidence)

            full_text = ' '.join(text_segments).strip()

            if not full_text:
                return jsonify({"error": "No speech detected"}), 400

            # Average confidence
            avg_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0.5

            logger.info(f"Transcription complete: {len(full_text)} chars, confidence: {avg_confidence:.2f}")

            return jsonify({
                "text": full_text,
                "language": info.language,
                "confidence": round(avg_confidence, 2),
                "segments": len(text_segments)
            })

        finally:
            # Clean up temp file
            try:
                os.unlink(temp_path)
            except:
                pass

    except Exception as e:
        logger.error(f"STT error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/stt/stream', methods=['POST'])
def speech_to_text_stream():
    """
    Streaming STT endpoint for real-time transcription.
    For now, just processes the complete audio like regular STT.
    Future: Implement WebSocket for true streaming.
    """
    return speech_to_text()

if __name__ == '__main__':
    # Create upload folder
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)

    logger.info(f"Starting Faster-Whisper server on port 8501")
    logger.info(f"Model: {MODEL_SIZE}, Language: {LANGUAGE}")
    app.run(host='0.0.0.0', port=8501, debug=False, threaded=True)