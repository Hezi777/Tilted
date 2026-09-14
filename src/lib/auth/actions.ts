"use server";

/**
 * Sign-in, sign-up and sign-out as server actions (build plan M10).
 *
 * Email and password only, by the product owner's decision: it needs no OAuth consent
 * screen and no email sender, so nothing in the runtime path costs money.
 *
 * These exist so the screens can be ours. `@neondatabase/auth-ui` would have supplied
 * them as vendor components, which AGENTS.md forbids and whose RTL behaviour is
 * unproven — the session machinery is theirs, every pixel is ours.
 */

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { safeNextPath } from "@/lib/auth/redirect";
import { ensurePersonForUser } from "@/db/identity-queries";

export interface AuthActionState {
  error: string | null;
}

const credentials = z.object({
  email: z.string().trim().email("כתובת אימייל לא תקינה"),
  password: z.string().min(8, "סיסמה של 8 תווים לפחות"),
});

const signUpInput = credentials.extend({
  name: z.string().trim().min(1, "צריך שם").max(100),
});

function firstIssue(error: z.ZodError): string {
  const flat = z.flattenError(error);
  return (
    flat.formErrors[0] ??
    Object.values(flat.fieldErrors).flat().find(Boolean) ??
    "קלט לא תקין"
  );
}

export async function signUpAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = signUpInput.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors;
    return {
      error:
        flat.name?.[0] ??
        flat.email?.[0] ??
        flat.password?.[0] ??
        firstIssue(parsed.error),
    };
  }

  const { error, data } = await auth.signUp.email(parsed.data);
  if (error) return { error: error.message ?? "ההרשמה נכשלה" };

  // The roster is now made of accounts, so the Person exists from the first second.
  if (data?.user) await ensurePersonForUser(data.user.id, parsed.data.name);
  redirect(safeNextPath(formData.get("next")));
}

export async function signInAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { error } = await auth.signIn.email(parsed.data);
  // Deliberately not distinguishing a wrong password from an unknown address.
  if (error) return { error: "האימייל או הסיסמה לא נכונים" };
  redirect(safeNextPath(formData.get("next")));
}

export async function signOutAction(): Promise<void> {
  await auth.signOut();
  redirect("/auth/sign-in");
}

/**
 * Password reset, by emailed passcode rather than emailed link.
 *
 * A link is the usual shape and it is the wrong one here. Tilted is installed to the
 * home screen; a reset link opened from a mail app launches the system browser, which
 * is a different context with none of the app's cookies, so the person ends up signed
 * in somewhere that is not the app they were trying to get back into. A six-digit code
 * is typed into the screen already open in front of them.
 *
 * The mail itself is sent by Neon Auth's shared sender, so this adds no email provider
 * and nothing to the runtime bill.
 *
 * Both calls go straight to the auth service rather than through our own
 * `/api/auth/[...path]` proxy: neither needs a session, and a server action calling
 * back into its own app's HTTP layer to reach an upstream is a round trip for nothing.
 */
async function authService(path: string, body: unknown): Promise<string | null> {
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  if (!baseUrl) return "שירות ההתחברות אינו מוגדר";
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) return null;
    const detail = (await response.json().catch(() => null)) as
      | { message?: string }
      | null;
    return detail?.message ?? "הפעולה נכשלה. נסו שוב";
  } catch {
    return "לא הצלחנו להגיע לשירות ההתחברות. נסו שוב בעוד רגע";
  }
}

/**
 * Google sign-in.
 *
 * Uses the OAuth credentials Neon Auth already provides on this project as a "shared"
 * provider, so there is no Google Cloud project to create and nothing to configure or
 * keep alive. The visible cost of that: the consent screen names Neon rather than
 * Tilted. For a table of friends who were sent the link personally that is a fair
 * trade for never having to run a client secret.
 *
 * No Person has to be created here. `requireViewer`/`getViewer` call
 * `ensurePersonForUser` on the first authenticated request, so a Google account lands
 * in the roster by the same path an email account does, carrying the name Google gives.
 */
export async function signInWithGoogleAction(formData: FormData): Promise<void> {
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000");
  if (!baseUrl) redirect("/auth/sign-in?unavailable=1");

  const nextPath = safeNextPath(formData.get("next"));
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/sign-in/social`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "google",
      callbackURL: new URL(nextPath, appUrl).toString(),
    }),
  }).catch(() => null);

  const payload = (await response?.json().catch(() => null)) as
    | { url?: string }
    | null;
  if (!payload?.url) redirect("/auth/sign-in?unavailable=1");
  redirect(payload.url);
}

const emailOnly = z.object({
  email: z.string().trim().email("כתובת אימייל לא תקינה"),
});

export async function requestPasswordResetAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = emailOnly.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  // The answer is the same whether or not the address has an account, so this screen
  // cannot be used to find out who is registered.
  await authService("email-otp/request-password-reset", parsed.data);
  return { error: null };
}

const resetInput = emailOnly.extend({
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "הקוד הוא שש ספרות"),
  password: z.string().min(8, "סיסמה של 8 תווים לפחות"),
});

export async function resetPasswordAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = resetInput.safeParse({
    email: formData.get("email"),
    otp: formData.get("otp"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const failure = await authService("email-otp/reset-password", parsed.data);
  if (failure) return { error: "הקוד לא נכון או שפג תוקפו. בקשו קוד חדש" };

  // Straight in, rather than back to a form asking for the password just chosen.
  const { error } = await auth.signIn.email({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) redirect("/auth/sign-in");
  redirect(safeNextPath(formData.get("next")));
}
