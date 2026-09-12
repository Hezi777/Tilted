"use client";

import { useEffect, useState } from "react";
import { ExternalLinkIcon, Music2Icon, PlusIcon, Trash2Icon } from "@/components/icons";
import { toast } from "sonner";
import type { PlaylistRecord } from "@/db/music-hand-queries";
import { apiFetch, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export function MusicButton({ gameId, isHost }: { gameId: string; isHost: boolean }) {
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState<PlaylistRecord[] | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || records !== null) return;
    let cancelled = false;
    apiFetch<PlaylistRecord[]>(`/api/playlists?gameId=${encodeURIComponent(gameId)}`)
      .then((next) => {
        if (!cancelled) setRecords(next);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          toast.error(reason instanceof ApiError ? reason.message : "טעינת המוזיקה נכשלה");
          setRecords([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [gameId, open, records]);

  async function addPlaylist() {
    if (!name.trim() || !url.trim()) return;
    setBusy(true);
    try {
      const created = await apiFetch<PlaylistRecord>("/api/playlists", {
        method: "POST",
        body: JSON.stringify({ gameId, name, url }),
      });
      setRecords((current) => [...(current ?? []), created]);
      setName("");
      setUrl("");
      setShowAdd(false);
      toast.success("הפלייליסט נוסף");
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "הוספת הפלייליסט נכשלה");
    } finally {
      setBusy(false);
    }
  }

  async function removePlaylist(record: PlaylistRecord) {
    const previous = records ?? [];
    setRecords(previous.filter((item) => item.id !== record.id));
    try {
      await apiFetch(`/api/playlists/${record.id}?gameId=${encodeURIComponent(gameId)}`, {
        method: "DELETE",
      });
      toast.success("הפלייליסט הוסר");
    } catch (reason) {
      setRecords(previous);
      toast.error(reason instanceof ApiError ? reason.message : "מחיקת הפלייליסט נכשלה");
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label="פתיחת מוזיקה"
        onClick={() => setOpen(true)}
      >
        <Music2Icon aria-hidden="true" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[86dvh] overflow-y-auto" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Music2Icon aria-hidden="true" className="size-5 ink-2" />
              מוזיקה לשולחן
            </DialogTitle>
            <DialogDescription>בוחרים פלייליסט ופותחים אותו באפליקציית המוזיקה.</DialogDescription>
          </DialogHeader>

          {records === null ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : records.length === 0 ? (
            <p className="empty-slot rounded-[20px] px-4 py-5 text-center t-caption ink-3">
              עוד אין מוזיקה לשולחן. המארח יכול להוסיף את הפלייליסט הראשון.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {records.map((record) => (
                <li key={record.id} className="surface-card flex min-h-14 items-center gap-2 rounded-[14px] px-3">
                  <Music2Icon aria-hidden="true" className="size-4 shrink-0 ink-2" />
                  <span className="min-w-0 flex-1 truncate font-semibold">{record.name}</span>
                  {isHost && (
                    <Button type="button" variant="ghost" size="icon" aria-label={`מחיקת ${record.name}`} onClick={() => void removePlaylist(record)}>
                      <Trash2Icon aria-hidden="true" className="text-destructive" />
                    </Button>
                  )}
                  <Button asChild variant="secondary" size="sm">
                    <a href={record.url} target="_blank" rel="noopener noreferrer">
                      פתיחה <ExternalLinkIcon aria-hidden="true" />
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {isHost && showAdd && (
            <div className="surface-card flex flex-col gap-3 rounded-[20px] p-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="playlist-name">שם הפלייליסט</Label>
                <Input id="playlist-name" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} placeholder="פוקר עד מאוחר" />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="playlist-url">קישור</Label>
                <Input id="playlist-url" dir="ltr" type="url" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" />
              </div>
              <Button type="button" disabled={busy || !name.trim() || !url.trim()} onClick={() => void addPlaylist()}>
                {busy ? "מוסיפים…" : "הוספת פלייליסט"}
              </Button>
            </div>
          )}

          <DialogFooter>
            {isHost && !showAdd && (
              <Button type="button" onClick={() => setShowAdd(true)}>
                <PlusIcon aria-hidden="true" /> הוספת פלייליסט
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              חזרה לשולחן
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
