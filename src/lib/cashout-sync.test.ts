import { describe, expect, it } from "vitest";
import { mergeCashoutPlayers } from "@/lib/cashout-sync";

interface Row {
  id: string;
  cashOut: number | null;
}

describe("mergeCashoutPlayers", () => {
  it("takes the server's value for a player nobody is editing", () => {
    const server: Row[] = [{ id: "a", cashOut: 500 }];
    const local: Row[] = [{ id: "a", cashOut: 100 }];
    expect(mergeCashoutPlayers(server, local, new Set())).toEqual([
      { id: "a", cashOut: 500 },
    ]);
  });

  it("keeps this client's local value for a player mid-edit, not the server's stale one", () => {
    const server: Row[] = [{ id: "a", cashOut: null }];
    const local: Row[] = [{ id: "a", cashOut: 240 }];
    expect(mergeCashoutPlayers(server, local, new Set(["a"]))).toEqual([
      { id: "a", cashOut: 240 },
    ]);
  });

  it("mixes: other players sync while the one being edited stays local", () => {
    const server: Row[] = [
      { id: "a", cashOut: 500 },
      { id: "b", cashOut: 300 },
    ];
    const local: Row[] = [
      { id: "a", cashOut: 500 },
      { id: "b", cashOut: 999 },
    ];
    expect(mergeCashoutPlayers(server, local, new Set(["b"]))).toEqual([
      { id: "a", cashOut: 500 },
      { id: "b", cashOut: 999 },
    ]);
  });

  it("falls back to the server row if the editing id has no local counterpart", () => {
    const server: Row[] = [{ id: "a", cashOut: 500 }];
    expect(mergeCashoutPlayers(server, [], new Set(["a"]))).toEqual([
      { id: "a", cashOut: 500 },
    ]);
  });

  it("is a no-op copy when nobody is editing", () => {
    const server: Row[] = [{ id: "a", cashOut: 500 }];
    const merged = mergeCashoutPlayers(server, [], new Set());
    expect(merged).toEqual(server);
    expect(merged).not.toBe(server);
  });
});
