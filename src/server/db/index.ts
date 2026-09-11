import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/env";
import * as schema from "./schema";

/**
 * Next.js dev mode re-evaluates modules on every hot reload, which would leak a
 * new connection pool each time. Cache the pool on `globalThis` so reloads reuse
 * one. In production the module is evaluated once and the cache is unused.
 */
const globalForDb = globalThis as unknown as { pool?: Pool };

const pool = globalForDb.pool ?? new Pool({ connectionString: env.DATABASE_URL });
if (env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema, casing: "snake_case" });

export type Db = typeof db;
export { schema };
