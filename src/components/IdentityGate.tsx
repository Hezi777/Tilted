"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ChipAvatar } from "@/components/ChipAvatar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch, ApiError, type PersonSummary } from "@/lib/api";
import { setIdentity, useIdentity } from "@/lib/identity";

/**
 * First run: this browser says which friend is holding it, before it can open a
 * table. Without it the host is guessed from roster order, which seats the wrong
 * person first and hands them the host's write permission.
 */
export function IdentityGate({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  const identity = useIdentity();
  const [people, setPeople] = useState<PersonSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    if (identity !== null) return;
    let cancelled = false;
    apiFetch<{ people: PersonSummary[] }>("/api/people")
      .then((data) => {
        if (!cancelled) setPeople(data.people);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setLoadError(reason instanceof ApiError ? reason.message : "שגיאה בטעינת השחקנים");
      });
    return () => {
      cancelled = true;
    };
  }, [identity, retryCount]);

  function choose(person: PersonSummary) {
    setIdentity({ id: person.id, name: person.name });
  }

  async function addSelf() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setAdding(true);
    setAddError(null);
    try {
      const person = await apiFetch<PersonSummary>("/api/people", {
        method: "POST",
        body: JSON.stringify({ name: trimmed }),
      });
      setAddOpen(false);
      setNewName("");
      choose(person);
    } catch (reason) {
      setAddError(reason instanceof ApiError ? reason.message : "ההוספה נכשלה");
    } finally {
      setAdding(false);
    }
  }

  if (identity === undefined) return null;
  if (identity !== null) return <>{children}</>;

  return (
    <main className="flex flex-1 flex-col gap-6 px-5 pt-12 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <header className="text-center">
        <h1 className="font-display text-3xl">מי אתה?</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          בוחרים את השם שלכם פעם אחת. מכאן כל שולחן שתפתחו ייפתח על השם הזה.
        </p>
      </header>

      {people === null && !loadError && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      )}

      {loadError && (
        <div className="flex flex-col items-start gap-2 rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              setLoadError(null);
              setRetryCount((count) => count + 1);
            }}
          >
            נסה שוב
          </Button>
        </div>
      )}

      {people !== null && (
        <div className="row-list casino-panel overflow-hidden rounded-[20px]">
          {people.map((person, index) => (
            <motion.button
              key={person.id}
              type="button"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: reduceMotion ? 0 : index * 0.03 }}
              whileTap={reduceMotion ? undefined : { scale: 0.98 }}
              onClick={() => choose(person)}
              className="flex min-h-[4.5rem] w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-white/3"
            >
              <ChipAvatar personId={person.id} name={person.name} className="size-12" />
              <span className="truncate text-base font-semibold">{person.name}</span>
              {person.nickname && (
                <span className="truncate text-sm text-muted-foreground">{person.nickname}</span>
              )}
            </motion.button>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        className="min-h-12"
        onClick={() => setAddOpen(true)}
      >
        אני לא ברשימה
      </Button>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>איך קוראים לך?</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            className="h-12 rounded-xl px-4"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addSelf();
            }}
            placeholder="השם שלכם"
          />
          {addError && <p className="text-destructive text-sm">{addError}</p>}
          <DialogFooter>
            <Button
              type="button"
              className="min-h-12"
              disabled={!newName.trim() || adding}
              onClick={() => void addSelf()}
            >
              {adding ? "שומרים..." : "זה אני"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
