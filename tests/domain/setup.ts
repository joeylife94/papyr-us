// Layer 2 Domain test setup — ensure test mode, no accidental DB access
process.env.NODE_ENV = 'test';
delete (process.env as any).DATABASE_URL;
