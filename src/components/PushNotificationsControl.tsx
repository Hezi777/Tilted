"use client";

/**
 * Turns web push on or off for this device, and the install hint that gets you there
 * on a platform where push cannot work in a browser tab. Lives in the profile screen
 * next to the other per-device preferences (haptics, reduce motion), but this one is
 * not a `people` column -- a subscription is per device, not per Person, so it talks
 * to `/api/push/subscribe` directly instead of going through a server action.
 *
 * Asking for permission only ever happens inside `enable`'s click handler -- never on
 * mount, never from an effect -- because browsers refuse (or silently no-op) a
 * permission request that was not triggered by a real user gesture.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  getInstallHint,
  getNotificationPermissionState,
  isIOSUserAgent,
  isStandaloneDisplay,
  type InstallHint,
  type NotificationPermissionState,
} from "@/lib/install-prompt";
import { urlBase64ToUint8Array } from "@/lib/push-client";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

async function postSubscription(subscription: PushSubscription): Promise<void> {
  const key = subscription.getKey("p256dh");
  const auth = subscription.getKey("auth");
  if (!key || !auth) throw new Error("מפתחות ההרשמה חסרים");
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: bufferToBase64Url(key),
        auth: bufferToBase64Url(auth),
      },
    }),
  });
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function readPermission(): NotificationPermissionState {
  const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  return getNotificationPermissionState({
    supported,
    permission: supported ? Notification.permission : undefined,
  });
}

function readInstallHint(): InstallHint {
  return getInstallHint({
    isIOS: isIOSUserAgent(navigator.userAgent),
    isStandalone: isStandaloneDisplay({
      navigatorStandalone: (navigator as { standalone?: boolean }).standalone,
      matchesStandaloneMediaQuery: window.matchMedia("(display-mode: standalone)").matches,
    }),
    canPromptInstall: false,
  });
}

export function PushNotificationsControl() {
  // "unsupported"/"none" is also the correct answer during SSR (no window there), so
  // this is what the server renders -- the real, browser-specific answer arrives a
  // moment later from the effect below rather than from a lazy initializer, which
  // would run again during hydration and disagree with that server HTML.
  const [permission, setPermission] = useState<NotificationPermissionState>("unsupported");
  const [installHint, setInstallHint] = useState<InstallHint>("none");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Serviceworker readiness is a genuine async boundary -- reading permission and
    // the install hint inside it (rather than synchronously in the effect body) means
    // the first setState after mount piggybacks on a real await instead of firing
    // eagerly during the mount pass itself.
    async function detect() {
      const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
      if (!supported) {
        if (!cancelled) {
          setPermission(readPermission());
          setInstallHint(readInstallHint());
        }
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription().catch(() => null);
      if (cancelled) return;
      setPermission(readPermission());
      setInstallHint(readInstallHint());
      setEnabled(subscription !== null);
    }
    void detect();

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      setInstallHint((current) => (current === "none" ? "android-install-button" : current));
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => {
      cancelled = true;
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    };
  }, []);

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    setInstallEvent(null);
  }

  async function enable() {
    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(getNotificationPermissionState({ supported: true, permission: result }));
      if (result !== "granted") return;

      const registration = await navigator.serviceWorker.ready;
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) throw new Error("מפתח ההתראות חסר");
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        }));
      await postSubscription(subscription);
      setEnabled(true);
    } catch {
      toast.error("הפעלת ההתראות נכשלה");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setEnabled(false);
    } catch {
      toast.error("כיבוי ההתראות נכשל");
    } finally {
      setBusy(false);
    }
  }

  if (permission === "unsupported") return null;

  return (
    <div className="flex flex-col gap-3">
      <label className="flex min-h-12 items-center justify-between gap-4">
        <span className="t-body">
          התראות
          {permission === "denied" && (
            <span className="t-caption block text-[var(--text-2)]">
              החסימה בוצעה בהגדרות הדפדפן -- אפשר לשנות אותה רק משם.
            </span>
          )}
        </span>
        <Switch
          checked={enabled}
          disabled={busy || permission === "denied"}
          onCheckedChange={(checked) => {
            if (checked) void enable();
            else void disable();
          }}
        />
      </label>

      {installHint === "ios-add-to-home-screen" && (
        <div className="surface-raised rounded-[16px] p-3">
          <Label className="t-caption text-[var(--text-2)]">
            כדי לקבל התראות באייפון: שתפו את הדף (כפתור השיתוף) ובחרו &quot;הוספה למסך הבית&quot;,
            ואז פתחו את האפליקציה מהאיקון החדש.
          </Label>
        </div>
      )}

      {installHint === "android-install-button" && (
        <Button type="button" variant="secondary" disabled={!installEvent} onClick={install}>
          התקנה
        </Button>
      )}
    </div>
  );
}
