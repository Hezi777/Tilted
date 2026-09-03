/**
 * Device identity. Spec section 4 / 5.3 / 10: a random id generated once per browser
 * and kept in `localStorage` permanently — never cleared when a game ends. This is the
 * entire identity model, no accounts, no login.
 *
 * Safe to import from anywhere, including a server component: nothing here touches
 * `window` at module scope. Only calling `getDeviceId` on the server throws.
 */

const STORAGE_KEY = "tilted:device-id";

/**
 * Returns this browser's persistent device id, creating and storing one on first
 * call. Must only be called client-side.
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") {
    throw new Error("getDeviceId() can only be called in the browser");
  }
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const created = crypto.randomUUID();
  window.localStorage.setItem(STORAGE_KEY, created);
  return created;
}
