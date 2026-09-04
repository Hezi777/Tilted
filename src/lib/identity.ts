"use client";

/**
 * Who this browser is, as a Person. Sits beside the device id in `localStorage`:
 * the device id says which phone is writing, this says which friend is holding it.
 *
 * Declared once on the first visit (spec 5.2 — the host must say who they are before
 * opening a table, so they are seated first and marked host rather than guessed from
 * roster order). The name is stored alongside the id purely so the home screen can
 * name the current player without a round trip; the id is the identity.
 */

import { useSyncExternalStore } from "react";

const ID_KEY = "tilted:person-id";
const NAME_KEY = "tilted:person-name";

export interface StoredIdentity {
  id: string;
  name: string;
}

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Another tab of the same app switching identity.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

// useSyncExternalStore compares snapshots by identity, so the object has to be
// cached until the stored values actually change or every render loops.
let cachedKey: string | null = null;
let cachedIdentity: StoredIdentity | null = null;

function readSnapshot(): StoredIdentity | null {
  const id = window.localStorage.getItem(ID_KEY);
  const name = window.localStorage.getItem(NAME_KEY) ?? "";
  const key = id === null ? null : `${id} ${name}`;
  if (key !== cachedKey) {
    cachedKey = key;
    cachedIdentity = id === null ? null : { id, name };
  }
  return cachedIdentity;
}

/**
 * `undefined` while the server render and hydration are still in flight — there is
 * no localStorage on the server, and guessing paints the wrong screen for a frame.
 */
export function useIdentity(): StoredIdentity | null | undefined {
  return useSyncExternalStore(subscribe, readSnapshot, () => undefined);
}

export function setIdentity(identity: StoredIdentity): void {
  window.localStorage.setItem(ID_KEY, identity.id);
  window.localStorage.setItem(NAME_KEY, identity.name);
  emit();
}

export function clearIdentity(): void {
  window.localStorage.removeItem(ID_KEY);
  window.localStorage.removeItem(NAME_KEY);
  emit();
}
