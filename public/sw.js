// Web push and offline shell service worker. Plain JS, no build step -- Next never
// touches this file.
//
// Payload shape sent by src/lib/push.ts (built by src/lib/push-payload.ts):
//   { title, body, icon, url }

/**
 * Offline behaviour, and the hard line it does not cross.
 *
 * The app is installed to a home screen and used in an apartment at 2am, so the
 * connection does drop -- and until now that replaced the ledger with the browser's
 * own error page, which reads as "your evening is gone" rather than "the wifi blinked".
 *
 * What is cached is deliberately narrow: committed art and Next's fingerprinted build
 * assets, both immutable, plus one static offline page. **No HTML response is ever
 * cached.** Every page in this app is server-rendered for a signed-in Person, so a
 * cached page is one player's numbers waiting to be served to whoever opens the app on
 * that phone next. A stale ledger is worse than no ledger.
 */
const CACHE = "tilted-shell-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/art/icon-192.png", "/art/logo.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      // A failed precache must not block activation -- push is the more important of
      // this worker's two jobs and it needs no cache at all.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function isImmutableAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/art/") || url.pathname.startsWith("/_next/static/"))
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // A navigation that cannot reach the network gets the offline page rather than the
  // browser's. Network-first and never cached: the real page is always preferred, and
  // an authenticated page must not be stored.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(OFFLINE_URL);
        return (
          cached ??
          new Response("אין חיבור לרשת", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }),
    );
    return;
  }

  // Fingerprinted and committed files only. Cache-first, because their URLs change
  // when their contents do, so a hit is never stale.
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }

  // Everything else -- every `/api/*` call included -- falls through to the network
  // untouched. The ledger is never answered from a cache.
});

self.addEventListener("push", (event) => {
  let payload = { title: "התראה", body: "", icon: "/art/icon-192.png", url: "/" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Not JSON -- fall back to the default payload above.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: "/art/icon-192.png",
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : "/";

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const absoluteUrl = new URL(url, self.location.origin).href;
      for (const client of clientsList) {
        if (client.url === absoluteUrl && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })(),
  );
});

// The push subscription was invalidated by the browser (key rotation, etc.) --
// resubscribe with the same VAPID key and tell the server about the new endpoint, or
// the old row prunes on its own next send and this device just stops getting pushed to.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const oldEndpoint = event.oldSubscription && event.oldSubscription.endpoint;
      const applicationServerKey =
        (event.oldSubscription && event.oldSubscription.options && event.oldSubscription.options.applicationServerKey) ||
        (event.newSubscription && event.newSubscription.options && event.newSubscription.options.applicationServerKey);

      const subscription =
        event.newSubscription ||
        (await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        }));

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: arrayBufferToBase64Url(subscription.getKey("p256dh")),
            auth: arrayBufferToBase64Url(subscription.getKey("auth")),
          },
        }),
      });

      if (oldEndpoint && oldEndpoint !== subscription.endpoint) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: oldEndpoint }),
        });
      }
    })(),
  );
});

function arrayBufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
