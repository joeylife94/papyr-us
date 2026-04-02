// Layer 1 Unit test setup — ensure no database or deployment env vars bleed in
process.env.NODE_ENV = 'test';
delete (process.env as any).DATABASE_URL;
delete (process.env as any).RENDER;
delete (process.env as any).CI;
