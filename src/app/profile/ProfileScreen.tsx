"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChipAvatar } from "@/components/ChipAvatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Money } from "@/components/Money";
import { signOutAction } from "@/lib/auth/actions";
import {
  saveProfileAction,
  type ProfileActionState,
} from "@/app/profile/actions";
import type { PersonSummary } from "@/lib/api";

const INITIAL: ProfileActionState = { error: null, saved: false };

export interface ProfileStats {
  gamesPlayed: number;
  /** Agorot, signed: lifetime profit or loss. */
  net: number;
}

/** The player's own page: who they are, how to pay them, and how they have done. */
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

  return (
    <main className="flex flex-1 flex-col gap-6 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-8">
      <Button
        asChild
        variant="ghost"
        className="min-h-11 w-fit px-2 text-muted-foreground"
      >
        <Link href="/">
          <ArrowRightIcon className="size-4" />
          חזרה לבית
        </Link>
      </Button>
      <header className="flex items-center gap-4">
        <ChipAvatar personId={person.id} name={person.name} className="size-16" />
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl">{person.name}</h1>
          <p dir="ltr" className="truncate text-start text-sm text-muted-foreground">
            {email}
          </p>
        </div>
      </header>

      <section aria-labelledby="stats-title">
        <h2 id="stats-title" className="section-label mb-2.5">
          המאזן שלכם
        </h2>
        <Card className="bg-surface-2">
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <div>
              <p className="text-xs text-muted-foreground">ערבים</p>
              <p className="mt-1 text-xl font-bold tabular-nums">
                {stats.gamesPlayed}
              </p>
            </div>
            <div className="text-end">
              <p className="text-xs text-muted-foreground">סך הכול</p>
              <Money value={stats.net} signed className="mt-1 block text-xl font-bold" />
            </div>
          </CardContent>
        </Card>
      </section>

      <form action={save} className="flex flex-col gap-4">
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
            placeholder="לא חובה — עוזר כששני חברים חולקים שם"
          />
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
          <p id="phone-hint" className="text-xs text-muted-foreground">
            משמש רק כדי שחברים ידעו לאן להעביר לכם בסוף הערב.
          </p>
        </div>

        {state.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        {state.saved && !state.error && (
          <p role="status" className="text-sm text-profit">
            נשמר.
          </p>
        )}

        <Button type="submit" disabled={saving} className="h-12 w-full font-bold">
          {saving ? "שומרים..." : "שמירה"}
        </Button>
      </form>

      <form action={signOutAction}>
        <Button
          type="submit"
          variant="outline"
          className="min-h-12 w-full text-muted-foreground"
        >
          התנתקות
        </Button>
      </form>
    </main>
  );
}
