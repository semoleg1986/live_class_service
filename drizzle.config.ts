import type { Config } from 'drizzle-kit';

const connectionString =
  process.env.LIVE_CLASS_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/live_class_service';

export default {
  schema: './src/infrastructure/persistence/postgres/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: connectionString,
  },
  verbose: true,
  strict: true,
} satisfies Config;
