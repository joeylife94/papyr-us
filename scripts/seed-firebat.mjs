import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
const name = process.env.FIREBAT_SEED_ADMIN_NAME?.trim();
const email = process.env.FIREBAT_SEED_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.FIREBAT_SEED_ADMIN_PASSWORD;

if (!name && !email && !password) {
  console.log('[SKIP] Firebat admin seed is not configured');
  process.exit(0);
}

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}
if (!name || !email || !password) {
  throw new Error(
    'FIREBAT_SEED_ADMIN_NAME, FIREBAT_SEED_ADMIN_EMAIL, and FIREBAT_SEED_ADMIN_PASSWORD must be set together'
  );
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error('FIREBAT_SEED_ADMIN_EMAIL is invalid');
}
if (
  password.length < 12 ||
  !/[a-zA-Z]/.test(password) ||
  !/[0-9]/.test(password) ||
  !/[!@#$%^&*(),.?":{}|<>]/.test(password)
) {
  throw new Error(
    'FIREBAT_SEED_ADMIN_PASSWORD must be at least 12 characters and include a letter, number, and special character'
  );
}

const adminEmails = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
if (!adminEmails.includes(email)) {
  throw new Error('FIREBAT_SEED_ADMIN_EMAIL must also be listed in ADMIN_EMAILS');
}

const pool = new Pool({ connectionString: databaseUrl });
try {
  const existing = await pool.query('SELECT id FROM users WHERE lower(email) = $1 LIMIT 1', [email]);
  if (existing.rowCount > 0) {
    console.log(`[SKIP] Firebat admin already exists: ${email}`);
    process.exitCode = 0;
  } else {
    const hashedPassword = await bcrypt.hash(password, 12);
    const inserted = await pool.query(
      `INSERT INTO users (name, email, hashed_password, provider)
       VALUES ($1, $2, $3, 'local')
       RETURNING id`,
      [name, email, hashedPassword]
    );
    console.log(`[PASS] Firebat admin created: ${email} (id=${inserted.rows[0].id})`);
  }
} finally {
  await pool.end();
}
