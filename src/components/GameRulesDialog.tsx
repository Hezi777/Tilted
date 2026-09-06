"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AmountInput } from "@/components/AmountInput";
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
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiError, type UpdateGameRulesBody } from "@/lib/api";

export interface EditableGameRules {
  name: string | null;
  location: string | null;
  notes: string | null;
  buyIn: number;
  rebuyAmount: number;
  plannedEndAt: string;
}

function timeValue(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function timeToIso(value: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setSeconds(0, 0);
  date.setHours(hours, minutes);
  if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

export function GameRulesDialog({
  gameId,
  rules,
  open,
  onOpenChange,
  onSaved,
}: {
  gameId: string;
  rules: EditableGameRules;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(rules.name ?? "");
  const [location, setLocation] = useState(rules.location ?? "");
  const [notes, setNotes] = useState(rules.notes ?? "");
  const [buyIn, setBuyIn] = useState<number | null>(rules.buyIn);
  const [rebuyAmount, setRebuyAmount] = useState<number | null>(rules.rebuyAmount);
  const [plannedEndAt, setPlannedEndAt] = useState(timeValue(rules.plannedEndAt));
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || buyIn === null || rebuyAmount === null || !plannedEndAt) {
      toast.error("מלאו את שם הערב, הסכומים ושעת היציאה");
      return;
    }
    setSaving(true);
    const body: UpdateGameRulesBody = {
      name: name.trim(),
      location: location.trim() || null,
      notes: notes.trim() || null,
      buyIn,
      rebuyAmount,
      plannedEndAt: timeToIso(plannedEndAt),
    };
    try {
      await apiFetch(`/api/game/${gameId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await onSaved();
      onOpenChange(false);
      toast.success("פרטי הערב עודכנו");
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "עדכון הערב נכשל");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[88dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>עריכת הערב</DialogTitle>
          <DialogDescription>
            המארח יכול לעדכן את הפרטים והסכומים כל עוד הערב פתוח.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-game-name">שם הערב</Label>
            <Input id="edit-game-name" value={name} maxLength={200} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-game-location">מיקום</Label>
            <Input id="edit-game-location" value={location} maxLength={120} placeholder="אצל רועי" onChange={(event) => setLocation(event.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-game-notes">פרטים נוספים</Label>
            <Textarea id="edit-game-notes" value={notes} maxLength={2000} placeholder="מה כדאי לדעת לפני שמתחילים?" onChange={(event) => setNotes(event.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label>כניסה</Label>
              <AmountInput initialAmount={rules.buyIn} disabled={saving} onChange={setBuyIn} onCommit={setBuyIn} aria-label="סכום כניסה" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>ריביי</Label>
              <AmountInput initialAmount={rules.rebuyAmount} disabled={saving} onChange={setRebuyAmount} onCommit={setRebuyAmount} aria-label="סכום ריביי" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-game-time">שעת יציאה</Label>
            <Input id="edit-game-time" type="time" value={plannedEndAt} onChange={(event) => setPlannedEndAt(event.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? "שומרים..." : "שמרו שינויים"}
          </Button>
          <Button type="button" variant="secondary" disabled={saving} onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
