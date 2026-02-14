# Piper TTS Container for Brazilian Portuguese
FROM ubuntu:22.04

# Install dependencies
RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    python3 \
    python3-pip \
    build-essential \
    cmake \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies for the HTTP server
RUN pip3 install --no-cache-dir flask requests

# Download and setup Piper TTS
WORKDIR /app
RUN wget -q https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_amd64.tar.gz && \
    tar -xzf piper_amd64.tar.gz && \
    rm piper_amd64.tar.gz

# Download Brazilian Portuguese voice model
RUN mkdir -p /app/models && \
    cd /app/models && \
    wget -q https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx && \
    wget -q https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json

# Download Portuguese Brazilian voice (if available, otherwise fallback to Spanish or other)
RUN cd /app/models && \
    (wget -q https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx && \
     wget -q https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/pt/pt_BR/faber/medium/pt_BR-faber-medium.onnx.json) || \
    (wget -q https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_ES/mls/medium/es_ES-mls-medium.onnx && \
     wget -q https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_ES/mls/medium/es_ES-mls-medium.onnx.json) || \
    (wget -q https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/southern_english_female/medium/en_GB-southern_english_female-medium.onnx && \
     wget -q https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_GB/southern_english_female/medium/en_GB-southern_english_female-medium.onnx.json) || \
    echo "Using default English voice"

# Create HTTP API server
COPY docker/piper-tts/server.py /app/server.py

EXPOSE 8502

CMD ["python3", "server.py"]