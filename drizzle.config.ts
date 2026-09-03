import "dotenv/config";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next, so .env.local is not loaded for it automatically.
config({ path: ".env.local", quiet: true });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Migrations run over the direct (non-pooled) connection.
    url: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? "",
  },
});
