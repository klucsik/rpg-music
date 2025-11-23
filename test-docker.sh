#!/bin/bash

# RPG Music Streaming Server - Docker Test Script
# Builds and runs the container with local folders mounted

set -e  # Exit on error

echo "🐳 RPG Music - Docker Test Script"
echo "=================================="
echo ""

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Configuration
IMAGE_NAME="registry.klucsik.hu/rpg-music"
TAG="test"
CONTAINER_NAME="rpg-music-test"
PORT="3000"

# Local directories to mount
MUSIC_DIR="$SCRIPT_DIR/backend/test-music"
DATA_DIR="$SCRIPT_DIR/backend/data"

# Ensure directories exist
mkdir -p "$MUSIC_DIR"
mkdir -p "$DATA_DIR"

echo "📦 Building Docker image: $IMAGE_NAME:$TAG"
docker build -t "$IMAGE_NAME:$TAG" .
echo "✅ Build complete"
echo ""

echo "🛑 Stopping and removing existing container (if any)..."
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true
echo ""

echo "🚀 Starting container: $CONTAINER_NAME"
echo "   Image: $IMAGE_NAME:$TAG"
echo "   Port: $PORT"
echo "   Music directory: $MUSIC_DIR"
echo "   Data directory: $DATA_DIR"
echo ""

docker run -d \
  --name "$CONTAINER_NAME" \
  -p "$PORT:3000" \
  -v "$MUSIC_DIR:/app/music" \
  -v "$DATA_DIR:/app/data" \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e MUSIC_DIR=/app/music \
  -e DATABASE_PATH=/app/data/rpg-music.db \
  -e LOG_LEVEL=info \
  -e SCAN_ON_STARTUP=true \
  -e WATCH_FILE_CHANGES=true \
  -e YTDLP_PATH=/usr/local/bin/yt-dlp \
  "$IMAGE_NAME:$TAG"

echo "✅ Container started successfully"
echo ""
echo "📊 Container status:"
docker ps --filter "name=$CONTAINER_NAME"
echo ""
echo "📝 Viewing logs (Ctrl+C to stop):"
echo "   Use 'docker logs -f $CONTAINER_NAME' to view logs later"
echo ""
echo "🌐 Server should be available at: http://localhost:$PORT"
echo ""
echo "🛠️  Useful commands:"
echo "   docker logs -f $CONTAINER_NAME     # Follow logs"
echo "   docker stop $CONTAINER_NAME        # Stop container"
echo "   docker exec -it $CONTAINER_NAME sh # Access container shell"
echo ""
echo "========================================"
echo ""

# Follow logs
docker logs -f "$CONTAINER_NAME"
