/**
 * Migration Script: Convert existing data to unified collections system
 * 
 * This script:
 * 1. Creates backup of database
 * 2. Creates new track_collections and collection_tracks tables
 * 3. Migrates existing playlist data to 'current-playlist' collection
 * 4. Migrates existing folders to folder collections with proper hierarchy
 * 5. Migrates track_folders relationships to collection_tracks
 * 6. Keeps old tables intact for rollback capability
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/music.db');
const BACKUP_PATH = `${DB_PATH}.backup-${Date.now()}`;

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function createBackup() {
  log('\n📦 Creating database backup...', 'cyan');
  try {
    if (fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, BACKUP_PATH);
      log(`✓ Backup created: ${BACKUP_PATH}`, 'green');
      return true;
    } else {
      log('⚠ Database file not found, skipping backup', 'yellow');
      return true;
    }
  } catch (error) {
    log(`✗ Backup failed: ${error.message}`, 'red');
    return false;
  }
}

function runMigration() {
  log('\n🔄 Starting migration...', 'cyan');
  
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  try {
    // Read and execute new schema
    log('\n1️⃣  Creating new tables...', 'blue');
    const schemaSQL = fs.readFileSync(path.join(__dirname, 'schema-collections.sql'), 'utf8');
    db.exec(schemaSQL);
    log('✓ New tables created', 'green');

    // Migrate playlist
    log('\n2️⃣  Migrating playlist data...', 'blue');
    const playlistTracks = db.prepare('SELECT * FROM playlist ORDER BY position ASC').all();
    log(`   Found ${playlistTracks.length} tracks in playlist`, 'cyan');
    
    if (playlistTracks.length > 0) {
      const insertTrack = db.prepare(`
        INSERT INTO collection_tracks (collection_id, track_id, position, added_at)
        VALUES (?, ?, ?, ?)
      `);

      const migratePlaylist = db.transaction(() => {
        for (const track of playlistTracks) {
          insertTrack.run('current-playlist', track.track_id, track.position, track.added_at);
        }
      });

      migratePlaylist();
      log(`✓ Migrated ${playlistTracks.length} playlist tracks`, 'green');
    }

    // Migrate folders
    log('\n3️⃣  Migrating folders...', 'blue');
    const folders = db.prepare('SELECT * FROM folders ORDER BY sort_order ASC').all();
    log(`   Found ${folders.length} folders`, 'cyan');

    if (folders.length > 0) {
      const insertCollection = db.prepare(`
        INSERT INTO track_collections (id, name, type, parent_id, sort_order, is_ordered, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const migrateFolders = db.transaction(() => {
        for (const folder of folders) {
          const now = Math.floor(Date.now() / 1000);
          insertCollection.run(
            folder.id,
            folder.name,
            'folder',
            folder.parent_id,
            folder.sort_order,
            1, // folders are ordered
            folder.created_at,
            now
          );
        }
      });

      migrateFolders();
      log(`✓ Migrated ${folders.length} folders to collections`, 'green');
    }

    // Migrate track_folders relationships
    log('\n4️⃣  Migrating folder track relationships...', 'blue');
    const trackFolders = db.prepare('SELECT * FROM track_folders ORDER BY added_at ASC').all();
    log(`   Found ${trackFolders.length} track-folder relationships`, 'cyan');

    if (trackFolders.length > 0) {
      // Group by folder to assign positions
      const folderGroups = {};
      for (const tf of trackFolders) {
        if (!folderGroups[tf.folder_id]) {
          folderGroups[tf.folder_id] = [];
        }
        folderGroups[tf.folder_id].push(tf);
      }

      const insertRelation = db.prepare(`
        INSERT OR IGNORE INTO collection_tracks (collection_id, track_id, position, added_at)
        VALUES (?, ?, ?, ?)
      `);

      const migrateRelations = db.transaction(() => {
        for (const [folderId, tracks] of Object.entries(folderGroups)) {
          // Get track details to sort by title
          const tracksWithDetails = tracks.map(tf => {
            const track = db.prepare('SELECT title, artist FROM tracks WHERE id = ?').get(tf.track_id);
            return {
              ...tf,
              title: track?.title || '',
              artist: track?.artist || ''
            };
          });

          // Sort by title, then artist (matching current folder display)
          tracksWithDetails.sort((a, b) => {
            if (a.title !== b.title) {
              return a.title.localeCompare(b.title);
            }
            return a.artist.localeCompare(b.artist);
          });

          // Assign positions
          tracksWithDetails.forEach((tf, index) => {
            insertRelation.run(folderId, tf.track_id, index, tf.added_at);
          });
        }
      });

      migrateRelations();
      log(`✓ Migrated ${trackFolders.length} track-folder relationships`, 'green');
    }

    // Verify migration
    log('\n5️⃣  Verifying migration...', 'blue');
    const collectionCount = db.prepare('SELECT COUNT(*) as count FROM track_collections').get().count;
    const collectionTrackCount = db.prepare('SELECT COUNT(*) as count FROM collection_tracks').get().count;
    
    log(`   Collections created: ${collectionCount}`, 'cyan');
    log(`   Collection tracks: ${collectionTrackCount}`, 'cyan');
    log(`   Original playlist tracks: ${playlistTracks.length}`, 'cyan');
    log(`   Original track-folder relationships: ${trackFolders.length}`, 'cyan');

    const expectedTracks = playlistTracks.length + trackFolders.length;
    if (collectionTrackCount === expectedTracks) {
      log('✓ Track counts match!', 'green');
    } else {
      log(`⚠ Track count mismatch: expected ${expectedTracks}, got ${collectionTrackCount}`, 'yellow');
    }

    log('\n✨ Migration completed successfully!', 'green');
    log('\n📋 Summary:', 'cyan');
    log(`   • Backup: ${BACKUP_PATH}`, 'cyan');
    log(`   • Collections: ${collectionCount}`, 'cyan');
    log(`   • Collection tracks: ${collectionTrackCount}`, 'cyan');
    log(`   • Old tables preserved for rollback`, 'cyan');

    db.close();
    return true;

  } catch (error) {
    log(`\n✗ Migration failed: ${error.message}`, 'red');
    log(error.stack, 'red');
    db.close();
    
    // Offer rollback
    log('\n⚠ To rollback, restore the backup:', 'yellow');
    log(`   cp ${BACKUP_PATH} ${DB_PATH}`, 'yellow');
    return false;
  }
}

function verifyDatabase() {
  log('\n🔍 Verifying database integrity...', 'cyan');
  
  try {
    const db = new Database(DB_PATH);
    
    // Check if new tables exist
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name IN ('track_collections', 'collection_tracks')
    `).all();

    if (tables.length === 2) {
      log('✓ New tables exist', 'green');
    } else {
      log('✗ New tables missing', 'red');
      return false;
    }

    // Check special collections
    const library = db.prepare('SELECT * FROM track_collections WHERE id = ?').get('library');
    const playlist = db.prepare('SELECT * FROM track_collections WHERE id = ?').get('current-playlist');

    if (library && playlist) {
      log('✓ Special collections exist', 'green');
    } else {
      log('✗ Special collections missing', 'red');
      return false;
    }

    db.close();
    return true;

  } catch (error) {
    log(`✗ Verification failed: ${error.message}`, 'red');
    return false;
  }
}

// Main execution
function main() {
  log('\n' + '='.repeat(60), 'cyan');
  log('  COLLECTION MIGRATION SCRIPT', 'cyan');
  log('='.repeat(60), 'cyan');

  // Step 1: Create backup
  if (!createBackup()) {
    log('\n✗ Migration aborted due to backup failure', 'red');
    process.exit(1);
  }

  // Step 2: Run migration
  if (!runMigration()) {
    log('\n✗ Migration failed', 'red');
    process.exit(1);
  }

  // Step 3: Verify
  if (!verifyDatabase()) {
    log('\n✗ Verification failed', 'red');
    process.exit(1);
  }

  log('\n' + '='.repeat(60), 'green');
  log('  MIGRATION COMPLETE ✨', 'green');
  log('='.repeat(60), 'green');
  log('\nNext steps:', 'cyan');
  log('  1. Test the application with new collections API', 'cyan');
  log('  2. If everything works, old tables can be dropped', 'cyan');
  log('  3. Backup file can be deleted after verification', 'cyan');
  log('');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { createBackup, runMigration, verifyDatabase };
