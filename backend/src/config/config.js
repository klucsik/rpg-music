import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = {
  // Server
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  
  // Paths
  musicDir: process.env.MUSIC_DIR || '/music',
  databasePath: process.env.DATABASE_PATH || join(__dirname, '../../data/rpg-music.db'),
  
  // Audio
  defaultBitrate: parseInt(process.env.DEFAULT_BITRATE || '256', 10),
  maxDriftSeconds: parseInt(process.env.MAX_DRIFT_SECONDS || '10', 10),
  positionCheckInterval: parseInt(process.env.POSITION_CHECK_INTERVAL || '3000', 10), // Check every 3 seconds for sync and autoplay
  
  // WebSocket
  wsPingInterval: parseInt(process.env.WS_PING_INTERVAL || '25000', 10),
  wsPingTimeout: parseInt(process.env.WS_PING_TIMEOUT || '60000', 10),
  
  // Scanning
  scanOnStartup: process.env.SCAN_ON_STARTUP === 'true',
  watchFileChanges: process.env.WATCH_FILE_CHANGES === 'true',
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
  
  // External Links
  addMusicUrl: process.env.ADD_MUSIC_URL || '',
  addMusicText: process.env.ADD_MUSIC_TEXT || 'Click "Continue" to open the music source in a new tab.',
  
  // Computed
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
};

export default config;
