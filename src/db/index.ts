/**
 * Neon serverless Drizzle client. Initialisation is lazy: importing this module must
 * not throw when DATABASE_URL is unset (e.g. `next build` in an environment with no
 * database yet) — the connection is only opened the first time a query actually runs.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";

let cached: NeonHttpDatabase<typeof schema> | undefined;

function getDb(): NeonHttpDatabase<typeof schema> {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Add it to .env.local (see .env.example).",
      );
    }
    cached = drizzle(neon(url), { schema });
  }
  return cached;
}

/** Proxy so `db.query...`/`db.select()...` resolve lazily on first use, not on import. */
export const db: NeonHttpDatabase<typeof schema> = new Proxy(
  {} as NeonHttpDatabase<typeof schema>,
  {
    get(_target, prop, receiver) {
      return Reflect.get(getDb(), prop, receiver);
    },
  },
);
