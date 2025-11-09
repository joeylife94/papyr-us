#!/usr/bin/env node
/**
 * Migration script: Hash all plaintext directory passwords using bcrypt
 *
 * This script:
 * 1. Finds all directories with plaintext passwords
 * 2. Hashes them using bcrypt (salt rounds: 10)
 * 3. Updates the database
 * 4. Sets password_is_hashed = true
 *
 * Run with: node scripts/migrate-directory-passwords.mjs
 */

import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

const { Pool } = pg;

// Load environment variables
dotenv.config();

/**
 * Detect if a string looks like a bcrypt hash
 */
function isBcryptHash(value) {
  if (!value || typeof value !== 'string') return false;
  return /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);
}

/**
 * Main migration function
 */
async function migrateDirectoryPasswords() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('🔍 Checking for directories with plaintext passwords...\n');

    // 1. Find all directories with passwords
    const { rows } = await pool.query(
      `SELECT id, name, password, password_is_hashed 
       FROM directories 
       WHERE password IS NOT NULL AND password != ''`
    );

    if (rows.length === 0) {
      console.log('✅ No directories with passwords found. Nothing to migrate.\n');
      return;
    }

    console.log(`Found ${rows.length} directories with passwords:\n`);

    let migratedCount = 0;
    let skippedCount = 0;

    // 2. Process each directory
    for (const dir of rows) {
      const { id, name, password, password_is_hashed } = dir;

      // Skip if already hashed
      if (password_is_hashed || isBcryptHash(password)) {
        console.log(`⏭️  Skipped "${name}" (already hashed)`);
        skippedCount++;

        // Update flag if not set
        if (!password_is_hashed) {
          await pool.query('UPDATE directories SET password_is_hashed = true WHERE id = $1', [id]);
        }
        continue;
      }

      // Hash the password
      console.log(`🔒 Hashing password for "${name}"...`);
      const hashedPassword = await bcrypt.hash(password, 10);

      // Update database
      await pool.query(
        'UPDATE directories SET password = $1, password_is_hashed = true WHERE id = $2',
        [hashedPassword, id]
      );

      console.log(`✅ Migrated "${name}"`);
      migratedCount++;
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`   - Migrated: ${migratedCount}`);
    console.log(`   - Skipped (already hashed): ${skippedCount}`);
    console.log(`   - Total: ${rows.length}\n`);

    console.log('✨ Migration completed successfully!\n');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
migrateDirectoryPasswords();
