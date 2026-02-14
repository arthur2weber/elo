# OpenWakeWord Container for wake word detection
FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies (without pyaudio for now)
RUN pip install --no-cache-dir \
    openwakeword \
    flask \
    requests \
    numpy \
    websockets

# Create app directory
WORKDIR /app

# Create HTTP API server
COPY docker/openwakeword/server.py /app/server.py

EXPOSE 8503

CMD ["python", "server.py"]