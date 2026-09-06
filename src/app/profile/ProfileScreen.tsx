"use client";

import { useActionState, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CheckIcon, LogOutIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Money } from "@/components/Money";
import { ChipAvatar } from "@/components/ChipAvatar";
import { AVATAR_KEYS, type AvatarKey } from "@/lib/avatar";
import { signOutAction } from "@/lib/auth/actions";
import { motionSafe, rise, stagger } from "@/lib/motion";
import {
  changePasswordAction,
  deleteAccountAction,
  saveChipAction,
  saveIdentityAction,
  savePreferencesAction,
  type ProfileActionState,
} from "@/app/profile/actions";
import { cn } from "@/lib/utils";

const INITIAL: ProfileActionState = { error: null, saved: false };

export interface ProfileStats {
  gamesPlayed: number;
  /** Agorot, signed: lifetime profit or loss. */
  net: number;
  wins: number;
  winRate: number | null;
  bestNight: number | null;
  worstNight: number | null;
  currentStreak: number;
  longestStreak: number;
}

export interface ProfileRecordView {
  id: string;
  name: string;
  nickname: string | null;
  phone: string | null;
  avatarKey: string | null;
  chipBody: string | null;
  chipEdge: string | null;
  chipSpots: number | null;
  chipInitials: string | null;
  defaultBuyIn: number | null;
  hapticsEnabled: boolean;
  reduceMotion: boolean;
}

/**
 * Reports a server action's outcome once, as a toast.
 *
 * Every form on this page used to render its own inline paragraph, and the success one
 * never cleared -- a green "נשמר." sat there for the rest of the session. One channel,
 * one lifetime.
 */
function useActionToast(state: ProfileActionState, success: string): void {
  useEffect(() => {
    if (state.error) toast.error(state.error);
    else if (state.saved) toast.success(success);
  }, [state, success]);
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-card rounded-[20px] p-5">
      <h2 className="t-title">{title}</h2>
      {description && (
        <p className="t-caption mt-1 text-[var(--text-2)]">{description}</p>
      )}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="t-label text-[var(--text-1)]">{label}</Label>
      {children}
      {hint && <p className="t-caption text-[var(--text-2)]">{hint}</p>}
    </div>
  );
}

/** A number that means something on its own, with its label under it. */
function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface-raised flex flex-col items-center gap-0.5 rounded-[16px] px-3 py-4">
      <span className="t-title money">{children}</span>
      <span className="t-caption text-[var(--text-2)]">{label}</span>
    </div>
  );
}

export function ProfileScreen({
  profile,
  email,
  stats,
}: {
  profile: ProfileRecordView;
  email: string;
  stats: ProfileStats;
}) {
  const reduceMotion = useReducedMotion();

  const [identityState, saveIdentity, savingIdentity] = useActionState(
    saveIdentityAction,
    INITIAL,
  );
  const [chipState, saveChip, savingChip] = useActionState(saveChipAction, INITIAL);
  const [prefsState, savePrefs, savingPrefs] = useActionState(
    savePreferencesAction,
    INITIAL,
  );
  const [passwordState, changePassword, changingPassword] = useActionState(
    changePasswordAction,
    INITIAL,
  );
  const [deleteState, deleteAccount, deleting] = useActionState(
    deleteAccountAction,
    INITIAL,
  );

  useActionToast(identityState, "נשמר");
  useActionToast(chipState, "הדמות עודכנה");
  useActionToast(prefsState, "ההעדפות נשמרו");
  useActionToast(passwordState, "הסיסמה הוחלפה");
  useActionToast(deleteState, "החשבון נמחק");

  // Held in state so the picked face updates under the finger rather than after a
  // round trip -- choosing it and seeing it should be one gesture.
  const [avatarKey, setAvatarKey] = useState<AvatarKey>(
    (profile.avatarKey as AvatarKey | null) ?? AVATAR_KEYS[0],
  );

  const [confirmDelete, setConfirmDelete] = useState("");

  return (
    <main className="flex min-h-[100dvh] flex-1 flex-col">
      <AppHeader title="פרופיל" backHref="/" />

      <motion.div
        variants={motionSafe(stagger, reduceMotion)}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-4 px-5 pb-[calc(6rem+env(safe-area-inset-bottom))]"
      >
        {/* Who you are at the table. The chip is the only saturated thing on the
            screen, which is why it leads. */}
        <motion.div
          variants={motionSafe(rise, reduceMotion)}
          className="flex items-center gap-4 py-2"
        >
          <ChipAvatar
            avatarKey={avatarKey}
            personId={profile.id}
            name={profile.name}
            className="size-20 shrink-0"
          />
          <div className="min-w-0">
            <p className="t-display-l truncate">{profile.name}</p>
            <p className="t-caption truncate text-[var(--text-2)]" dir="ltr">
              {email}
            </p>
          </div>
        </motion.div>

        <motion.div variants={motionSafe(rise, reduceMotion)}>
          <Section title="הערבים שלך" description="רק שלך. אין טבלת מובילים.">
            <div className="grid grid-cols-3 gap-2">
              <Stat label="ערבים">{stats.gamesPlayed}</Stat>
              <Stat label="סך הכול">
                <Money value={stats.net} signed />
              </Stat>
              <Stat label="אחוז זכייה">
                {stats.winRate === null ? "—" : `${Math.round(stats.winRate * 100)}%`}
              </Stat>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="הערב הכי טוב">
                {stats.bestNight === null ? (
                  "—"
                ) : (
                  <span className="inline-flex items-center gap-1 text-profit">
                    <TrendingUpIcon aria-hidden className="size-4" strokeWidth={1.75} />
                    <Money value={stats.bestNight} signed />
                  </span>
                )}
              </Stat>
              <Stat label="הערב הכי גרוע">
                {stats.worstNight === null ? (
                  "—"
                ) : (
                  <span className="inline-flex items-center gap-1 text-loss">
                    <TrendingDownIcon aria-hidden className="size-4" strokeWidth={1.75} />
                    <Money value={stats.worstNight} signed />
                  </span>
                )}
              </Stat>
              <Stat label="הרצף הארוך">{stats.longestStreak}</Stat>
            </div>
          </Section>
        </motion.div>

        <motion.div variants={motionSafe(rise, reduceMotion)}>
          <form action={saveIdentity}>
            <Section title="הפרטים שלך">
              <Field label="שם">
                <Input name="name" defaultValue={profile.name} required maxLength={100} />
              </Field>
              <Field
                label="כינוי"
                hint="עוזר כששני חברים חולקים את אותו שם."
              >
                <Input
                  name="nickname"
                  defaultValue={profile.nickname ?? ""}
                  maxLength={100}
                />
              </Field>
              <Field label="טלפון" hint="רק כדי שחברים ידעו לאן להעביר.">
                <Input
                  name="phone"
                  type="tel"
                  dir="ltr"
                  defaultValue={profile.phone ?? ""}
                  maxLength={20}
                />
              </Field>
              <Button type="submit" disabled={savingIdentity} className="w-full">
                שמירה
              </Button>
            </Section>
          </form>
        </motion.div>

        <motion.div variants={motionSafe(rise, reduceMotion)}>
          <form action={saveChip}>
            <Section
              title="הדמות שלך"
              description="זה מה שרואים לידך בשולחן ובהיסטוריה."
            >
              <input type="hidden" name="avatarKey" value={avatarKey} />
              <div
                role="radiogroup"
                aria-label="בחירת דמות"
                className="grid grid-cols-6 gap-2"
              >
                {AVATAR_KEYS.map((key) => {
                  const selected = key === avatarKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={key}
                      onClick={() => setAvatarKey(key)}
                      className={cn(
                        "rounded-full transition-[transform,opacity]",
                        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        selected ? "scale-100" : "scale-90 opacity-55",
                      )}
                    >
                      <ChipAvatar
                        avatarKey={key}
                        personId={profile.id}
                        name={profile.name}
                        className="size-11"
                      />
                    </button>
                  );
                })}
              </div>
              <Button type="submit" disabled={savingChip} className="w-full">
                שמירת הדמות
              </Button>
            </Section>
          </form>
        </motion.div>

        <motion.div variants={motionSafe(rise, reduceMotion)}>
          <form action={savePrefs}>
            <Section title="העדפות">
              <Field label="כניסה כברירת מחדל" hint="בשקלים. ריק = בלי ברירת מחדל.">
                <Input
                  name="defaultBuyIn"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  dir="ltr"
                  defaultValue={
                    profile.defaultBuyIn === null ? "" : profile.defaultBuyIn / 100
                  }
                  className="w-32"
                />
              </Field>
              <label className="flex min-h-12 items-center justify-between gap-4">
                <span className="t-body">רטט</span>
                <Switch name="hapticsEnabled" defaultChecked={profile.hapticsEnabled} />
              </label>
              <label className="flex min-h-12 items-center justify-between gap-4">
                <span className="t-body">
                  צמצום אנימציות
                  <span className="t-caption block text-[var(--text-2)]">
                    גובר על הגדרת המערכת
                  </span>
                </span>
                <Switch name="reduceMotion" defaultChecked={profile.reduceMotion} />
              </label>
              <Button type="submit" disabled={savingPrefs} className="w-full">
                שמירת העדפות
              </Button>
            </Section>
          </form>
        </motion.div>

        <motion.div variants={motionSafe(rise, reduceMotion)}>
          <form action={changePassword}>
            <Section
              title="סיסמה"
              description="החלפת סיסמה מנתקת את כל המכשירים האחרים."
            >
              <Field label="הסיסמה הנוכחית">
                <Input
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </Field>
              <Field label="סיסמה חדשה" hint="לפחות 8 תווים.">
                <Input
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </Field>
              <Button type="submit" disabled={changingPassword} className="w-full">
                <CheckIcon aria-hidden strokeWidth={1.75} />
                החלפת סיסמה
              </Button>
            </Section>
          </form>
        </motion.div>

        <motion.div variants={motionSafe(rise, reduceMotion)}>
          <Section title="החשבון">
            <form action={signOutAction}>
              <Button type="submit" variant="secondary" className="w-full">
                <LogOutIcon aria-hidden strokeWidth={1.75} />
                התנתקות
              </Button>
            </form>

            <form action={deleteAccount} className="flex flex-col gap-3">
              <Field
                label="מחיקת חשבון"
                hint="הערבים ששיחקתם נשארים כפי שהיו — אחרים סגרו עליהם חשבון. רק החשבון שלכם נמחק, ואי אפשר לבטל."
              >
                <Input
                  name="confirm"
                  value={confirmDelete}
                  onChange={(event) => setConfirmDelete(event.target.value)}
                  placeholder="כתבו מחיקה כדי לאשר"
                />
              </Field>
              <Button
                type="submit"
                variant="destructive"
                disabled={deleting || confirmDelete.trim() !== "מחיקה"}
                className="w-full"
              >
                מחיקת החשבון
              </Button>
            </form>
          </Section>
        </motion.div>
      </motion.div>
    </main>
  );
}
