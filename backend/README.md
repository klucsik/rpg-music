# RPG Music Streaming - Backend

Self-hosted synchronized music streaming server for RPG gaming sessions.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Start the server:**
   ```bash
   # Development mode (with auto-reload)
   npm run dev
   
   # Production mode
   npm start
   ```

## API Endpoints

### System
- `GET /` - Server info
- `GET /api/health` - Health check
- `GET /api/config` - System configuration
- `GET /api/stats` - System statistics

### Tracks (Coming in Session 2)
- `GET /api/tracks` - List all tracks
- `GET /api/tracks/:id` - Get track details
- `GET /audio/:id` - Stream audio file

### Folders (Coming in Session 2)
- `GET /api/folders` - List all folders
- `POST /api/folders` - Create folder
- `GET /api/folders/:id/tracks` - Get tracks in folder

## Database

SQLite database located at `./data/rpg-music.db` (configurable via `DATABASE_PATH`).

Schema includes:
- `tracks` - Music file metadata
- `folders` - Organization folders
- `track_folders` - Many-to-many relationships

## Development

```bash
# Watch mode (auto-reload on changes)
npm run dev

# Check logs
tail -f logs/app.log
```

## Testing

```bash
# Health check
curl http://localhost:3000/api/health

# System stats
curl http://localhost:3000/api/stats
```

## Session Progress

### ✅ Session 1: Complete
- [x] Project structure created
- [x] Dependencies installed
- [x] Configuration system
- [x] Logger setup
- [x] Database schema and utilities
- [x] Basic Express server
- [x] Health check endpoint
- [x] Error handling

### ✅ Session 2: Complete
- [x] File system scanner with recursive scanning
- [x] Metadata extraction (ID3 tags)
- [x] Track API endpoints
- [x] Audio streaming with Range request support
- [x] Scanner API endpoints
- [x] Automatic scan on startup

### ✅ Session 3: Complete
- [x] Socket.io WebSocket server
- [x] Session state management
- [x] Sync controller with playback commands
- [x] Playback REST API
- [x] Position checking and drift correction
- [x] Time synchronization
- [x] Browser test client

**Next:** Session 4 - Frontend UI Development
