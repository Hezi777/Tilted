// Web push service worker. Plain JS, no build step -- Next never touches this file.
//
// Payload shape sent by src/lib/push.ts (built by src/lib/push-payload.ts):
//   { title, body, icon, url }

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
