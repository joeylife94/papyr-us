import 'dotenv/config';
import { DBStorage } from '../storage.js';
import { directories } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

function isBcryptHash(value: string): boolean {
  return typeof value === 'string' && /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);
}

async function run() {
  const storage = new DBStorage();
  console.log('[migrate] Scanning directories for plaintext passwords...');
  const rows = await storage.db.select().from(directories);
  let updated = 0;
  for (const row of rows) {
    if (row.password && !isBcryptHash(row.password)) {
      const hashed = await bcrypt.hash(row.password, 10);
      await storage.db
        .update(directories)
        .set({ password: hashed })
        .where(eq(directories.id, row.id));
      updated++;
      console.log(`[migrate] Updated directory id=${row.id}`);
    }
  }
  await storage.pool.end();
  console.log(`[migrate] Done. Updated ${updated} row(s).`);
}

run().catch((err) => {
  console.error('[migrate] Failed:', err);
  process.exit(1);
});
