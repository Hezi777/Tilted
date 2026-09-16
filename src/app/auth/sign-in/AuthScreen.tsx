"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleIcon } from "@/components/icons";
import {
  signInAction,
  signInWithGoogleAction,
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
export function AuthScreen({
  nextPath = "/",
  unavailable = false,
}: {
  nextPath?: string;
  unavailable?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  // Somebody arriving from a room link is almost always new -- an existing player
  // already has the app on their home screen. Opening on the sign-in tab sent the most
  // common arrival of all to the wrong half of the form.
  const invited = nextPath.startsWith("/join");
  const [mode, setMode] = useState<Mode>(invited ? "sign-up" : "sign-in");
  const [showPassword, setShowPassword] = useState(false);
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
      {/* The gate is the first screen a friend who tapped a WhatsApp link ever sees,
          and it used to be a bare form on black while the home screen carried a
          masthead and a glow. Someone arriving here has no idea yet what this is. */}
      <header className="relative text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-16 h-56 focal-glow"
        />
        <div className="relative flex flex-col items-center gap-3">
          <div className="flex items-center gap-2.5">
            <Image
              src="/art/logo.svg"
              alt=""
              width={40}
              height={96}
              priority
              className="h-11 w-auto shrink-0"
            />
            <span className="t-display leading-[0.92] text-start">
              TILTED
              <span className="block text-[var(--text-2)]">POKER</span>
            </span>
          </div>
          <h1 className="t-title">
            {invited
              ? "הוזמנתם לשולחן"
              : isSignUp
                ? "פותחים חשבון"
                : "מתחברים"}
          </h1>
          <p className="t-body ink-2 max-w-[30ch]">
            {invited
              ? "עוד חשבון אחד ואתם בפנים. הכניסות, הריביים והחשבון מסתדרים לבד."
              : isSignUp
                ? "החשבון שומר את הערבים, הרצפים והחשבון שלכם."
                : "ברוכים השבים לשולחן."}
          </p>
        </div>
      </header>

      {unavailable && (
        // Not an error the person made, and not one retrying the form will clear --
        // so it says what happened rather than showing a red field validation.
        <p
          role="status"
          className="surface-card t-body rounded-[20px] px-4 py-3 text-[var(--text-1)]"
        >
          לא הצלחנו להגיע לשירות ההתחברות כרגע. נסו שוב בעוד רגע.
        </p>
      )}

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
            <Label className="t-label" htmlFor="name">
              איך קוראים לכם?
            </Label>
            <Input
              id="name"
              name="name"
              autoComplete="name"
              required
              placeholder="השם שיופיע בשולחן"
            />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label className="t-label" htmlFor="email">
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
            className="text-start"
            placeholder="you@example.com"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label className="t-label" htmlFor="password">
            סיסמה
          </Label>
          {/* dir="ltr" on the wrapper, not just on the input. The field's text is LTR and
                starts at the left, so the reveal button belongs at the right -- but the
                page is RTL, where `end-*` resolves to the left and would put the button
                exactly where the password begins. Matching the wrapper's direction to
                the input's makes both logical properties resolve against the same axis.
                This is the AGENTS.md rule about mixing direction contexts, one level up
                from the transform case it names. */}
            <div dir="ltr" className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              required
              minLength={8}
              dir="ltr"
              className="pe-24 text-start"
              aria-describedby={isSignUp ? "password-hint" : undefined}
            />
            {/* Typed one-handed in a dim room. Checking it beats a failed sign-in and
                a generic "the email or password is wrong". Raised from size="sm" (40px)
                to clear the 44px floor; centered on the input's height rather than
                inset from its edges now that the button is taller than the field. */}
            <Button
              type="button"
              variant="ghost"
              className="absolute top-1/2 end-1 -translate-y-1/2"
              aria-pressed={showPassword}
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? "הסתרה" : "הצגה"}
            </Button>
          </div>
          {isSignUp && (
            <p id="password-hint" className="t-caption ink-3">
              לפחות 8 תווים.
            </p>
          )}
          {!isSignUp && (
            <Button asChild variant="ghost" size="sm" className="self-start">
              <Link href={`/auth/reset?next=${encodeURIComponent(nextPath)}`}>
                שכחתם סיסמה?
              </Link>
            </Button>
          )}
        </div>

        {error && (
          <p role="alert" className="t-body text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending
            ? isSignUp
              ? "פותחים חשבון..."
              : "מתחברים..."
            : isSignUp
              ? "פתחו חשבון"
              : "התחברו"}
        </Button>
      </motion.form>

      {/* One tap, no password to forget, and the same account whichever button was
          used last time -- the address is what identifies a person, not the method. */}
      <div className="flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-[var(--glass-1)]" />
        <span className="t-caption ink-3">או</span>
        <span className="h-px flex-1 bg-[var(--glass-1)]" />
      </div>

      <form action={signInWithGoogleAction}>
        <input type="hidden" name="next" value={nextPath} />
        <Button type="submit" variant="secondary" size="lg" className="w-full">
          <GoogleIcon aria-hidden="true" />
          המשך עם Google
        </Button>
      </form>

      <Button
        type="button"
        variant="ghost"
        onClick={() => setMode(isSignUp ? "sign-in" : "sign-up")}
      >
        {isSignUp ? "כבר יש לכם חשבון? התחברו" : "אין לכם חשבון? פתחו אחד"}
      </Button>
    </main>
  );
}
