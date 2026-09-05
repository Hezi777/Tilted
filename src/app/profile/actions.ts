"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { updateProfile } from "@/db/identity-queries";
import { getViewer } from "@/lib/auth/session";

export interface ProfileActionState {
  error: string | null;
  saved: boolean;
}

const profileInput = z.object({
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

export async function saveProfileAction(
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const viewer = await getViewer();
  if (!viewer) return { error: "צריך להתחבר כדי להמשיך", saved: false };

  const parsed = profileInput.safeParse({
    name: formData.get("name"),
    nickname: formData.get("nickname") ?? undefined,
    phone: formData.get("phone") ?? undefined,
  });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors;
    return {
      error: flat.name?.[0] ?? flat.phone?.[0] ?? "קלט לא תקין",
      saved: false,
    };
  }

  await updateProfile(viewer.userId, {
    name: parsed.data.name,
    nickname: parsed.data.nickname?.trim() || null,
    phone: parsed.data.phone?.trim() || null,
  });
  revalidatePath("/profile");
  return { error: null, saved: true };
}
