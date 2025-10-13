# RPG Music Streaming - Quick Start Guide

## 🚀 Starting the Application

Simply run:
```bash
./start.sh
```

The server will:
1. Build the Vue.js frontend
2. Start the unified backend server
3. Be available at **http://localhost:3000**

## 🎮 Features Implemented

### Session 1-3: Backend Infrastructure ✅
- **Express.js Server** with HTTP Range request support for audio streaming
- **SQLite Database** with many-to-many folder organization
- **WebSocket Synchronization** using Socket.io for real-time playback sync
- **File Scanner** with metadata extraction (ID3 tags)
- **REST API** for tracks, playback control, and system status

### Session 4: Frontend UI ✅
- **Vue.js 3** single-page application
- **Unified Deployment** - Frontend and backend served from single server
- **Audio Player Component** with:
  - Real-time synchronization across all connected clients
  - Playback controls: Play/Pause, Stop, Next, Previous, Repeat
  - Volume control
  - Progress bar with seek functionality
  - Drift detection and auto-correction (10-second tolerance)
  - Connection status indicator
- **Track Library Browser** with:
  - Search functionality
  - Pagination
  - Click to play
- **Responsive Design** with dark theme optimized for RPG sessions

## 🎵 How to Use

### 1. Add Music Files
Place your audio files in:
```
backend/test-music/
```

Supported formats: MP3, FLAC, WAV, OGG, M4A, AAC

### 2. Access the Web Interface
Open **http://localhost:3000** in your browser

### 3. Play Music
- Click any track in the Music Library to start playback
- All connected clients will play the same track in sync

### 4. Control Playback
- **⏮️ Previous**: Play previous track in the list
- **▶️ Play / ⏸️ Pause**: Resume or pause playback (synced across all clients)
- **⏹️ Stop**: Stop playback and reset position
- **⏭️ Next**: Play next track in the list
- **🔁 Repeat**: Toggle repeat mode for current track

### 5. Multi-Client Synchronization
- Open multiple browser windows/tabs
- Controls from ANY client affect ALL clients
- Automatic drift correction keeps everyone in sync
- Position checks every 60 seconds

## 🔧 Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Browser Clients                    │
│  (Vue.js SPA with Audio Player + WebSocket Client)  │
└─────────────────────┬───────────────────────────────┘
                      │
                      │ HTTP + WebSocket
                      │
┌─────────────────────▼───────────────────────────────┐
│              Node.js Express Server                  │
│  ┌─────────────────────────────────────────────┐   │
│  │  Static Files (Vue.js build)                │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │  REST API (/api/*)                          │   │
│  │  - Tracks, Playback, System                 │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │  Audio Streaming (/audio/:id)               │   │
│  │  - HTTP Range requests for seeking          │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │  WebSocket Server (Socket.io)               │   │
│  │  - Real-time playback sync                  │   │
│  │  - Position checks & drift correction       │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
            ┌──────────────────┐
            │  SQLite Database │
            │  - Track metadata│
            │  - Folders       │
            └──────────────────┘
```

## 📋 API Endpoints

### System
- `GET /api/system/health` - Health check
- `GET /api/stats` - Server statistics
- `GET /api/clients` - Connected WebSocket clients

### Tracks
- `GET /api/tracks` - List all tracks (with pagination & search)
- `GET /api/tracks/:id` - Get track details

### Playback Control
- `POST /api/playback/play` - Play a track
- `POST /api/playback/pause` - Pause playback
- `POST /api/playback/resume` - Resume playback
- `POST /api/playback/stop` - Stop playback
- `POST /api/playback/seek` - Seek to position
- `POST /api/playback/volume` - Set volume
- `GET /api/playback/state` - Get current playback state

### Audio Streaming
- `GET /audio/:trackId` - Stream audio file (supports HTTP Range)

### Scanner
- `POST /api/scan` - Trigger library scan
- `GET /api/scan/status` - Get scan status

## 🔄 WebSocket Events

### Server → Client
- `play_track` - New track started
- `pause` - Playback paused
- `resume` - Playback resumed
- `stop` - Playback stopped
- `seek` - Seeked to new position
- `volume_change` - Volume changed
- `position_check` - Periodic sync check
- `state_sync` - Full state synchronization

### Client → Server
- `request_state` - Request current state
- `position_report` - Report client position (optional)
- `client_error` - Report playback error

## 🎯 Synchronization Strategy

1. **Server-Authoritative**: Server controls all playback timing
2. **Scheduled Playback**: 2-second buffer for network latency
3. **Time Sync**: Client-server time offset calculation
4. **Drift Tolerance**: 10 seconds before correction
5. **Position Checks**: Every 60 seconds
6. **Auto-Correction**: Automatic seek when drift exceeds threshold

## 📦 Project Structure

```
rpg-music/
├── start.sh                    # Startup script
├── backend/
│   ├── src/
│   │   ├── server.js          # Main Express server
│   │   ├── config/            # Configuration
│   │   ├── db/                # Database & schema
│   │   ├── routes/            # REST API routes
│   │   ├── scanner/           # File scanner & metadata
│   │   ├── websocket/         # WebSocket & sync logic
│   │   └── utils/             # Logger utilities
│   ├── public/                # Built frontend (auto-generated)
│   ├── data/                  # SQLite database
│   └── test-music/            # Music files directory
└── frontend/
    ├── src/
    │   ├── App.vue            # Main app component
    │   ├── components/
    │   │   ├── AudioPlayer.vue    # Synchronized audio player
    │   │   └── TrackList.vue      # Track browser
    │   └── services/
    │       ├── api.js             # REST API client
    │       └── websocket.js       # WebSocket client
    └── vite.config.js         # Build config (outputs to backend/public)
```

## 🐛 Troubleshooting

### Server won't start
- Ensure Node.js 20+ is installed: `node --version`
- Try: `cd backend && npm rebuild better-sqlite3`

### No tracks showing
- Add audio files to `backend/test-music/`
- Restart server (scans on startup)
- Or trigger manual scan: `curl -X POST http://localhost:3000/api/scan`

### Playback not syncing
- Check browser console for errors
- Ensure WebSocket is connected (green indicator in UI)
- Browser autoplay policy may require user interaction first

### Audio won't play on second client
- Click anywhere on the page to enable autoplay
- Check browser console for "Play failed" errors
- This is normal browser security behavior

## 🚀 Next Steps (Future Sessions)

- Session 5: User authentication & permissions
- Session 6: Playlist management
- Session 7: Folder organization UI
- Session 8: Advanced audio features (crossfade, EQ)
- Session 9: Mobile responsive design
- Session 10: Performance optimization
- Session 11: Docker containerization
- Session 12: Kubernetes deployment

## 📝 Notes

- **Bandwidth**: Current setup uses ~256kbps per client
- **Concurrent Users**: Tested with 1-20 clients
- **File Support**: Automatic metadata extraction from ID3 tags
- **Database**: SQLite (suitable for <10,000 tracks)
- **Security**: No authentication yet (local network use)

---

**Enjoy your synchronized RPG music streaming!** 🎵🎮
