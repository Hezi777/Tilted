"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  requestPasswordResetAction,
  resetPasswordAction,
  type AuthActionState,
} from "@/lib/auth/actions";

const INITIAL: AuthActionState = { error: null };

/**
 * Getting back in after forgetting the password.
 *
 * Two steps on one screen rather than two routes, because the second step needs the
 * address typed into the first and a person switching to their mail app and back must
 * return to the same place they left. A passcode, not a link, for the reason recorded
 * in `src/lib/auth/actions.ts`: a link opened from mail lands in the system browser
 * rather than in the installed app.
 */
export function ResetScreen({ nextPath = "/" }: { nextPath?: string }) {
  const reduceMotion = useReducedMotion();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [requestState, runRequest, requesting] = useActionState(
    async (previous: AuthActionState, formData: FormData) => {
      const result = await requestPasswordResetAction(previous, formData);
      if (!result.error) setSent(true);
      return result;
    },
    INITIAL,
  );
  const [resetState, runReset, resetting] = useActionState(
    resetPasswordAction,
    INITIAL,
  );

  return (
    <main className="flex flex-1 flex-col justify-center gap-7 px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-10">
      <header className="text-center">
        <h1 className="t-display-l">הגדרת סיסמה</h1>
        <p className="t-body ink-2 mt-2">
          {sent
            ? `שלחנו קוד בן שש ספרות ל${email}. הוא תקף לזמן קצר.`
            : "נשלח לכם קוד לאימות האימייל ותבחרו סיסמה. גם אם התחלתם עם Google, זה אותו חשבון וכל הערבים נשמרים."}
        </p>
      </header>

      {!sent ? (
        <motion.form
          action={runRequest}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-2">
            <Label className="t-label" htmlFor="reset-email">
              אימייל
            </Label>
            <Input
              id="reset-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              dir="ltr"
              className="text-start"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          {requestState.error && (
            <p role="alert" className="t-body text-destructive">
              {requestState.error}
            </p>
          )}

          <Button type="submit" size="lg" disabled={requesting} className="w-full">
            {requesting ? "שולחים..." : "שלחו לי קוד"}
          </Button>
        </motion.form>
      ) : (
        <motion.form
          action={runReset}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="next" value={nextPath} />

          <div className="flex flex-col gap-2">
            <Label className="t-label" htmlFor="reset-otp">
              הקוד מהאימייל
            </Label>
            {/* Digits, and the numeric keypad rather than the full keyboard. `ltr`
                because a code is a number, and numbers are never mirrored. */}
            <Input
              id="reset-otp"
              name="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              dir="ltr"
              className="money text-start tracking-[0.3em]"
              placeholder="123456"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="t-label" htmlFor="reset-password">
              סיסמה חדשה
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
                id="reset-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                dir="ltr"
                className="pe-24 text-start"
                aria-describedby="reset-password-hint"
              />
              {/* Typed one-handed in a dim room, so it can be checked before sending.
                  Raised from size="sm" (40px) to clear the 44px floor; centered on the
                  input's height rather than inset from its edges now that the button is
                  taller than the field. */}
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
            <p id="reset-password-hint" className="t-caption ink-3">
              לפחות 8 תווים.
            </p>
          </div>

          {resetState.error && (
            <p role="alert" className="t-body text-destructive">
              {resetState.error}
            </p>
          )}

          <Button type="submit" size="lg" disabled={resetting} className="w-full">
            {resetting ? "מעדכנים..." : "עדכנו סיסמה והיכנסו"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            onClick={() => setSent(false)}
          >
            לא הגיע קוד? נסו כתובת אחרת
          </Button>
        </motion.form>
      )}

      <Button asChild variant="ghost">
        <Link href="/auth/sign-in">חזרה להתחברות</Link>
      </Button>
    </main>
  );
}
