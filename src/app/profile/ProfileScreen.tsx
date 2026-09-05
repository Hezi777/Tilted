"use client";

import { useActionState, useEffect, useState } from "react";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { ChipAvatar } from "@/components/ChipAvatar";
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
import { Money } from "@/components/Money";
import { AVATAR_KEYS } from "@/lib/avatar";
import { signOutAction } from "@/lib/auth/actions";
import {
  saveProfileAction,
  type ProfileActionState,
} from "@/app/profile/actions";
import { cn } from "@/lib/utils";
import type { PersonSummary } from "@/lib/api";

const INITIAL: ProfileActionState = { error: null, saved: false };

export interface ProfileStats {
  gamesPlayed: number;
  /** Agorot, signed: lifetime profit or loss. */
  net: number;
}

/**
 * The player's own page: who they are, how to pay them, how they have done.
 *
 * The identity block is a centred column rather than a row. A row put a two-word name
 * beside a long email, which left the avatar hanging off an L-shaped block of ragged
 * text; centring makes the width of the email irrelevant.
 */
export function ProfileScreen({
  person,
  email,
  phone,
  stats,
}: {
  person: PersonSummary;
  email: string;
  phone: string | null;
  stats: ProfileStats;
}) {
  const [state, save, saving] = useActionState(saveProfileAction, INITIAL);
  const [avatarKey, setAvatarKey] = useState(person.avatarKey);
  const [pickerOpen, setPickerOpen] = useState(false);
  // The draft only becomes the character on save, so backing out of the dialog and
  // leaving the page does not quietly change the face.
  const [draftAvatar, setDraftAvatar] = useState(person.avatarKey);

  // A permanent green "saved." line sat on the screen for the rest of the session. The
  // rest of the app reports with a toast, so this does too.
  useEffect(() => {
    if (state.saved && !state.error) toast.success("הפרופיל נשמר");
  }, [state]);

  return (
    <main className="flex flex-1 flex-col pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <AppHeader title="הפרופיל שלי" />

      <div className="flex flex-col gap-7 px-5">
        <section className="flex flex-col items-center gap-3 text-center">
          <button
            type="button"
            onClick={() => {
              setDraftAvatar(avatarKey);
              setPickerOpen(true);
            }}
            aria-label="שינוי הדמות שלי"
            className="group relative rounded-full focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ChipAvatar
              avatarKey={avatarKey}
              personId={person.id}
              name={person.name}
              className="size-24"
            />
            <span className="absolute bottom-0 end-0 grid size-8 place-items-center rounded-full border border-foreground/15 bg-surface-4 text-foreground shadow-lg">
              <PencilIcon aria-hidden="true" className="size-4" />
            </span>
          </button>
          <div className="w-full min-w-0">
            <h2 className="t-display-l truncate">{person.name}</h2>
            {email ? (
              <p
                dir="ltr"
                className="t-caption ink-3 mt-1 truncate text-center"
                title={email}
              >
                {email}
              </p>
            ) : null}
          </div>
        </section>

        <section aria-labelledby="stats-title">
          <h2 id="stats-title" className="section-label mb-2.5">
            המאזן שלכם
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="surface-card rounded-[20px] p-4">
              <p className="t-caption ink-3">ערבים</p>
              <p className="money mt-1 text-2xl font-bold">
                {stats.gamesPlayed}
              </p>
            </div>
            <div className="surface-card rounded-[20px] p-4">
              <p className="t-caption ink-3">סך הכול</p>
              <Money
                value={stats.net}
                signed
                className={cn(
                  "mt-1 block text-2xl font-bold",
                  stats.net > 0 && "text-profit",
                  stats.net < 0 && "text-loss",
                )}
              />
            </div>
          </div>
        </section>

        <form action={save} className="flex flex-col gap-4">
          <h2 className="section-label">הפרטים שלכם</h2>
          <input type="hidden" name="avatarKey" value={avatarKey ?? ""} />

          <div className="surface-card flex flex-col gap-4 rounded-[20px] p-4">
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-bold" htmlFor="name">
                שם
              </Label>
              <Input
                id="name"
                name="name"
                defaultValue={person.name}
                required
                maxLength={100}
                className="h-12 rounded-xl px-4"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-sm font-bold" htmlFor="nickname">
                כינוי
              </Label>
              <Input
                id="nickname"
                name="nickname"
                defaultValue={person.nickname ?? ""}
                maxLength={100}
                className="h-12 rounded-xl px-4"
                placeholder="לא חובה"
                aria-describedby="nickname-hint"
              />
              <p id="nickname-hint" className="t-caption ink-3">
                עוזר כששני חברים חולקים את אותו שם.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label className="text-sm font-bold" htmlFor="phone">
                טלפון
              </Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                defaultValue={phone ?? ""}
                dir="ltr"
                className="h-12 rounded-xl px-4 text-start"
                placeholder="050-0000000"
                aria-describedby="phone-hint"
              />
              <p id="phone-hint" className="t-caption ink-3">
                משמש רק כדי שחברים ידעו לאן להעביר לכם בסוף הערב.
              </p>
            </div>
          </div>

          {state.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}

          <Button
            type="submit"
            disabled={saving}
            className="h-12 w-full font-bold"
          >
            {saving ? "שומרים..." : "שמירה"}
          </Button>
        </form>

        <form action={signOutAction} className="border-t border-foreground/10 pt-5">
          <Button
            type="submit"
            variant="ghost"
            className="min-h-12 w-full text-muted-foreground hover:text-foreground"
          >
            התנתקות
          </Button>
        </form>
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent showCloseButton={false} className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>הדמות שלי</DialogTitle>
            <DialogDescription>
              הדמות מופיעה ליד השם שלכם בכל שולחן.
            </DialogDescription>
          </DialogHeader>

          <div role="radiogroup" aria-label="בחירת דמות" className="grid grid-cols-4 gap-2">
            {AVATAR_KEYS.map((key, index) => {
              const selected = draftAvatar === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`דמות ${index + 1}`}
                  onClick={() => setDraftAvatar(key)}
                  className="rounded-full focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <ChipAvatar
                    avatarKey={key}
                    name={`דמות ${index + 1}`}
                    className={cn(
                      "size-full transition-opacity",
                      selected
                        ? "ring-2 ring-ruby-bright"
                        : "opacity-60 ring-1 ring-foreground/10",
                    )}
                  />
                </button>
              );
            })}
          </div>

          <DialogFooter>
            <Button
              type="button"
              className="h-12"
              onClick={() => {
                setAvatarKey(draftAvatar);
                setPickerOpen(false);
              }}
            >
              בחרו דמות
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12"
              onClick={() => setPickerOpen(false)}
            >
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
