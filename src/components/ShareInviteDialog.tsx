"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export function ShareInviteDialog({ game, open, onOpenChange }: {
  game: { id: string; code: string; name: string | null; isHost: boolean; status: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [instantJoin, setInstantJoin] = useState(false);
  const [invitation, setInvitation] = useState<{ gameId: string; token: string } | null>(null);
  const [sharing, setSharing] = useState(false);
  const canOfferInstantJoin = game.isHost && game.status === "active";

  // Prepare before the Share tap, so mobile Web Share keeps its user activation.
  useEffect(() => {
    if (!open || !canOfferInstantJoin) return;
    const controller = new AbortController();
    apiFetch<{ token: string }>(`/api/game/${game.id}/join-link`, {
      method: "POST", signal: controller.signal,
    }).then(({ token }) => {
      if (!controller.signal.aborted) setInvitation({ gameId: game.id, token });
    }).catch(() => {
      if (!controller.signal.aborted) toast.error("לא הצלחנו להכין קישור להצטרפות מיידית. סגרו ונסו שוב.");
    });
    return () => controller.abort();
  }, [open, canOfferInstantJoin, game.id]);

  const useInstantJoin = canOfferInstantJoin && instantJoin;
  const ready = !useInstantJoin || invitation?.gameId === game.id;

  async function share() {
    if (!ready || sharing) return;
    const url = new URL(`/join/${game.code}`, window.location.origin);
    if (useInstantJoin && invitation) url.searchParams.set("invite", invitation.token);
    const data = {
      title: `${game.name ?? "ערב פוקר"} | Tilted Poker`,
      text: "השולחן פתוח. מצטרפים דרך ההזמנה:",
      url: url.toString(),
    };
    setSharing(true);
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(`${data.text} ${data.url}`);
        toast.success("קישור ההזמנה הועתק");
      }
      onOpenChange(false);
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) {
        toast.error("שיתוף ההזמנה נכשל");
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>הזמנה לשולחן</DialogTitle>
          <DialogDescription>
            {useInstantJoin
              ? "מי שיקבל את הקישור הזה יוכל להצטרף מיד, בלי לחכות לאישור."
              : "מי שיקבל את הקישור יבקש להצטרף והמארח יאשר."}
          </DialogDescription>
        </DialogHeader>
        {canOfferInstantJoin && (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="invite-approval">נדרש אישור המארח</Label>
            <Switch id="invite-approval" checked={!instantJoin} onCheckedChange={(checked) => setInstantJoin(!checked)} />
          </div>
        )}
        <DialogFooter>
          <Button disabled={!ready || sharing} onClick={() => void share()}>
            {sharing ? "משתפים..." : ready ? "שיתוף קישור" : "מכינים קישור..."}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>חזרה לשולחן</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
