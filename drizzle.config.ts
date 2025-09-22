import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables based on NODE_ENV
const envPath =
  process.env.NODE_ENV === 'test'
    ? path.resolve(process.cwd(), '.env.test')
    : path.resolve(process.cwd(), '.env');

dotenv.config({ path: envPath, override: true });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Please check your .env file.');
}

export default defineConfig({
  out: './migrations',
  schema: './shared/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
