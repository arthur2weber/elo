#!/usr/bin/env python3
"""
OpenWakeWord HTTP/WebSocket Server
Provides wake word detection with HTTP API and WebSocket streaming.
"""

import os
import asyncio
import logging
import numpy as np
from flask import Flask, request, jsonify
import threading
import queue
from openwakeword import Model
import websockets
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Audio configuration (removed pyaudio dependency)
CHUNK = 1280  # 80ms at 16kHz
CHANNELS = 1
RATE = 16000

# Wake word model
model = None
wake_words = ["hey_jarvis", "alexa", "computer"]  # Default wake words

# Audio queue for WebSocket processing
audio_queue = queue.Queue()

def initialize_model():
    """Initialize the OpenWakeWord model."""
    global model
    if model is None:
        logger.info("Initializing OpenWakeWord model...")
        model = Model(wakeword_models=wake_words, threshold=0.5)
        logger.info("Model initialized successfully")

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "service": "openwakeword",
        "wake_words": wake_words
    })

@app.route('/status', methods=['GET'])
def status():
    """Status endpoint for compatibility."""
    return health()

@app.route('/detect', methods=['POST'])
def detect_wake_word():
    """
    Detect wake word in uploaded audio file.

    Expected: multipart/form-data with 'audio' file
    """
    try:
        if 'audio' not in request.files:
            return jsonify({"error": "No audio file provided"}), 400

        file = request.files['audio']
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400

        # Read audio data
        audio_data = file.read()
        audio_array = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0

        # Initialize model if needed
        initialize_model()

        # Process audio
        prediction = model.predict(audio_array)

        # Check for wake word detection
        detected_words = []
        for wake_word in wake_words:
            if wake_word in prediction and prediction[wake_word] > 0.5:
                detected_words.append({
                    "word": wake_word,
                    "confidence": float(prediction[wake_word])
                })

        return jsonify({
            "detected": len(detected_words) > 0,
            "wake_words": detected_words,
            "all_predictions": {k: float(v) for k, v in prediction.items()}
        })

    except Exception as e:
        logger.error(f"Detection error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/wake-words', methods=['GET'])
def list_wake_words():
    """List available wake words."""
    return jsonify({"wake_words": wake_words})

@app.route('/wake-words', methods=['POST'])
def set_wake_words():
    """Set wake words to listen for."""
    try:
        data = request.get_json()
        if not data or 'wake_words' not in data:
            return jsonify({"error": "wake_words array required"}), 400

        global wake_words, model
        wake_words = data['wake_words']

        # Reinitialize model with new wake words
        model = None
        initialize_model()

        return jsonify({"status": "updated", "wake_words": wake_words})

    except Exception as e:
        logger.error(f"Set wake words error: {str(e)}")
        return jsonify({"error": str(e)}), 500

async def websocket_handler(websocket, path):
    """Handle WebSocket connections for real-time wake word detection."""
    logger.info("New WebSocket connection for wake word detection")

    try:
        # Initialize model for this connection
        initialize_model()

        # Audio buffer for continuous processing
        audio_buffer = np.array([], dtype=np.float32)

        async for message in websocket:
            try:
                # Parse audio data (expecting binary audio frames)
                if isinstance(message, bytes):
                    # Convert bytes to numpy array
                    audio_chunk = np.frombuffer(message, dtype=np.int16).astype(np.float32) / 32768.0

                    # Add to buffer
                    audio_buffer = np.concatenate([audio_buffer, audio_chunk])

                    # Keep only recent audio (last 5 seconds)
                    max_samples = RATE * 5
                    if len(audio_buffer) > max_samples:
                        audio_buffer = audio_buffer[-max_samples:]

                    # Process if we have enough audio
                    if len(audio_buffer) >= CHUNK:
                        # Process the most recent chunk
                        chunk_to_process = audio_buffer[-CHUNK:]

                        prediction = model.predict(chunk_to_process)

                        # Check for wake word detection
                        detected_words = []
                        for wake_word in wake_words:
                            if wake_word in prediction and prediction[wake_word] > 0.5:
                                detected_words.append({
                                    "word": wake_word,
                                    "confidence": float(prediction[wake_word]),
                                    "timestamp": asyncio.get_event_loop().time()
                                })

                        if detected_words:
                            # Send detection notification
                            await websocket.send(json.dumps({
                                "type": "wake_word_detected",
                                "data": detected_words
                            }))

                        # Send periodic status update
                        await websocket.send(json.dumps({
                            "type": "status",
                            "data": {
                                "buffer_size": len(audio_buffer),
                                "predictions": {k: float(v) for k, v in prediction.items()}
                            }
                        }))

            except Exception as e:
                logger.error(f"WebSocket message processing error: {str(e)}")
                await websocket.send(json.dumps({
                    "type": "error",
                    "data": str(e)
                }))

    except websockets.exceptions.ConnectionClosed:
        logger.info("WebSocket connection closed")
    except Exception as e:
        logger.error(f"WebSocket handler error: {str(e)}")

def start_websocket_server():
    """Start the WebSocket server in a separate thread."""
    def run_server():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        start_server = websockets.serve(websocket_handler, "0.0.0.0", 8504)
        loop.run_until_complete(start_server)
        logger.info("WebSocket server started on port 8504")
        loop.run_forever()

    thread = threading.Thread(target=run_server, daemon=True)
    thread.start()

if __name__ == '__main__':
    # Start WebSocket server in background
    start_websocket_server()

    logger.info("Starting OpenWakeWord server on port 8503")
    logger.info(f"Wake words: {wake_words}")
    app.run(host='0.0.0.0', port=8503, debug=False, threaded=True)