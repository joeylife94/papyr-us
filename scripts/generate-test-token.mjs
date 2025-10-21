import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-here-change-in-production';
const userId = process.argv[2] || 'test-user-1';
const email = process.argv[3] || 'test@example.com';

const token = jwt.sign(
  { id: userId, email },
  jwtSecret,
  { expiresIn: '24h' }
);

console.log('Generated JWT Token:');
console.log(token);
console.log('\nTo use this token with socket smoke test:');
console.log(`JWT_TOKEN="${token}" node server/tests/socket-smoke.mjs`);
