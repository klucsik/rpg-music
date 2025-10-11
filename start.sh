#!/bin/bash

# RPG Music Streaming Server - Startup Script
# This script builds the frontend and starts the unified server

set -e  # Exit on error

echo "🎵 RPG Music Streaming Server - Startup"
echo "========================================"
echo ""

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed"
    echo "   Please install Node.js 20+ or use nvm"
    exit 1
fi

# Check Node version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "⚠️  Warning: Node.js version $NODE_VERSION detected"
    echo "   Node.js 20+ is recommended. Trying to use nvm..."
    
    # Try to load nvm and use Node 22
    if [ -s "$HOME/.nvm/nvm.sh" ]; then
        source "$HOME/.nvm/nvm.sh"
        if nvm use 22 &> /dev/null; then
            echo "✅ Switched to Node.js 22 via nvm"
        elif nvm use 20 &> /dev/null; then
            echo "✅ Switched to Node.js 20 via nvm"
        else
            echo "❌ Could not switch to Node.js 20+. Please install it via nvm."
            exit 1
        fi
    fi
fi

echo "✅ Node.js $(node --version) detected"
echo ""

# Build frontend
echo "📦 Building frontend..."
cd frontend
npm run build
cd ..
echo "✅ Frontend built successfully"
echo ""

# Start backend server
echo "🚀 Starting server..."
echo ""
echo "   Server will be available at: http://localhost:3000"
echo "   Press Ctrl+C to stop the server"
echo ""
echo "========================================"
echo ""

cd backend
exec node src/server.js
