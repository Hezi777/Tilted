"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  detachAndDeletePerson,
  updateProfile,
} from "@/db/identity-queries";
import { AVATAR_KEYS } from "@/lib/avatar";
import { MAX_SPOTS, MIN_SPOTS } from "@/lib/chip-art";
import { auth } from "@/lib/auth/server";
import { getViewer } from "@/lib/auth/session";

export interface ProfileActionState {
  error: string | null;
  saved: boolean;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

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
 * The chip a person is at every table.
 *
 * The database carries the same CHECKs, which is deliberate: this validation exists to
 * give a Hebrew error, and the constraints exist so no path that skips this function can
 * write a colour the renderer cannot parse.
 */
const chipInput = z.object({
  chipBody: z.string().trim().regex(HEX, "צבע לא תקין"),
  chipEdge: z.string().trim().regex(HEX, "צבע לא תקין").optional(),
  chipSpots: z.coerce.number().int().min(MIN_SPOTS).max(MAX_SPOTS),
  // Two characters at most, because that is what fits the pressed inlay legibly.
  chipInitials: z.string().trim().max(2).optional(),
  avatarKey: z.enum(AVATAR_KEYS).optional(),
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

  const parsed = chipInput.safeParse({
    chipBody: formData.get("chipBody"),
    chipEdge: formData.get("chipEdge") ?? undefined,
    chipSpots: formData.get("chipSpots"),
    chipInitials: formData.get("chipInitials") ?? undefined,
    avatarKey: formData.get("avatarKey") ?? undefined,
  });
  if (!parsed.success) return { error: firstError(parsed.error), saved: false };

  await updateProfile(viewer.userId, {
    chipBody: parsed.data.chipBody,
    // Null means "derive from the body", which is what deriveEdgeColor() does — so an
    // empty field is a real choice here, not a missing value.
    chipEdge: parsed.data.chipEdge || null,
    chipSpots: parsed.data.chipSpots,
    chipInitials: parsed.data.chipInitials || null,
    avatarKey: parsed.data.avatarKey ?? null,
  });
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
