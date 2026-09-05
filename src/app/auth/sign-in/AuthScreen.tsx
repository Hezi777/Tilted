"use client";

import { useActionState, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  signInAction,
  signUpAction,
  type AuthActionState,
} from "@/lib/auth/actions";

type Mode = "sign-in" | "sign-up";

const INITIAL: AuthActionState = { error: null };

/**
 * The gate. Every screen behind it needs an account now, so this is the first thing a
 * new player sees — built from our own shadcn primitives rather than the vendor auth
 * UI, so it looks like the rest of the app and reads correctly in Hebrew.
 */
export function AuthScreen({ nextPath = "/" }: { nextPath?: string }) {
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [signInState, runSignIn, signingIn] = useActionState(
    signInAction,
    INITIAL,
  );
  const [signUpState, runSignUp, signingUp] = useActionState(
    signUpAction,
    INITIAL,
  );

  const isSignUp = mode === "sign-up";
  const pending = isSignUp ? signingUp : signingIn;
  const error = isSignUp ? signUpState.error : signInState.error;

  return (
    <main className="flex flex-1 flex-col justify-center gap-7 px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-10">
      <header className="text-center">
        <h1 className="font-display text-3xl">
          {isSignUp ? "פותחים חשבון" : "מתחברים"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {isSignUp
            ? "החשבון שומר את הערבים, הרצפים והחשבון שלכם."
            : "ברוכים השבים לשולחן."}
        </p>
      </header>

      <motion.form
        key={mode}
        action={isSignUp ? runSignUp : runSignIn}
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="flex flex-col gap-4"
      >
        <input type="hidden" name="next" value={nextPath} />
        {isSignUp && (
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-bold" htmlFor="name">
              איך קוראים לכם?
            </Label>
            <Input
              id="name"
              name="name"
              autoComplete="name"
              required
              className="h-12 rounded-xl px-4"
              placeholder="השם שיופיע בשולחן"
            />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label className="text-sm font-bold" htmlFor="email">
            אימייל
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            dir="ltr"
            className="h-12 rounded-xl px-4 text-start"
            placeholder="you@example.com"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label className="text-sm font-bold" htmlFor="password">
            סיסמה
          </Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            required
            minLength={8}
            dir="ltr"
            className="h-12 rounded-xl px-4 text-start"
            aria-describedby={isSignUp ? "password-hint" : undefined}
          />
          {isSignUp && (
            <p id="password-hint" className="text-xs text-muted-foreground">
              לפחות 8 תווים.
            </p>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={pending}
          className="h-14 w-full text-base font-bold"
        >
          {pending
            ? isSignUp
              ? "פותחים חשבון..."
              : "מתחברים..."
            : isSignUp
              ? "פתחו חשבון"
              : "התחברו"}
        </Button>
      </motion.form>

      <Button
        type="button"
        variant="ghost"
        className="min-h-11 text-muted-foreground hover:text-foreground"
        onClick={() => setMode(isSignUp ? "sign-in" : "sign-up")}
      >
        {isSignUp ? "כבר יש לכם חשבון? התחברו" : "אין לכם חשבון? פתחו אחד"}
      </Button>
    </main>
  );
}
