#!/usr/bin/env python3
"""
Piper TTS HTTP Server
Provides a simple HTTP API for text-to-speech using Piper.
"""

import os
import subprocess
import tempfile
import uuid
from flask import Flask, request, send_file, jsonify
from werkzeug.utils import secure_filename
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Piper executable path
PIPER_EXEC = "/app/piper/piper"

# Voice models directory
VOICES_DIR = "/app/models"

# Default voice model (fallback to English if PT-BR not available)
DEFAULT_VOICE_MODEL = None
DEFAULT_VOICE_CONFIG = None

def find_voice_models():
    """Find available voice models in the voices directory."""
    global DEFAULT_VOICE_MODEL, DEFAULT_VOICE_CONFIG

    # Look for Portuguese Brazilian first
    pt_br_model = os.path.join(VOICES_DIR, "pt_BR-model.onnx")
    pt_br_config = os.path.join(VOICES_DIR, "pt_BR-model.onnx.json")

    if os.path.exists(pt_br_model) and os.path.exists(pt_br_config):
        DEFAULT_VOICE_MODEL = pt_br_model
        DEFAULT_VOICE_CONFIG = pt_br_config
        logger.info("Found Portuguese Brazilian voice model")
        return

    # Look for Spanish (similar to Portuguese)
    es_model = os.path.join(VOICES_DIR, "es_ES-mls-medium.onnx")
    es_config = os.path.join(VOICES_DIR, "es_ES-mls-medium.onnx.json")

    if os.path.exists(es_model) and os.path.exists(es_config):
        DEFAULT_VOICE_MODEL = es_model
        DEFAULT_VOICE_CONFIG = es_config
        logger.info("Found Spanish voice model (fallback for Portuguese)")
        return

    # Fallback to English
    en_model = os.path.join(VOICES_DIR, "en_US-lessac-medium.onnx")
    en_config = os.path.join(VOICES_DIR, "en_US-lessac-medium.onnx.json")

    if os.path.exists(en_model) and os.path.exists(en_config):
        DEFAULT_VOICE_MODEL = en_model
        DEFAULT_VOICE_CONFIG = en_config
        logger.info("Found English voice model (fallback)")
        return

    logger.error("No voice models found!")

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({"status": "healthy", "service": "piper-tts"})

@app.route('/status', methods=['GET'])
def status():
    """Status endpoint for compatibility."""
    return health()

@app.route('/voices', methods=['GET'])
def list_voices():
    """List available voice models."""
    voices = []
    for file in os.listdir(VOICES_DIR):
        if file.endswith('.onnx'):
            voices.append(file.replace('.onnx', ''))
    return jsonify({"voices": voices})

@app.route('/tts', methods=['POST'])
def text_to_speech():
    """
    Convert text to speech.

    Expected JSON payload:
    {
        "text": "Texto para falar",
        "voice": "pt_BR-model"  // optional, defaults to available model
    }
    """
    try:
        data = request.get_json()
        if not data or 'text' not in data:
            return jsonify({"error": "Missing 'text' field"}), 400

        text = data['text'].strip()
        if not text:
            return jsonify({"error": "Empty text"}), 400

        # Limit text length
        if len(text) > 1000:
            text = text[:1000] + "..."

        voice = data.get('voice', 'default')

        # Use default model if voice not specified or not found
        model_path = DEFAULT_VOICE_MODEL
        config_path = DEFAULT_VOICE_CONFIG

        if not model_path or not config_path:
            return jsonify({"error": "No voice model available"}), 500

        # Create temporary output file
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_file:
            output_path = temp_file.name

        try:
            # Run Piper TTS
            logger.info(f"Converting text to speech: {text[:50]}...")

            # Create temporary text file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as text_file:
                text_file.write(text)
                text_file_path = text_file.name

            # Run Piper
            cmd = [
                PIPER_EXEC,
                "--model", model_path,
                "--config", config_path,
                "--output_file", output_path
            ]

            # Piper reads from stdin
            process = subprocess.run(
                cmd,
                input=text,
                text=True,
                capture_output=True,
                timeout=30
            )

            if process.returncode != 0:
                logger.error(f"Piper failed: {process.stderr.decode()}")
                return jsonify({"error": "TTS conversion failed"}), 500

            # Check if output file was created
            if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
                logger.error("Piper did not generate audio file")
                return jsonify({"error": "No audio generated"}), 500

            logger.info(f"Audio generated successfully: {os.path.getsize(output_path)} bytes")

            # Return the audio file
            return send_file(
                output_path,
                mimetype='audio/wav',
                as_attachment=True,
                download_name='speech.wav'
            )

        finally:
            # Clean up temporary files
            try:
                if os.path.exists(output_path):
                    os.unlink(output_path)
                if 'text_file_path' in locals() and os.path.exists(text_file_path):
                    os.unlink(text_file_path)
            except:
                pass

    except Exception as e:
        logger.error(f"TTS error: {str(e)}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    find_voice_models()
    logger.info(f"Starting Piper TTS server on port 8502")
    logger.info(f"Default voice model: {DEFAULT_VOICE_MODEL}")
    app.run(host='0.0.0.0', port=8502, debug=False)