"use client";

/**
 * Who this viewer is (build plan M10).
 *
 * This used to be a Person id the browser chose for itself and kept in localStorage.
 * Identity now comes from the signed-in account, resolved on the server and handed down
 * through ViewerProvider, so the client can no longer claim to be someone else. The
 * hook keeps its old shape on purpose — every call site that asked "who am I?" still
 * asks it the same way.
 *
 * The legacy `players.device_id` column now stores the server-derived Person id as an
 * actor key. The browser's random device id is not an identity or authorization input.
 */

import { useViewer } from "@/components/ViewerProvider";

export interface StoredIdentity {
  id: string;
  name: string;
}

/**
 * The signed-in Person, or null when there is none. Never `undefined` now: the server
 * resolved this before the first paint, so there is no "not yet known" state to guard.
 */
export function useIdentity(): StoredIdentity | null {
  const viewer = useViewer();
  return viewer ? { id: viewer.id, name: viewer.name } : null;
}
