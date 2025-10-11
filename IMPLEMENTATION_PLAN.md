# RPG Music Streaming - Implementation Plan

**Project:** Self-hosted synchronized music streaming for RPG gaming sessions  
**Created:** October 11, 2025  
**Target Users:** 1-20 concurrent users  
**Upload Bandwidth:** 31 Mbps available  

## Project Overview

### Core Requirements
- ✅ Server-side audio streaming to all clients
- ✅ Synchronized playback across all connected clients (±10 second tolerance)
- ✅ Music organization with folders (many-to-many relationship)
- ✅ Read-only file system access
- ✅ No user authentication (shared session for all users)
- ✅ Kubernetes deployment

### Technical Decisions
- **Architecture:** Server-side streaming with WebSocket coordination
- **Sync Tolerance:** ±10 seconds (prevents jarring skips)
- **Audio Format:** MP3 @ 256 kbps (5.12 Mbps for 20 users)
- **Backend:** Node.js + Express + Socket.io
- **Database:** SQLite for metadata
- **Frontend:** Simple SPA (Vue.js or Svelte)
- **Deployment:** Kubernetes with persistent volumes

---

## Architecture

### Component Overview
```
┌─────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                    │
│                                                           │
│  ┌──────────────────────────────────────────────────┐  │
│  │              Ingress Controller                   │  │
│  └────────────────┬─────────────────────────────────┘  │
│                   │                                      │
│  ┌────────────────▼─────────────────────────────────┐  │
│  │         RPG Music Service                         │  │
│  │  ┌─────────────────────────────────────────────┐ │  │
│  │  │  Backend (Node.js)                          │ │  │
│  │  │  • Express HTTP/Streaming Server            │ │  │
│  │  │  • Socket.io WebSocket Hub                  │ │  │
│  │  │  • SQLite Database                          │ │  │
│  │  └─────────────────────────────────────────────┘ │  │
│  │  ┌─────────────────────────────────────────────┐ │  │
│  │  │  Frontend (Static Files)                    │ │  │
│  │  │  • SPA with audio player                    │ │  │
│  │  │  • Socket.io client                         │ │  │
│  │  └─────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────┘  │
│                   │                                      │
│  ┌────────────────▼─────────────────────────────────┐  │
│  │    Persistent Volume (Music Files - Read Only)   │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │    Persistent Volume (SQLite Database)           │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Data Flow
1. **Track Selection:** Admin selects track via web UI
2. **Broadcast Command:** Server sends WebSocket message to all clients
3. **Stream Audio:** Clients request audio stream from server
4. **Sync Playback:** Clients start playback at scheduled time
5. **Drift Check:** Periodic position checks (every 60s), only correct if drift > 10s

---

## Database Schema

### Tables

```sql
-- Music tracks
CREATE TABLE tracks (
    id TEXT PRIMARY KEY,           -- UUID
    filepath TEXT NOT NULL UNIQUE, -- Relative path from music root
    filename TEXT NOT NULL,
    title TEXT,
    artist TEXT,
    album TEXT,
    duration REAL,                 -- Duration in seconds
    format TEXT,                   -- mp3, flac, ogg, etc.
    bitrate INTEGER,               -- kbps
    sample_rate INTEGER,           -- Hz
    file_size INTEGER,             -- bytes
    created_at INTEGER NOT NULL,   -- Unix timestamp
    updated_at INTEGER NOT NULL
);

-- Folders for organization
CREATE TABLE folders (
    id TEXT PRIMARY KEY,           -- UUID
    name TEXT NOT NULL,
    parent_id TEXT,                -- NULL for root folders
    sort_order INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
);

-- Many-to-many relationship
CREATE TABLE track_folders (
    track_id TEXT NOT NULL,
    folder_id TEXT NOT NULL,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (track_id, folder_id),
    FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_tracks_filepath ON tracks(filepath);
CREATE INDEX idx_tracks_title ON tracks(title);
CREATE INDEX idx_folders_parent ON folders(parent_id);
CREATE INDEX idx_track_folders_folder ON track_folders(folder_id);
```

---

## API Specification

### REST API

#### Tracks
- `GET /api/tracks` - List all tracks (with pagination)
  - Query params: `page`, `limit`, `search`, `folder_id`
- `GET /api/tracks/:id` - Get track details
- `GET /api/tracks/:id/metadata` - Get full metadata

#### Folders
- `GET /api/folders` - List all folders (tree structure)
- `GET /api/folders/:id` - Get folder details
- `GET /api/folders/:id/tracks` - Get tracks in folder
- `POST /api/folders` - Create folder
- `PUT /api/folders/:id` - Update folder
- `DELETE /api/folders/:id` - Delete folder

#### Track-Folder Management
- `POST /api/tracks/:trackId/folders/:folderId` - Add track to folder
- `DELETE /api/tracks/:trackId/folders/:folderId` - Remove track from folder

#### Audio Streaming
- `GET /audio/:trackId` - Stream audio file
  - Supports HTTP Range requests
  - Content-Type based on file format

#### System
- `GET /api/health` - Health check
- `POST /api/scan` - Trigger file system scan
- `GET /api/scan/status` - Get scan progress

### WebSocket Events

#### Server → Client

```javascript
// Play a track
{
  event: 'play_track',
  data: {
    trackId: 'uuid',
    streamUrl: '/audio/uuid',
    title: 'Track Name',
    artist: 'Artist Name',
    duration: 240.5,
    startPosition: 0,           // seconds
    scheduledStartTime: 1728640000000, // Unix ms
    serverTimestamp: 1728640000000
  }
}

// Pause playback
{
  event: 'pause',
  data: {
    position: 45.2,
    serverTimestamp: 1728640045200
  }
}

// Resume playback
{
  event: 'resume',
  data: {
    position: 45.2,
    scheduledStartTime: 1728640047000,
    serverTimestamp: 1728640045000
  }
}

// Seek to position
{
  event: 'seek',
  data: {
    position: 120.0,
    scheduledStartTime: 1728640120000,
    serverTimestamp: 1728640118000
  }
}

// Stop playback
{
  event: 'stop',
  data: {
    serverTimestamp: 1728640200000
  }
}

// Position check (drift correction)
{
  event: 'position_check',
  data: {
    expectedPosition: 87.5,
    maxDrift: 10.0,          // Only correct if drift > this
    serverTimestamp: 1728640087500
  }
}

// Volume sync (optional feature)
{
  event: 'volume_change',
  data: {
    volume: 0.7              // 0.0 to 1.0
  }
}
```

#### Client → Server

```javascript
// Client connected
{
  event: 'client_connected',
  data: {
    clientId: 'uuid',
    userAgent: 'Mozilla/5.0...'
  }
}

// Request current state (for reconnections)
{
  event: 'request_state',
  data: {
    clientId: 'uuid'
  }
}

// Report position (for monitoring/debugging)
{
  event: 'position_report',
  data: {
    clientId: 'uuid',
    trackId: 'uuid',
    position: 87.3,
    state: 'playing',        // playing, paused, stopped
    clientTimestamp: 1728640087300
  }
}

// Client error report
{
  event: 'client_error',
  data: {
    clientId: 'uuid',
    error: 'Failed to load audio',
    trackId: 'uuid'
  }
}
```

---

## Implementation Phases

### Phase 1: Core Backend (Week 1, Sessions 1-3)

**Goal:** Basic server with streaming and WebSocket sync

#### Session 1: Project Setup & Basic Server
- [ ] Initialize Node.js project
- [ ] Set up project structure
- [ ] Install dependencies (Express, Socket.io, better-sqlite3)
- [ ] Create basic Express server
- [ ] Implement health check endpoint
- [ ] Create SQLite database with schema
- [ ] Write database migration script

**Deliverables:**
- `package.json` with dependencies
- `src/server.js` - Main server entry point
- `src/db/schema.sql` - Database schema
- `src/db/database.js` - Database connection and utilities
- Basic server running on port 3000

#### Session 2: Audio Streaming
- [ ] Implement file system scanner
- [ ] Populate database with track metadata
- [ ] Create audio streaming endpoint with Range support
- [ ] Add track metadata extraction (using music-metadata)
- [ ] Test streaming with multiple clients

**Deliverables:**
- `src/scanner/fileScanner.js` - File system scanner
- `src/scanner/metadataExtractor.js` - Extract ID3 tags
- `src/routes/audio.js` - Audio streaming endpoint
- `src/routes/tracks.js` - Track API endpoints

#### Session 3: WebSocket Sync System
- [ ] Set up Socket.io server
- [ ] Implement playback control commands
- [ ] Create sync protocol handlers
- [ ] Add session state management
- [ ] Test synchronization with multiple clients

**Deliverables:**
- `src/websocket/socketServer.js` - WebSocket setup
- `src/websocket/syncController.js` - Playback control
- `src/websocket/sessionState.js` - Track current state

### Phase 2: Frontend (Week 2, Sessions 4-6)

**Goal:** Functional web UI with synchronized playback

#### Session 4: Basic UI & Audio Player
- [ ] Set up frontend build system (Vite + Vue/Svelte)
- [ ] Create basic HTML5 audio player component
- [ ] Implement WebSocket client connection
- [ ] Add playback controls UI
- [ ] Display current track information

**Deliverables:**
- `frontend/src/App.vue` - Main app component
- `frontend/src/components/AudioPlayer.vue` - Audio player
- `frontend/src/services/websocket.js` - WebSocket client
- `frontend/src/services/audio.js` - Audio control logic

#### Session 5: Sync Logic & Time Management
- [ ] Implement server time synchronization
- [ ] Create scheduled playback logic
- [ ] Add drift detection and correction
- [ ] Handle reconnection gracefully
- [ ] Add buffer status indicators

**Deliverables:**
- `frontend/src/services/syncService.js` - Time sync logic
- `frontend/src/services/playbackController.js` - Playback scheduling
- Enhanced audio player with sync capabilities

#### Session 6: Track & Folder Browser
- [ ] Create folder tree navigation component
- [ ] Implement track list view
- [ ] Add search functionality
- [ ] Create "Now Playing" display
- [ ] Add basic styling

**Deliverables:**
- `frontend/src/components/FolderTree.vue` - Folder navigation
- `frontend/src/components/TrackList.vue` - Track listing
- `frontend/src/components/SearchBar.vue` - Search interface
- `frontend/src/services/api.js` - REST API client

### Phase 3: Organization Features (Week 3, Sessions 7-8)

**Goal:** Full folder management and organization

#### Session 7: Folder Management
- [ ] Implement folder CRUD operations (backend)
- [ ] Create folder management UI
- [ ] Add drag-and-drop for tracks
- [ ] Implement multi-folder assignment
- [ ] Add folder sorting

**Deliverables:**
- `src/routes/folders.js` - Folder API endpoints
- `frontend/src/components/FolderManager.vue` - Folder management UI
- Drag-and-drop functionality

#### Session 8: Admin Controls
- [ ] Create admin control panel
- [ ] Add queue/playlist management
- [ ] Implement volume synchronization
- [ ] Add skip/next/previous functionality
- [ ] Create session statistics view

**Deliverables:**
- `frontend/src/components/AdminPanel.vue` - Admin controls
- `src/websocket/adminController.js` - Admin command handlers
- Session statistics and monitoring

### Phase 4: Kubernetes Deployment (Week 4, Sessions 9-10)

**Goal:** Production-ready Kubernetes deployment

#### Session 9: Docker & Build Process
- [ ] Create Dockerfile for Node.js app
- [ ] Set up multi-stage build
- [ ] Configure production build for frontend
- [ ] Create docker-compose for local testing
- [ ] Test containerized application

**Deliverables:**
- `Dockerfile` - Multi-stage container build
- `docker-compose.yml` - Local testing setup
- `.dockerignore` - Build optimization
- Build scripts in `package.json`

#### Session 10: Kubernetes Manifests
- [ ] Create Deployment manifest
- [ ] Create Service manifest (ClusterIP + LoadBalancer)
- [ ] Create Ingress manifest
- [ ] Set up PersistentVolume for music files
- [ ] Set up PersistentVolumeClaim for database
- [ ] Create ConfigMap for environment variables
- [ ] Add health checks and resource limits

**Deliverables:**
- `k8s/deployment.yaml` - Application deployment
- `k8s/service.yaml` - Service configuration
- `k8s/ingress.yaml` - Ingress rules
- `k8s/pvc-music.yaml` - Music files volume
- `k8s/pvc-database.yaml` - Database volume
- `k8s/configmap.yaml` - Configuration
- `README.md` - Deployment instructions

### Phase 5: Polish & Testing (Week 5, Sessions 11-12)

**Goal:** Production-ready application

#### Session 11: Error Handling & Resilience
- [ ] Add comprehensive error handling
- [ ] Implement automatic reconnection
- [ ] Add logging and monitoring
- [ ] Handle edge cases (missing files, corrupted audio)
- [ ] Add graceful degradation

#### Session 12: Testing & Documentation
- [ ] Write unit tests for backend
- [ ] Write integration tests
- [ ] Load testing with multiple clients
- [ ] Complete API documentation
- [ ] Write user guide

---

## Technology Stack

### Backend
- **Runtime:** Node.js 20+ LTS
- **Framework:** Express.js 4.x
- **WebSocket:** Socket.io 4.x
- **Database:** better-sqlite3 (SQLite)
- **Metadata:** music-metadata (ID3 tag extraction)
- **Utilities:** 
  - uuid (ID generation)
  - dotenv (configuration)
  - pino (logging)

### Frontend
- **Framework:** Vue.js 3.x or Svelte 4.x
- **Build Tool:** Vite
- **HTTP Client:** axios or fetch
- **WebSocket Client:** socket.io-client
- **UI Components:** Native HTML5 audio
- **Styling:** Tailwind CSS or plain CSS

### DevOps
- **Containerization:** Docker
- **Orchestration:** Kubernetes
- **Reverse Proxy:** Ingress NGINX
- **Monitoring:** (Optional) Prometheus + Grafana

---

## File Structure

```
rpg-music/
├── backend/
│   ├── src/
│   │   ├── server.js              # Main entry point
│   │   ├── config/
│   │   │   └── config.js          # Configuration management
│   │   ├── db/
│   │   │   ├── database.js        # Database connection
│   │   │   ├── schema.sql         # SQL schema
│   │   │   └── migrations/        # Database migrations
│   │   ├── routes/
│   │   │   ├── tracks.js          # Track endpoints
│   │   │   ├── folders.js         # Folder endpoints
│   │   │   ├── audio.js           # Audio streaming
│   │   │   └── system.js          # System endpoints
│   │   ├── websocket/
│   │   │   ├── socketServer.js    # WebSocket setup
│   │   │   ├── syncController.js  # Sync logic
│   │   │   ├── sessionState.js    # State management
│   │   │   └── adminController.js # Admin commands
│   │   ├── scanner/
│   │   │   ├── fileScanner.js     # File system scanner
│   │   │   └── metadataExtractor.js
│   │   └── utils/
│   │       ├── logger.js          # Logging utility
│   │       └── timeSync.js        # Time sync helpers
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.vue                # Main app
│   │   ├── main.js                # Entry point
│   │   ├── components/
│   │   │   ├── AudioPlayer.vue    # Audio player
│   │   │   ├── FolderTree.vue     # Folder navigation
│   │   │   ├── TrackList.vue      # Track listing
│   │   │   ├── SearchBar.vue      # Search
│   │   │   ├── AdminPanel.vue     # Admin controls
│   │   │   └── NowPlaying.vue     # Current track
│   │   ├── services/
│   │   │   ├── api.js             # REST API client
│   │   │   ├── websocket.js       # WebSocket client
│   │   │   ├── syncService.js     # Time sync
│   │   │   └── playbackController.js
│   │   └── styles/
│   │       └── main.css
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
├── k8s/
│   ├── deployment.yaml            # K8s deployment
│   ├── service.yaml               # K8s service
│   ├── ingress.yaml               # Ingress rules
│   ├── pvc-music.yaml             # Music volume
│   ├── pvc-database.yaml          # Database volume
│   └── configmap.yaml             # Configuration
├── Dockerfile                     # Container build
├── docker-compose.yml             # Local testing
├── .dockerignore
├── .gitignore
├── IMPLEMENTATION_PLAN.md         # This file
└── README.md                      # Project documentation
```

---

## Configuration

### Environment Variables

```bash
# Server
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Paths
MUSIC_DIR=/music
DATABASE_PATH=/data/rpg-music.db

# Audio
DEFAULT_BITRATE=256
MAX_DRIFT_SECONDS=10
POSITION_CHECK_INTERVAL=60000  # ms

# WebSocket
WS_PING_INTERVAL=25000         # ms
WS_PING_TIMEOUT=60000          # ms

# Scanning
SCAN_ON_STARTUP=true
WATCH_FILE_CHANGES=false       # Keep false for read-only

# Logging
LOG_LEVEL=info
```

---

## Deployment Instructions

### Prerequisites
- Kubernetes cluster (1.25+)
- kubectl configured
- Persistent storage available
- Music files accessible (NFS, hostPath, or cloud storage)

### Steps

1. **Prepare Music Files Volume**
   ```bash
   # Create PV/PVC for music files (adjust based on your storage)
   kubectl apply -f k8s/pvc-music.yaml
   ```

2. **Deploy Database Volume**
   ```bash
   kubectl apply -f k8s/pvc-database.yaml
   ```

3. **Deploy Application**
   ```bash
   kubectl apply -f k8s/configmap.yaml
   kubectl apply -f k8s/deployment.yaml
   kubectl apply -f k8s/service.yaml
   kubectl apply -f k8s/ingress.yaml
   ```

4. **Initial Setup**
   ```bash
   # Trigger file system scan
   curl -X POST http://your-domain.com/api/scan
   ```

5. **Access Application**
   ```
   http://your-domain.com
   ```

---

## Testing Strategy

### Manual Testing Checklist
- [ ] Single client playback
- [ ] Multiple clients (2-5) sync accuracy
- [ ] Stress test with 20 concurrent clients
- [ ] Network interruption recovery
- [ ] Browser tab visibility changes
- [ ] Mobile device compatibility
- [ ] Different audio formats (MP3, FLAC, OGG)
- [ ] Large file library (1000+ tracks)
- [ ] Folder organization with many-to-many relationships
- [ ] Admin controls work for all clients

### Performance Metrics
- **Sync Accuracy:** ±2-5 seconds typical, ±10 seconds max
- **Audio Latency:** < 5 seconds to start playback
- **CPU Usage:** < 50% at 20 concurrent users
- **Memory Usage:** < 512 MB
- **Network Bandwidth:** ~5-6 Mbps at 20 users (256 kbps audio)

---

## Known Limitations & Future Enhancements

### Current Limitations
- No user authentication/authorization
- No playback history
- No favorites/ratings
- Manual file system scanning (no auto-watch)
- Single concurrent session (all users in sync)

### Future Enhancements (Post-MVP)
- [ ] Multiple independent rooms/sessions
- [ ] Playback history and statistics
- [ ] Playlist creation and sharing
- [ ] Audio effects/EQ synchronization
- [ ] Mobile app (React Native)
- [ ] Spotify/YouTube integration
- [ ] Advanced search (by mood, BPM, etc.)
- [ ] Auto-tagging with AI
- [ ] Cross-fade between tracks
- [ ] Volume ducking for voice chat integration

---

## Troubleshooting Guide

### Common Issues

**Issue:** Audio won't play
- Check browser autoplay policy (need user interaction)
- Verify audio file format is supported
- Check network connectivity
- Inspect browser console for errors

**Issue:** Clients out of sync
- Check client/server time offset
- Verify network latency (< 500ms recommended)
- Ensure drift correction is working
- Check if clients have sufficient buffer

**Issue:** High bandwidth usage
- Verify audio bitrate configuration
- Check for unnecessary re-buffering
- Monitor network quality
- Consider reducing bitrate

**Issue:** Database errors
- Check SQLite file permissions
- Verify persistent volume is mounted
- Check disk space
- Review database logs

---

## Session Notes

### Session Progress Tracker

- [ ] **Session 1:** Project setup & basic server
- [ ] **Session 2:** Audio streaming
- [ ] **Session 3:** WebSocket sync
- [ ] **Session 4:** Basic UI & player
- [ ] **Session 5:** Sync logic
- [ ] **Session 6:** Track browser
- [ ] **Session 7:** Folder management
- [ ] **Session 8:** Admin controls
- [ ] **Session 9:** Docker build
- [ ] **Session 10:** Kubernetes deployment
- [ ] **Session 11:** Error handling
- [ ] **Session 12:** Testing & docs

### Notes Section
(Add notes after each session to track decisions, blockers, and next steps)

---

**Last Updated:** October 11, 2025  
**Status:** Planning Complete - Ready for Implementation  
**Next Session:** Session 1 - Project Setup & Basic Server
