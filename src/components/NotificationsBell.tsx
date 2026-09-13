"use client";

/**
 * The "invited but not yet joined" entry point (docs/v2-plan.md). Mounted in
 * `AppHeader` and on the home screen's own masthead, so an invite the host just made
 * is visible wherever the invitee is in the app -- not only on the game they were
 * seated at, which they have no way to find without the room code.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BellIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { apiFetch, ApiError, type PendingInvite } from "@/lib/api";

export function NotificationsBell() {
  const router = useRouter();
  const [invites, setInvites] = useState<PendingInvite[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ invites: PendingInvite[] }>("/api/invites")
      .then((data) => {
        if (!cancelled) setInvites(data.invites);
      })
      .catch(() => {
        if (!cancelled) setInvites([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const count = invites?.length ?? 0;

  // Latency is the product: the invite leaves the list the moment someone taps
  // either button, and comes back only if the request actually failed.
  async function accept(invite: PendingInvite) {
    setBusyId(invite.playerId);
    setInvites((previous) => previous?.filter((item) => item.playerId !== invite.playerId) ?? previous);
    try {
      await apiFetch(`/api/game/${invite.gameId}/invites/${invite.playerId}`, { method: "POST" });
      setOpen(false);
      router.push(`/game/${invite.gameId}`);
    } catch (reason) {
      setInvites((previous) => (previous ? [invite, ...previous] : previous));
      toast.error(reason instanceof ApiError ? reason.message : "ההצטרפות נכשלה");
    } finally {
      setBusyId(null);
    }
  }

  async function decline(invite: PendingInvite) {
    setBusyId(invite.playerId);
    setInvites((previous) => previous?.filter((item) => item.playerId !== invite.playerId) ?? previous);
    try {
      await apiFetch(`/api/game/${invite.gameId}/invites/${invite.playerId}`, { method: "DELETE" });
    } catch (reason) {
      setInvites((previous) => (previous ? [invite, ...previous] : previous));
      toast.error(reason instanceof ApiError ? reason.message : "דחיית ההזמנה נכשלה");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="relative"
        aria-label={count > 0 ? `הזמנות, ${count} ממתינות` : "הזמנות"}
        onClick={() => setOpen(true)}
      >
        <BellIcon aria-hidden="true" />
        {count > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -end-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-ink-800 px-1 text-[10px] font-bold text-amber"
          >
            {count}
          </span>
        )}
      </Button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>הזמנות</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-3 px-4 pb-2">
            {invites !== null && invites.length === 0 && (
              <p className="t-caption ink-3 py-6 text-center">אין הזמנות שמחכות לכם כרגע</p>
            )}
            {invites?.map((invite) => (
              <div
                key={invite.playerId}
                className="flex items-center justify-between gap-3 rounded-[16px] bg-surface-2 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold">
                    {invite.gameName ?? new Date(invite.createdAt).toLocaleDateString("he-IL")}
                  </p>
                  <p className="t-caption ink-3 truncate">
                    {invite.location ? `${invite.location} · ` : ""}
                    מארח: {invite.hostName} · {invite.seatedCount} מושבים
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busyId === invite.playerId}
                    onClick={() => decline(invite)}
                  >
                    דחייה
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyId === invite.playerId}
                    onClick={() => accept(invite)}
                  >
                    הצטרפות
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <DrawerFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              סגירה
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
