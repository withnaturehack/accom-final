import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function buildConnectionString(): string {
  if (process.env.SUPABASE_DATABASE_URL && process.env.SUPABASE_DATABASE_URL.startsWith("postgresql://")) {
    return process.env.SUPABASE_DATABASE_URL;
  }
  if (process.env.NEON_DB_PASSWORD) {
    const pass = encodeURIComponent(process.env.NEON_DB_PASSWORD);
    return `postgresql://neondb_owner:${pass}@ep-little-haze-ant4ajfa-pooler.c-6.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`;
  }
  if (process.env.NEON_DATABASE_URL && process.env.NEON_DATABASE_URL.startsWith("postgresql://")) {
    return process.env.NEON_DATABASE_URL;
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL (or SUPABASE_DATABASE_URL) must be set. Did you forget to provision a database?");
  }
  return process.env.DATABASE_URL;
}

const connectionString = buildConnectionString();
const useInsecureSsl = process.env.PGSSL_INSECURE === "true";

export const pool = new Pool({
  connectionString,
  ...(useInsecureSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  max: 10,
  min: 0,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
  allowExitOnIdle: true,
});

pool.on("error", (err) => {
  console.error("[DB] Pool error:", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
