import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

function signature(gameId: string): Buffer {
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!secret) throw new Error("Missing NEON_AUTH_COOKIE_SECRET");
  return createHmac("sha256", secret).update(`tilted:instant-join:v1:${gameId}`).digest();
}

/** A host grants access to this game, never to a reusable four-character room code. */
export function createInstantJoinToken(gameId: string): string {
  return `${gameId}.${signature(gameId).toString("base64url")}`;
}

export function verifyInstantJoinToken(token: string): string | null {
  const [gameId, mac, extra] = token.split(".");
  if (extra !== undefined || !z.uuid().safeParse(gameId).success || !mac ||
    !/^[A-Za-z0-9_-]{43}$/.test(mac)) return null;
  const supplied = Buffer.from(mac, "base64url");
  const expected = signature(gameId);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
    ? gameId : null;
}
