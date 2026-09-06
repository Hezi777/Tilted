"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  detachAndDeletePerson,
  updateProfile,
} from "@/db/identity-queries";
import { AVATAR_KEYS } from "@/lib/avatar";
import { auth } from "@/lib/auth/server";
import { getViewer } from "@/lib/auth/session";

export interface ProfileActionState {
  error: string | null;
  saved: boolean;
}

const identityInput = z.object({
  name: z.string().trim().min(1, "צריך שם").max(100),
  nickname: z.string().trim().max(100).optional(),
  // Israeli mobile, however the owner chose to type it. Normalising is the payment
  // hand-off's job (src/lib/bit.ts), not the profile's — this only refuses nonsense.
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{0,20}$/, "מספר טלפון לא תקין")
    .optional(),
});

/**
 * The character a person is at every table.
 *
 * One of the twelve committed avatars and nothing else -- anything unrecognised is
 * discarded rather than stored, so the avatar path can never be asked for a file that
 * is not there.
 */
const avatarInput = z.object({
  avatarKey: z.enum(AVATAR_KEYS),
});

const preferencesInput = z.object({
  // Agorot, like every other amount in this app. Empty clears the default.
  defaultBuyIn: z
    .union([z.coerce.number().int().positive().max(100_000_000), z.literal("")])
    .optional(),
  defaultChipSetId: z.union([z.uuid(), z.literal("")]).optional(),
  hapticsEnabled: z.coerce.boolean(),
  reduceMotion: z.coerce.boolean(),
});

function firstError(error: z.ZodError, fallback = "קלט לא תקין"): string {
  const flat = z.flattenError(error);
  const fieldMessages = Object.values(flat.fieldErrors)
    .flat()
    .filter((message): message is string => typeof message === "string");
  return fieldMessages[0] ?? flat.formErrors[0] ?? fallback;
}

export async function saveIdentityAction(
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "צריך להתחבר כדי להמשיך", saved: false };

  const parsed = identityInput.safeParse({
    name: formData.get("name"),
    nickname: formData.get("nickname") ?? undefined,
    phone: formData.get("phone") ?? undefined,
  });
  if (!parsed.success) return { error: firstError(parsed.error), saved: false };

  await updateProfile(viewer.userId, {
    name: parsed.data.name,
    nickname: parsed.data.nickname?.trim() || null,
    phone: parsed.data.phone?.trim() || null,
  });
  revalidatePath("/profile");
  return { error: null, saved: true };
}

export async function saveChipAction(
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "צריך להתחבר כדי להמשיך", saved: false };

  const parsed = avatarInput.safeParse({ avatarKey: formData.get("avatarKey") });
  if (!parsed.success) return { error: "דמות לא מוכרת", saved: false };

  await updateProfile(viewer.userId, { avatarKey: parsed.data.avatarKey });
  revalidatePath("/profile");
  return { error: null, saved: true };
}

export async function savePreferencesAction(
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "צריך להתחבר כדי להמשיך", saved: false };

  const parsed = preferencesInput.safeParse({
    defaultBuyIn: formData.get("defaultBuyIn") ?? undefined,
    defaultChipSetId: formData.get("defaultChipSetId") ?? undefined,
    hapticsEnabled: formData.get("hapticsEnabled") === "on",
    reduceMotion: formData.get("reduceMotion") === "on",
  });
  if (!parsed.success) return { error: firstError(parsed.error), saved: false };

  await updateProfile(viewer.userId, {
    defaultBuyIn:
      typeof parsed.data.defaultBuyIn === "number"
        ? parsed.data.defaultBuyIn
        : null,
    defaultChipSetId: parsed.data.defaultChipSetId || null,
    hapticsEnabled: parsed.data.hapticsEnabled,
    reduceMotion: parsed.data.reduceMotion,
  });
  revalidatePath("/profile");
  return { error: null, saved: true };
}

const passwordInput = z.object({
  currentPassword: z.string().min(1, "צריך את הסיסמה הנוכחית"),
  newPassword: z.string().min(8, "סיסמה של 8 תווים לפחות"),
});

/**
 * Changes the password through Neon Auth, which owns the credential.
 *
 * `revokeOtherSessions` is on deliberately: a password change is usually a response to
 * someone else having had the old one, and leaving their session alive would make the
 * change pointless.
 */
export async function changePasswordAction(
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "צריך להתחבר כדי להמשיך", saved: false };

  const parsed = passwordInput.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) return { error: firstError(parsed.error), saved: false };

  const { error } = await auth.changePassword({
    currentPassword: parsed.data.currentPassword,
    newPassword: parsed.data.newPassword,
    revokeOtherSessions: true,
  });
  if (error) {
    return { error: error.message ?? "החלפת הסיסמה נכשלה", saved: false };
  }
  return { error: null, saved: true };
}

/**
 * Removes the account and detaches its Person from every seat it played.
 *
 * The Player rows survive on purpose. They carry the name, chip and seat as they were on
 * the night, and every buy-in and cash-out hangs off them, so removing them would rewrite
 * a settled evening for the four other people who were at that table. Confirmation is a
 * typed word rather than a checkbox, because this is the one action in the app that
 * cannot be undone.
 */
export async function deleteAccountAction(
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "צריך להתחבר כדי להמשיך", saved: false };

  if (String(formData.get("confirm") ?? "").trim() !== "מחיקה") {
    return { error: 'כדי לאשר, כתבו "מחיקה"', saved: false };
  }

  const { error } = await auth.deleteUser({});
  if (error) {
    return { error: error.message ?? "מחיקת החשבון נכשלה", saved: false };
  }

  await detachAndDeletePerson(viewer.userId);
  redirect("/auth/sign-in");
}
