"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Field, Section } from "@/components/FormSection";
import { ChipAvatar } from "@/components/ChipAvatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {} from "@/components/icons";
import { AVATAR_KEYS, RESERVED_AVATAR_CLAIMS } from "@/lib/avatar";
import { motionSafe, rise, stagger } from "@/lib/motion";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { CustomAvatarView } from "@/app/profile/ProfileScreen";

/** What the admin overview counts. Read once, on open. */
interface AdminOverview {
  nightsPlayed: number;
  members: { personId: string }[];
  locations: { location: string; nights: number }[];
}

/**
 * Tools that belong to whoever runs this instance, not to everybody's profile.
 *
 * It used to be a section inside `ProfileScreen`, which meant the one person who needed
 * it scrolled past their own stats to reach it and the component carrying it was loaded
 * for every player who never would. The routes behind everything here already answer
 * 404 to a non-admin, so this screen only stops rendering a link -- it is not the
 * permission.
 */
export function AdminScreen({ avatars }: { avatars: CustomAvatarView[] }) {
  const reduceMotion = useReducedMotion();
  const [overview, setOverview] = useState<AdminOverview | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<AdminOverview>("/api/group")
      .then((data) => !cancelled && setOverview(data))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex flex-1 flex-col pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <AppHeader
        title="כלי ניהול"
        subtitle="מה שמריץ את האפליקציה"
        backHref="/profile"
        backLabel="פרופיל"
      />

      <motion.div
        variants={motionSafe(stagger, reduceMotion)}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-4 px-5"
      >
        <motion.section variants={motionSafe(rise, reduceMotion)}>
          <Card>
            <CardHeader><CardTitle>מצב האפליקציה</CardTitle></CardHeader>
            <CardContent>
              {!overview ? (
                <Skeleton className="h-14 w-full rounded-xl" />
              ) : (
                <dl className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1">
                    <dt className="t-caption ink-3">ערבים</dt>
                    <dd className="t-title tabular">{overview.nightsPlayed}</dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="t-caption ink-3">שחקנים</dt>
                    <dd className="t-title tabular">{overview.members.length}</dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="t-caption ink-3">דמויות</dt>
                    <dd className="t-title tabular">{AVATAR_KEYS.length + avatars.length}</dd>
                  </div>
                </dl>
              )}
            </CardContent>
          </Card>
        </motion.section>

        <motion.section variants={motionSafe(rise, reduceMotion)}>
          <AdminAvatarsSection avatars={avatars} />
        </motion.section>

        <motion.section variants={motionSafe(rise, reduceMotion)}>
          <Card>
            <CardHeader><CardTitle>מוזיקה</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="t-body ink-3">
                רשימות ההשמעה משותפות לכל השולחנות ונערכות מתוך המשחק עצמו.
              </p>
              <Button asChild variant="secondary" className="w-full justify-start">
                <Link href="/">חזרה לבית</Link>
              </Button>
            </CardContent>
          </Card>
        </motion.section>
      </motion.div>
    </main>
  );
}

/**
 * Adding a character without a deploy.
 *
 * Visible only to the admin, and the surface behind it answers 404 to everyone else --
 * hiding a section is a presentation choice, not a permission.
 *
 * Uploads post straight to the route with `FormData` rather than through a server
 * action, because the file has to arrive as bytes and a server action would have it
 * base64'd in the client first. `router.refresh()` is what re-reads the list, so the
 * picker and the admin table can never disagree about what exists.
 */
function AdminAvatarsSection({ avatars }: { avatars: CustomAvatarView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reserved, setReserved] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  async function upload(formData: FormData) {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/avatars", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        toast.error(body?.error ?? "ההעלאה נכשלה");
        return;
      }
      toast.success("הדמות נוספה");
      setReserved(false);
      setFileName(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(avatar: CustomAvatarView) {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/avatars/${avatar.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        toast.error("המחיקה נכשלה");
        return;
      }
      toast.success("הדמות נמחקה");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="דמויות"
      description="הוספת דמות חדשה בלי לגעת בקוד. רק אתם רואים את זה."
    >
      <form
        action={upload}
        className="flex flex-col gap-4"
        key={avatars.length}
      >
        <Field label="שם הדמות" hint="איך תזהו אותה ברשימה הזאת.">
          <Input name="label" required maxLength={60} placeholder="למשל: אלון" />
        </Field>

        <Field
          label="מזהה באנגלית"
          hint="אותיות קטנות ומקפים. נשאר קבוע — אל תשנו אותו אחרי שמישהו לובש את הדמות."
        >
          <Input
            name="slug"
            required
            dir="ltr"
            className="text-start"
            maxLength={30}
            pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
            placeholder="alon"
          />
        </Field>

        <Field label="התמונה" hint="WebP, PNG או JPEG. עד 256KB, ריבועית.">
          {/* The native control is hidden rather than styled: its "Choose File / No
              file chosen" text is the browser's, in English, and cannot be translated
              from CSS. The label is the button, which keeps the file picker reachable
              by keyboard and by screen reader. */}
          <label
            className={cn(
              "flex cursor-pointer items-center justify-between gap-3 rounded-full bg-ink-700 px-4 py-2.5",
              "focus-within:ring-2 focus-within:ring-ring",
            )}
          >
            <span className="t-label text-[var(--text-1)]">בחירת קובץ</span>
            <span className="t-caption truncate text-[var(--text-2)]">
              {fileName ?? "לא נבחר קובץ"}
            </span>
            <input
              name="image"
              type="file"
              required
              accept="image/webp,image/png,image/jpeg"
              className="sr-only"
              onChange={(event) =>
                setFileName(event.target.files?.[0]?.name ?? null)
              }
            />
          </label>
        </Field>

        <div className="flex items-center justify-between gap-3">
          <Label className="t-label text-[var(--text-1)]" htmlFor="reserved">
            דמות שמורה
          </Label>
          <Switch
            id="reserved"
            name="reserved"
            checked={reserved}
            onCheckedChange={setReserved}
          />
        </div>
        <p className="t-caption -mt-2 text-[var(--text-2)]">
          שמורה = אף אחד לא יכול לבחור אותה, והיא נתפסת אוטומטית למי שנרשם בשם
          הזה. פתוחה = מופיעה לכולם בבוחר הדמויות.
        </p>

        {reserved && (
          <Field
            label="שמות שתופסים אותה"
            hint="מופרדים בפסיק, בשתי השפות. למשל: אלון, alon"
          >
            <Input name="claimNames" placeholder="אלון, alon" />
          </Field>
        )}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "מעלים…" : "הוספת דמות"}
        </Button>
      </form>

      {/* The ten that ship with the app, shown so the admin can see the whole cast and
          the names that claim each one -- not just what has been added since. They live
          in src/lib/avatar.ts as committed art, so there is nothing to delete here; the
          list is a readout, and the form above is what adds to it. */}
      <div className="flex flex-col gap-2">
        <p className="t-label text-[var(--text-1)]">דמויות קבועות</p>
        <ul className="flex flex-col gap-2">
          {RESERVED_AVATAR_CLAIMS.map(([key, spellings]) => (
            <li
              key={key}
              className="flex items-center gap-3 rounded-2xl bg-ink-700 p-2.5"
            >
              <ChipAvatar avatarKey={key} name={key} className="size-10" />
              <div className="min-w-0 flex-1">
                <p className="t-label truncate text-[var(--text-1)]">
                  {spellings[0]}
                </p>
                <p className="t-caption truncate text-[var(--text-2)]">
                  שמורה · {spellings.join(", ")}
                </p>
              </div>
              <span className="t-caption shrink-0 text-[var(--text-2)]">מובנית</span>
            </li>
          ))}
        </ul>
      </div>

      {avatars.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="t-label text-[var(--text-1)]">דמויות שהוספתם</p>
          <ul className="flex flex-col gap-2">
          {avatars.map((avatar) => (
            <li
              key={avatar.id}
              className="flex items-center gap-3 rounded-2xl bg-ink-700 p-2.5"
            >
              <ChipAvatar
                avatarKey={avatar.key}
                name={avatar.label}
                className="size-10"
              />
              <div className="min-w-0 flex-1">
                <p className="t-label truncate text-[var(--text-1)]">
                  {avatar.label}
                </p>
                <p className="t-caption truncate text-[var(--text-2)]">
                  {avatar.reserved
                    ? `שמורה · ${avatar.claimNames.join(", ")}`
                    : "פתוחה לכולם"}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => remove(avatar)}
              >
                מחיקה
              </Button>
            </li>
          ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
