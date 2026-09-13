// Building the query needs a Drizzle client, which throws on import if DATABASE_URL is
// unset (src/db/index.ts) -- this test never opens a connection (only `.toSQL()`), so a
// placeholder is enough. Left untouched if a real one is already set. See
// src/db/history-queries.test.ts for the same pattern.
process.env.DATABASE_URL ??= "postgresql://user:pass@example.invalid/db";

import { describe, expect, it } from "vitest";
import { buildPendingInvitesQuery } from "@/db/roster-queries";

describe("buildPendingInvitesQuery", () => {
  it("scopes to this Person's own unclaimed seats in active games", () => {
    const { sql, params } = buildPendingInvitesQuery("person-1").toSQL();
    expect(sql).toContain('"players"."person_id" = $2');
    expect(sql).toContain('"players"."device_id" is null');
    expect(sql).toContain('"players"."deleted_at" is null');
    expect(sql).toContain('"games"."status" = $3');
    expect(params).toEqual([true, "person-1", "active"]);
  });

  it("joins the game's undeleted host for the invite's host name", () => {
    const { sql } = buildPendingInvitesQuery("person-1").toSQL();
    expect(sql).toContain('"host"."is_host" = $1');
    expect(sql).toContain('"host"."deleted_at" is null');
  });

  it("counts every live seat at the table, including the invitee's own", () => {
    const { sql } = buildPendingInvitesQuery("person-1").toSQL();
    expect(sql).toContain("count(distinct");
    expect(sql).toContain('"seated"."deleted_at" is null');
  });
});
