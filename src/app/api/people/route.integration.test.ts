/**
 * The regulars roster is the requester's own group, not the whole database.
 *
 * Whether a person is reachable is a property of the games both of them sat at, so
 * this runs against a real branch.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  hasIntegrationDb,
  seedActiveGame,
  type SeededGame,
} from "@/db/test-support/integration-db";

const { requireViewer } = vi.hoisted(() => ({ requireViewer: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireViewer }));

interface PersonRow {
  id: string;
}

describe.skipIf(!hasIntegrationDb)("GET /api/people", () => {
  let route: typeof import("./route");
  let game: SeededGame;
  let stranger: string;

  beforeAll(async () => {
    route = await import("./route");
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    game = await seedActiveGame(10_000);

    // Somebody with an account who has never sat at this table -- another household.
    const { db } = await import("@/db");
    const { people } = await import("@/db/schema");
    stranger = randomUUID();
    await db.insert(people).values({
      id: stranger,
      name: "זר",
      userId: `user_${stranger}`,
    });

    requireViewer.mockResolvedValue({
      userId: `user_${game.host.personId}`,
      person: { id: game.host.personId, name: "מארח", nickname: null },
    });
  });

  async function ids(): Promise<string[]> {
    const body = (await (await route.GET()).json()) as { people: PersonRow[] };
    return body.people.map((person) => person.id);
  }

  it("includes the requester and everyone they have played with", async () => {
    const listed = await ids();
    expect(listed).toContain(game.host.personId);
    expect(listed).toContain(game.guest.personId);
  });

  it("leaves out an account holder from another table", async () => {
    expect(await ids()).not.toContain(stranger);
  });

  it("returns just the requester when they have played with nobody", async () => {
    requireViewer.mockResolvedValue({
      userId: `user_${stranger}`,
      person: { id: stranger, name: "זר", nickname: null },
    });
    expect(await ids()).toEqual([stranger]);
  });
});
