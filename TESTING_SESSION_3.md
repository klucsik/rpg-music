# Testing Session 3 - WebSocket Synchronization

## What's New

Session 3 adds **real-time WebSocket synchronization** for synchronized playback across all clients!

### New Features

✅ **WebSocket Server** (Socket.io)  
✅ **Session State Management** - Tracks playback state globally  
✅ **Sync Controller** - Manages playback commands  
✅ **Playback API** - REST endpoints for control  
✅ **Position Checking** - Periodic drift correction (every 60s)  
✅ **Time Synchronization** - Client/server time offset calculation  

## Testing the WebSocket Sync

### Method 1: Web Browser Test Client

**Open the test client:**
```
http://localhost:3000/test-client
```

The test client provides:
- Real-time WebSocket connection status
- Audio player with sync visualization
- Event log showing all sync messages
- Drift monitoring (expected vs actual position)

**To test multi-client sync:**
1. Open the test client in **2-3 browser windows**
2. Use the REST API (below) to control playback
3. Watch all clients sync in real-time!

### Method 2: REST API Control

Use curl or Postman to control playback:

#### Play a Track
```bash
TRACK_ID="827c7ad7-0e1f-43a4-a13f-522d4fb67db8"

curl -X POST http://localhost:3000/api/playback/play \
  -H "Content-Type: application/json" \
  -d "{\"trackId\": \"$TRACK_ID\", \"startPosition\": 0}"
```

#### Pause
```bash
curl -X POST http://localhost:3000/api/playback/pause
```

#### Resume
```bash
curl -X POST http://localhost:3000/api/playback/resume
```

#### Seek to Position
```bash
curl -X POST http://localhost:3000/api/playback/seek \
  -H "Content-Type: application/json" \
  -d '{"position": 60}'
```

#### Stop
```bash
curl -X POST http://localhost:3000/api/playback/stop
```

#### Set Volume
```bash
curl -X POST http://localhost:3000/api/playback/volume \
  -H "Content-Type: application/json" \
  -d '{"volume": 0.5}'
```

#### Get Current State
```bash
curl http://localhost:3000/api/playback/state | jq .
```

## WebSocket Events

### Server → Client Events

#### `play_track`
```javascript
{
  trackId: "uuid",
  streamUrl: "/audio/uuid",
  title: "Track Name",
  artist: "Artist Name",
  duration: 240.5,
  startPosition: 0,
  scheduledStartTime: 1728640000000,
  serverTimestamp: 1728640000000
}
```

#### `pause`
```javascript
{
  position: 45.2,
  serverTimestamp: 1728640045200
}
```

#### `resume`
```javascript
{
  position: 45.2,
  scheduledStartTime: 1728640047000,
  serverTimestamp: 1728640045000
}
```

#### `seek`
```javascript
{
  position: 120.0,
  scheduledStartTime: 1728640120000,
  serverTimestamp: 1728640118000
}
```

#### `stop`
```javascript
{
  serverTimestamp: 1728640200000
}
```

#### `position_check`
Sent every 60 seconds while playing:
```javascript
{
  expectedPosition: 87.5,
  maxDrift: 10.0,
  serverTimestamp: 1728640087500
}
```

#### `volume_change`
```javascript
{
  volume: 0.7,
  serverTimestamp: 1728640100000
}
```

#### `state_sync`
Sent when client connects or requests state:
```javascript
{
  currentTrack: { /* track object */ },
  playbackState: "playing",
  position: 45.2,
  lastUpdateTime: 1728640045000,
  volume: 0.7,
  serverTime: 1728640045000
}
```

### Client → Server Events

#### `request_state`
Request current playback state (no data)

#### `position_report` (optional)
```javascript
{
  clientId: "uuid",
  trackId: "uuid",
  position: 87.3,
  state: "playing",
  clientTimestamp: 1728640087300
}
```

#### `client_error`
```javascript
{
  clientId: "uuid",
  error: "Failed to load audio",
  trackId: "uuid"
}
```

## Testing Scenarios

### Scenario 1: Basic Playback
1. Open test client in browser
2. Play a track via REST API
3. Verify audio starts playing in client
4. Check event log for sync messages

### Scenario 2: Multi-Client Sync
1. Open test client in 3 browser windows
2. Play a track
3. Verify all clients start at the same time (±2 seconds)
4. Pause on one client's terminal
5. Verify all clients pause together

### Scenario 3: Seek Synchronization
1. Have multiple clients connected
2. Seek to different position via API
3. Verify all clients jump to new position

### Scenario 4: Drift Correction
1. Open test client
2. Play a track
3. Manually seek the audio player (not via API)
4. Wait for position check (60 seconds)
5. Verify drift correction occurs if > 10 seconds

### Scenario 5: Reconnection
1. Open test client
2. Play a track
3. Disable network briefly
4. Re-enable network
5. Verify client catches up to current position

## System Statistics

Check connected clients:
```bash
curl http://localhost:3000/api/stats | jq .
```

```json
{
  "tracks": { "total": 3 },
  "folders": { "total": 0 },
  "clients": { "connected": 2 },
  "timestamp": 1760207356472
}
```

Get detailed client info:
```bash
curl http://localhost:3000/api/clients | jq .
```

## Configuration

Sync behavior can be tuned via environment variables:

```bash
# Maximum allowed drift before correction (seconds)
MAX_DRIFT_SECONDS=10

# How often to check position (milliseconds)
POSITION_CHECK_INTERVAL=60000

# WebSocket ping/pong timeouts
WS_PING_INTERVAL=25000
WS_PING_TIMEOUT=60000
```

## Architecture Highlights

### Session State
- Single source of truth for playback state
- Tracks current track, position, playback state
- Auto-updates position for playing tracks

### Sync Controller
- Manages all playback commands
- Broadcasts to all connected clients
- Schedules playback with buffer time (1-2 seconds)
- Periodic position checks for drift correction

### Time Synchronization
- Server sends timestamps with all messages
- Clients calculate offset: `serverTime - clientTime`
- Scheduled events use server time + offset
- Achieves ±200-500ms accuracy typically

### Drift Tolerance
- 10-second tolerance prevents jarring skips
- Position checks every 60 seconds
- Only corrects if drift exceeds threshold
- Smooth playback maintained

## Next Steps

Once WebSocket sync is tested, we can move to:

**Session 4: Basic Frontend UI**
- Vue/Svelte SPA
- Track browser
- Integrated audio player
- Admin controls

**Current Status:** Session 3 Complete! 🎉
