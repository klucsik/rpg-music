# Testing Session 2 - Audio Streaming

## Setup Test Music Files

**Put your test MP3 files in:**
```
backend/test-music/
├── ambient/          # Add ambient music here
├── battle/           # Add battle music here
└── tavern/           # Add tavern music here
```

You can use any MP3 files you have available (music, podcasts, etc.).

## Starting the Server

```bash
cd backend
npm run dev
```

The server will automatically scan `./test-music/` on startup and populate the database.

## Testing the New Endpoints

### 1. Check Scan Status
```bash
curl http://localhost:3000/api/scan/status | jq .
```

### 2. Manually Trigger Scan
```bash
curl -X POST http://localhost:3000/api/scan | jq .
```

### 3. List All Tracks
```bash
curl http://localhost:3000/api/tracks | jq .
```

### 4. Search Tracks
```bash
curl "http://localhost:3000/api/tracks?search=battle" | jq .
```

### 5. Get Track Details
```bash
# Replace TRACK_ID with an actual track ID from the list
curl http://localhost:3000/api/tracks/TRACK_ID | jq .
```

### 6. Stream Audio
```bash
# Replace TRACK_ID with an actual track ID
curl http://localhost:3000/audio/TRACK_ID -o test.mp3

# Or open in browser:
# http://localhost:3000/audio/TRACK_ID
```

### 7. Test Range Requests (partial content)
```bash
# Request first 1MB
curl -H "Range: bytes=0-1048575" http://localhost:3000/audio/TRACK_ID -o chunk.mp3
```

## Expected Results

After starting the server with test files, you should see:
- Database populated with tracks
- Metadata extracted (title, artist, album, duration)
- Audio streaming working with Range support
- Search functionality working

## What's Implemented

✅ File system scanner with recursive directory scanning  
✅ Metadata extraction (ID3 tags, duration, bitrate)  
✅ Track API endpoints (list, search, get by ID)  
✅ Audio streaming with HTTP Range request support  
✅ Scanner API (trigger scan, check status)  
✅ Automatic scan on startup  

## Next Steps

Once you've tested audio streaming, we can move to **Session 3: WebSocket Sync** to add real-time synchronization between clients!
