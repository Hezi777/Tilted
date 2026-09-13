"use client";

import { useEffect } from "react";

/**
 * Registers `public/sw.js` once, app-wide -- so a push can arrive (and, on iOS, so the
 * app is even installable) before anyone has visited the profile screen. Registering
 * the worker is not the same as asking for notification permission: that stays a tap
 * in the profile screen, never something that happens on mount.
 */
export function PushServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Push only works over https, or on localhost during development.
    const secure =
      window.location.protocol === "https:" || window.location.hostname === "localhost";
    if (!secure) return;

    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("service worker registration failed", error);
    });
  }, []);

  return null;
}
