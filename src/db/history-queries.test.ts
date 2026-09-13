// Building the query needs a Drizzle client, which throws on import if DATABASE_URL is
// unset (src/db/index.ts) -- these tests never open a connection (only `.toSQL()`), so
// a placeholder is enough. Left untouched if a real one is already set.
process.env.DATABASE_URL ??= "postgresql://user:pass@example.invalid/db";

import { describe, expect, it } from "vitest";
import { buildHistoryListQuery, isHistoryStatus } from "@/db/history-queries";

describe("history status", () => {
  it("includes only closed games", () => {
    expect(isHistoryStatus("closed")).toBe(true);
    expect(isHistoryStatus("active")).toBe(false);
    expect(isHistoryStatus("settling")).toBe(false);
    expect(isHistoryStatus("cancelled")).toBe(false);
  });
});

/**
 * These inspect the compiled SQL rather than run it: the repo has no test database, so
 * every other `src/db/*.test.ts` tests pure logic only (see `streak-queries.test.ts`).
 * `.toSQL()` compiles a query without opening a connection, which lets the actual
 * search/filter query (`buildHistoryListQuery`) be asserted on directly instead of via
 * a hand-written duplicate of its logic.
 */
describe("buildHistoryListQuery", () => {
  it("scopes to closed games this person is seated in, with no filters", () => {
    const { sql, params } = buildHistoryListQuery("person-1").toSQL();
    expect(sql).toContain('"games"."status" = $1');
    expect(sql).toContain('"players"."person_id" = $2');
    expect(sql).toContain('"players"."deleted_at" is null');
    expect(params).toEqual(["closed", "person-1"]);
  });

  it("applies both range boundaries as inclusive, in Israel local time", () => {
    const { sql, params } = buildHistoryListQuery("person-1", {
      startDate: "2026-09-13",
      endDate: "2026-09-14",
    }).toSQL();
    // Inclusive on both ends: >= and <=, not > and <.
    expect(sql).toContain('AT TIME ZONE $3)::date >= $4::date');
    expect(sql).toContain('AT TIME ZONE $5)::date <= $6::date');
    expect(params).toEqual([
      "closed",
      "person-1",
      "Asia/Jerusalem",
      "2026-09-13",
      "Asia/Jerusalem",
      "2026-09-14",
    ]);
  });

  it("applies only the start boundary when there is no end date", () => {
    const { sql, params } = buildHistoryListQuery("person-1", {
      startDate: "2026-09-13",
    }).toSQL();
    expect(sql).toContain(">=");
    expect(sql).not.toContain("<=");
    expect(params).toEqual(["closed", "person-1", "Asia/Jerusalem", "2026-09-13"]);
  });

  it("filters to an exact location", () => {
    const { sql, params } = buildHistoryListQuery("person-1", {
      location: "הבית של עידו",
    }).toSQL();
    expect(sql).toContain('"games"."location" = $3');
    expect(params).toEqual(["closed", "person-1", "הבית של עידו"]);
  });

  it("searches game name, location, and seated player names together", () => {
    const { sql, params } = buildHistoryListQuery("person-1", {
      search: "רועי",
    }).toSQL();
    expect(sql).toContain('"games"."name" ilike');
    expect(sql).toContain('"games"."location" ilike');
    expect(sql).toContain('"players"."name" ilike');
    expect(params.slice(2)).toEqual(["%רועי%", "%רועי%", "%רועי%"]);
  });

  it("ignores a blank search string", () => {
    const { sql, params } = buildHistoryListQuery("person-1", { search: "   " }).toSQL();
    expect(sql).not.toContain("ilike");
    expect(params).toEqual(["closed", "person-1"]);
  });
});
