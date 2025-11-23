# MuzsikApp

A web-based music streaming application for managing and playing your personal music library for multiple clients.

## Features

- 🎵 Music library browser with search and sorting
- 📁 Folder-based organization
- 🎼 Playlist management
- 🔄 Real-time sync across multiple clients via WebSocket

## Tech Stack

- **Frontend**: Vue 3, Vite
- **Backend**: Node.js, Express
- **Database**: SQLite with better-sqlite3
- **Real-time**: Socket.io

## Quick Start

```bash
# Start the application
./start.sh
```

The application will be available at `http://localhost:3000`

## Development

```bash
# Frontend development
cd frontend
npm install
npm run dev

# Backend development
cd backend
npm install
npm start
```

Or you can use the provided `./start.sh` script to start both frontend and backend together.

## Project Structure

- `/frontend` - Vue.js frontend application
- `/backend` - Express.js API server
- `/k8s` - Kubernetes deployment manifests
