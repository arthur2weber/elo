# Faster-Whisper STT Container for Brazilian Portuguese
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir \
    faster-whisper \
    flask \
    requests \
    pydub \
    numpy

# Create app directory
WORKDIR /app

# Download Portuguese model during build (optional, can be done at runtime)
# RUN python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')"

# Create HTTP API server
COPY docker/faster-whisper/server.py /app/server.py

EXPOSE 8501

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8501/health || exit 1

CMD ["python", "server.py"]