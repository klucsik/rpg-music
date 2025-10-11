# Test Music Directory

Put your test MP3 files here for development and testing.

## Directory Structure

```
test-music/
├── ambient/          # Ambient/background music
├── battle/           # Combat/action music
└── tavern/           # Social/town music
```

## Supported Formats

- `.mp3` - MP3 audio
- `.flac` - FLAC lossless
- `.ogg` - Ogg Vorbis
- `.m4a` - AAC/M4A
- `.aac` - AAC
- `.wav` - WAV
- `.opus` - Opus

## Adding Test Files

1. Place your audio files in the appropriate subdirectories
2. The server will automatically scan this directory on startup (if `SCAN_ON_STARTUP=true`)
3. Or manually trigger a scan: `POST http://localhost:3000/api/scan`

## Example Files to Add

```bash
# Ambient sounds
test-music/ambient/forest_sounds.mp3
test-music/ambient/cave_drips.mp3

# Battle music
test-music/battle/epic_fight.mp3
test-music/battle/boss_battle.mp3

# Tavern music
test-music/tavern/medieval_lute.mp3
test-music/tavern/drinking_song.mp3
```

## Notes

- You can use any MP3 files you have
- The scanner will extract metadata (title, artist, album, duration) automatically
- Files are organized by folders which support many-to-many relationships in the database
