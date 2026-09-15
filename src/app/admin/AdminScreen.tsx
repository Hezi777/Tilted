"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { ChipAvatar } from "@/components/ChipAvatar";
import { Field, Section } from "@/components/FormSection";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { motionSafe, rise, stagger } from "@/lib/motion";
import { apiFetch, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  AdminCharacter,
  AdminGame,
  AdminOverview,
  AdminPerson,
} from "@/db/admin-queries";
import type { CustomAvatarView } from "@/app/profile/ProfileScreen";

function when(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "היום";
  if (days === 1) return "אתמול";
  if (days < 14) return `לפני ${days} ימים`;
  if (days < 60) return `לפני ${Math.floor(days / 7)} שבועות`;
  return `לפני ${Math.floor(days / 30)} חודשים`;
}

const STATUS_LABEL: Record<AdminGame["status"], string> = {
  active: "פתוח",
  settling: "סוגרים",
  closed: "נסגר",
  cancelled: "בוטל",
};

/**
 * Tools that belong to whoever runs this instance, not to everybody's profile.
 *
 * Everything is behind a drawer rather than stacked open, because an admin arrives with
 * one job -- a stuck table, a face on the wrong person -- and a screen that shows all of
 * it at once makes them scroll past four things they did not come for. The routes behind
 * each one already answer 404 to a non-admin, so none of this is the permission.
 */
export function AdminScreen({ avatars }: { avatars: CustomAvatarView[] }) {
  const reduceMotion = useReducedMotion();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<null | "characters" | "people" | "tables">(null);

  const load = useCallback(() => {
    apiFetch<AdminOverview>("/api/admin/overview")
      .then(setData)
      .catch((reason: unknown) =>
        setError(reason instanceof ApiError ? reason.message : "שגיאה בטעינה"),
      );
  }, []);
  useEffect(load, [load]);

  const stuck = data?.stuckGames ?? 0;

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
        {error && (
          <p role="alert" className="t-body text-destructive">
            {error}
          </p>
        )}
        {!data && !error && <Skeleton className="h-28 w-full rounded-[20px]" />}

        {data && (
          <>
            <motion.div variants={motionSafe(rise, reduceMotion)}>
              <Section title="מצב האפליקציה">
                <dl className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1">
                    <dt className="t-caption ink-3">שחקנים</dt>
                    <dd className="t-title tabular">{data.people.length}</dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="t-caption ink-3">ערבים</dt>
                    <dd className="t-title tabular">{data.gamesList.length}</dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="t-caption ink-3">דמויות</dt>
                    <dd className="t-title tabular">{data.characters.length}</dd>
                  </div>
                </dl>
                {stuck > 0 && (
                  /* The one number worth acting on: a night nobody finished is a night
                     that cannot close, and nothing else on this screen is urgent. */
                  <p className="t-body text-[var(--text-1)]">
                    {stuck === 1 ? "שולחן אחד עדיין פתוח." : `${stuck} שולחנות עדיין פתוחים.`}
                  </p>
                )}
              </Section>
            </motion.div>

            <motion.div variants={motionSafe(rise, reduceMotion)}>
              <Section title="ניהול">
                <Button type="button" variant="secondary" className="w-full justify-between" onClick={() => setOpen("characters")}>
                  <span>דמויות</span>
                  <span className="t-caption ink-3 tabular">{data.characters.length}</span>
                </Button>
                <Button type="button" variant="secondary" className="w-full justify-between" onClick={() => setOpen("people")}>
                  <span>שחקנים</span>
                  <span className="t-caption ink-3 tabular">{data.people.length}</span>
                </Button>
                <Button type="button" variant="secondary" className="w-full justify-between" onClick={() => setOpen("tables")}>
                  <span>שולחנות</span>
                  <span className="t-caption ink-3 tabular">
                    {stuck > 0 ? `${stuck} פתוחים` : data.gamesList.length}
                  </span>
                </Button>
              </Section>
            </motion.div>
          </>
        )}
      </motion.div>

      <CharactersDrawer
        open={open === "characters"}
        onClose={() => setOpen(null)}
        characters={data?.characters ?? []}
        people={data?.people ?? []}
        avatars={avatars}
        onChanged={load}
      />
      <PeopleDrawer
        open={open === "people"}
        onClose={() => setOpen(null)}
        people={data?.people ?? []}
        onChanged={load}
      />
      <TablesDrawer
        open={open === "tables"}
        onClose={() => setOpen(null)}
        games={data?.gamesList ?? []}
        onChanged={load}
      />
    </main>
  );
}

/** A drawer that fills the screen and scrolls, since all three hold long lists. */
function ToolDrawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
      <DrawerContent className="max-h-[88dvh]">
        <DrawerHeader><DrawerTitle>{title}</DrawerTitle></DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4">
          {children}
        </div>
        <DrawerFooter>
          <Button type="button" variant="outline" className="h-12" onClick={onClose}>
            סגירה
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * Every character in the app, who is wearing it, and who should be.
 *
 * The built-in ten are committed art, so their image cannot change without a deploy --
 * what an admin can actually change about them is who holds one, which is the thing
 * that actually goes wrong: the picker hands them out first-come-first-served by name,
 * so two friends called דור means the wrong one gets the face.
 */
function CharactersDrawer({
  open,
  onClose,
  characters,
  people,
  avatars,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  characters: AdminCharacter[];
  people: AdminPerson[];
  avatars: CustomAvatarView[];
  onChanged: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminCharacter | null>(null);
  const [busy, setBusy] = useState(false);

  async function assign(character: AdminCharacter, personId: string | null) {
    setBusy(true);
    try {
      if (character.heldBy && character.heldBy.personId !== personId) {
        await apiFetch(`/api/admin/people/${character.heldBy.personId}`, {
          method: "PATCH",
          body: JSON.stringify({ avatarKey: null }),
        });
      }
      if (personId) {
        await apiFetch(`/api/admin/people/${personId}`, {
          method: "PATCH",
          body: JSON.stringify({ avatarKey: character.key }),
        });
      }
      toast.success("הדמות עודכנה");
      setEditing(null);
      onChanged();
      router.refresh();
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "העדכון נכשל");
    } finally {
      setBusy(false);
    }
  }

  async function removeCharacter(character: AdminCharacter) {
    if (!character.id) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/avatars/${character.id}`, { method: "DELETE" });
      if (!response.ok) {
        toast.error("המחיקה נכשלה");
        return;
      }
      // deleteCustomAvatar moves anyone wearing it back to a stable open character, so
      // no screen is left pointing at a key that 404s.
      toast.success("הדמות נמחקה");
      setEditing(null);
      onChanged();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveLabel(character: AdminCharacter, label: string, reserved: boolean) {
    if (!character.id) return;
    setBusy(true);
    try {
      await apiFetch(`/api/admin/avatars/${character.id}`, {
        method: "PATCH",
        body: JSON.stringify({ label, reserved }),
      });
      toast.success("הדמות עודכנה");
      setEditing(null);
      onChanged();
      router.refresh();
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "העדכון נכשל");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ToolDrawer open={open} onClose={onClose} title="דמויות">
        <AdminAvatarsUpload count={avatars.length} onUploaded={onChanged} />
        <ul className="row-list">
          {characters.map((character) => (
            <li key={character.key}>
              <button
                type="button"
                onClick={() => setEditing(character)}
                className="surface-card flex min-h-18 w-full items-center gap-3 rounded-[18px] px-4 py-3 text-start focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <ChipAvatar avatarKey={character.key} personId={character.key} name={character.label} className="size-10" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{character.label}</span>
                  <span className="t-caption ink-3 block truncate">
                    {character.heldBy ? character.heldBy.name : "פנויה"}
                  </span>
                </span>
                {character.reserved && <StatusBadge tone="muted">שמורה</StatusBadge>}
                {character.source === "custom" && <StatusBadge tone="muted">נוספה</StatusBadge>}
              </button>
            </li>
          ))}
        </ul>
      </ToolDrawer>

      <Drawer open={editing !== null} onOpenChange={(next) => !next && setEditing(null)}>
        <DrawerContent className="max-h-[88dvh]">
          <DrawerHeader><DrawerTitle>{editing?.label ?? ""}</DrawerTitle></DrawerHeader>
          {editing && (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4">
              {editing.source === "custom" && editing.id && (
                <CustomCharacterFields
                  character={editing}
                  busy={busy}
                  onSave={(label, reserved) => void saveLabel(editing, label, reserved)}
                  onDelete={() => void removeCharacter(editing)}
                />
              )}
              {editing.source === "built-in" && (
                <p className="t-caption ink-3">
                  הדמויות המובנות הן קבצים בקוד — אפשר לשנות מי לובש אותן, לא את הציור.
                  {editing.claimNames.length > 0 &&
                    ` נתפסת אוטומטית על ידי: ${editing.claimNames.join(", ")}.`}
                </p>
              )}

              <div className="flex flex-col gap-2">
                <Label className="t-label text-[var(--text-1)]">מי לובש אותה</Label>
                <ul className="row-list">
                  <li>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void assign(editing, null)}
                      className={cn(
                        "surface-card flex min-h-12 w-full items-center rounded-[14px] px-4 text-start",
                        !editing.heldBy && "ring-2 ring-ring",
                      )}
                    >
                      אף אחד
                    </button>
                  </li>
                  {people.map((person) => (
                    <li key={person.id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void assign(editing, person.id)}
                        className={cn(
                          "surface-card flex min-h-12 w-full items-center gap-3 rounded-[14px] px-4 text-start",
                          editing.heldBy?.personId === person.id && "ring-2 ring-ring",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{person.name}</span>
                        {person.avatarKey && person.avatarKey !== editing.key && (
                          /* Taking this one frees whatever they wear now, so say so
                             before the tap rather than after it. */
                          <span className="t-caption ink-3 shrink-0">לובש אחרת</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <DrawerFooter>
            <Button type="button" variant="outline" className="h-12" onClick={() => setEditing(null)}>
              סגירה
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}

function CustomCharacterFields({
  character,
  busy,
  onSave,
  onDelete,
}: {
  character: AdminCharacter;
  busy: boolean;
  onSave: (label: string, reserved: boolean) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(character.label);
  const [reserved, setReserved] = useState(character.reserved);
  return (
    <div className="flex flex-col gap-3">
      <Field label="שם הדמות">
        <Input value={label} maxLength={60} onChange={(event) => setLabel(event.target.value)} />
      </Field>
      <div className="flex items-center justify-between gap-3">
        <Label className="t-label text-[var(--text-1)]" htmlFor="char-reserved">
          שמורה (לא ניתנת לבחירה)
        </Label>
        <Switch id="char-reserved" checked={reserved} onCheckedChange={setReserved} />
      </div>
      <Button type="button" disabled={busy || label.trim().length === 0} onClick={() => onSave(label.trim(), reserved)}>
        שמירה
      </Button>
      {/* Far from the save button on purpose -- this is the irreversible one. */}
      <Button type="button" variant="ghost" className="text-destructive" disabled={busy} onClick={onDelete}>
        מחיקת הדמות
      </Button>
    </div>
  );
}

/** Accounts, and the two things about one an admin can fix: its name and its nickname. */
function PeopleDrawer({
  open,
  onClose,
  people,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  people: AdminPerson[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<AdminPerson | null>(null);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!editing) return;
    setBusy(true);
    try {
      await apiFetch(`/api/admin/people/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          nickname: nickname.trim() || null,
        }),
      });
      toast.success("השחקן עודכן");
      setEditing(null);
      onChanged();
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "העדכון נכשל");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ToolDrawer open={open} onClose={onClose} title="שחקנים">
        <ul className="row-list">
          {people.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                onClick={() => {
                  setName(person.name);
                  setNickname(person.nickname ?? "");
                  setEditing(person);
                }}
                className="surface-card flex min-h-18 w-full items-center gap-3 rounded-[18px] px-4 py-3 text-start focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <ChipAvatar avatarKey={person.avatarKey} personId={person.id} name={person.name} className="size-10" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{person.name}</span>
                  {person.nickname && (
                    <span className="t-caption ink-3 block truncate">{person.nickname}</span>
                  )}
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className="t-caption ink-3 tabular">{person.nightsPlayed} ערבים</span>
                  <span className="t-caption ink-3">{when(person.lastPlayedAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </ToolDrawer>

      <Drawer open={editing !== null} onOpenChange={(next) => !next && setEditing(null)}>
        <DrawerContent>
          <DrawerHeader><DrawerTitle>{editing?.name ?? ""}</DrawerTitle></DrawerHeader>
          <div className="flex flex-col gap-3 px-4">
            <Field label="שם">
              <Input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="כינוי" hint="מופיע מתחת לשם ברשימת החבורה.">
              <Input value={nickname} maxLength={60} onChange={(event) => setNickname(event.target.value)} />
            </Field>
            {/* A seat snapshots the name it was created with, so a rename here does not
                rewrite history -- past nights keep the name they were played under. */}
            <p className="t-caption ink-3">
              ערבים שכבר נסגרו ישמרו את השם שבו שיחקו.
            </p>
            <Button type="button" disabled={busy || name.trim().length === 0} onClick={() => void save()}>
              שמירה
            </Button>
          </div>
          <DrawerFooter>
            <Button type="button" variant="outline" className="h-12" onClick={() => setEditing(null)}>
              ביטול
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}

/** Every table in the instance, and a way out of one that is stuck open. */
function TablesDrawer({
  open,
  onClose,
  games,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  games: AdminGame[];
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState<AdminGame | null>(null);
  const [busy, setBusy] = useState(false);

  async function forceCancel() {
    if (!confirming) return;
    setBusy(true);
    try {
      await apiFetch(`/api/admin/games/${confirming.id}`, { method: "DELETE" });
      toast.success("השולחן בוטל");
      setConfirming(null);
      onChanged();
    } catch (reason) {
      toast.error(reason instanceof ApiError ? reason.message : "הביטול נכשל");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ToolDrawer open={open} onClose={onClose} title="שולחנות">
        <ul className="row-list">
          {games.map((game) => {
            const live = game.status === "active" || game.status === "settling";
            return (
              <li key={game.id} className="surface-card flex min-h-18 items-center gap-3 rounded-[18px] px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {game.name ?? "ערב"}
                    <span dir="ltr" className="money ink-3 ms-2 font-bold">{game.code}</span>
                  </span>
                  <span className="t-caption ink-3 block truncate">
                    {STATUS_LABEL[game.status]} · {game.playerCount} שחקנים
                    {live && game.unsettledCount > 0 && ` · ${game.unsettledCount} לא ספרו`}
                    {" · "}
                    {when(game.closedAt ?? game.createdAt)}
                  </span>
                </span>
                {live && (
                  <Button type="button" variant="ghost" className="shrink-0 text-destructive" onClick={() => setConfirming(game)}>
                    ביטול
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </ToolDrawer>

      <Drawer open={confirming !== null} onOpenChange={(next) => !next && setConfirming(null)}>
        <DrawerContent>
          <DrawerHeader><DrawerTitle>לבטל את {confirming?.name ?? "השולחן"}?</DrawerTitle></DrawerHeader>
          <div className="flex flex-col gap-3 px-4">
            {/* Cancelled, not closed: closing runs settlement, and a night nobody
                finished counting has no settlement to run. */}
            <p className="t-body text-[var(--text-1)]">
              הערב יסומן כבוטל ולא ייכנס להיסטוריה. אין דרך לחזור מזה.
            </p>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => void forceCancel()}>
              כן, בטלו את השולחן
            </Button>
          </div>
          <DrawerFooter>
            <Button type="button" variant="outline" className="h-12" onClick={() => setConfirming(null)}>
              ביטול
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
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
function AdminAvatarsUpload({ count, onUploaded }: { count: number; onUploaded: () => void }) {
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
      onUploaded();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="הוספת דמות"
      description="דמות חדשה בלי לגעת בקוד. רק אתם רואים את זה."
    >
      <form
        action={upload}
        className="flex flex-col gap-4"
        key={count}
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

    </Section>
  );
}
