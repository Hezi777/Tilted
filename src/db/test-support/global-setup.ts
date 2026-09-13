/**
 * Clears the integration branch once, before any test file runs. A no-op when no
 * branch is configured.
 */

import { hasIntegrationDb, resetDatabase } from "@/db/test-support/integration-db";

export default async function setup(): Promise<void> {
  if (!hasIntegrationDb) return;
  await resetDatabase();
}
