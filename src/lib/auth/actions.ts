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
