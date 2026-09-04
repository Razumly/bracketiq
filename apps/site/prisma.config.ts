import dotenv from 'dotenv';
import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

dotenv.config({ path: '.env.local' });
dotenv.config();

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.e2e.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
