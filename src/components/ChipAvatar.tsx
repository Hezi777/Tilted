"use client";

import Image from "next/image";
import { AVATAR_KEYS, avatarKeyForPerson, isAvatarKey } from "@/lib/avatar";
import { cn } from "@/lib/utils";

/**
 * Where the new art will live. Until it exists, each key falls back to one of the old
 * chip characters so the app keeps rendering -- delete PLACEHOLDER and the `?? ` below
 * in the same commit that adds `public/art/avatar-*.webp`.
 */
const PLACEHOLDER: Record<string, string> = Object.fromEntries(
  AVATAR_KEYS.map((key, index) => [
    key,
    `/art/chip-${String(index + 1).padStart(2, "0")}.png`,
  ]),
);

function avatarSrc(key: string): string {
  return PLACEHOLDER[key] ?? PLACEHOLDER[AVATAR_KEYS[0]];
}

export function deterministicChipKey(
  value: string | null | undefined,
  personId: string | null | undefined,
): string {
  if (isAvatarKey(value)) return value;
  return personId ? avatarKeyForPerson(personId) : AVATAR_KEYS[0];
}

export function ChipAvatar({
  avatarKey,
  personId,
  name,
  className,
}: {
  avatarKey?: string | null;
  personId?: string | null;
  name: string;
  className?: string;
}) {
  const chipKey = deterministicChipKey(avatarKey, personId);
  return (
    <div className={cn("relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink-700 shadow-[0_8px_18px_-9px_rgb(0_0_0/0.95)]", className)}>
      <Image
        src={avatarSrc(chipKey)}
        alt=""
        fill
        sizes="64px"
        className="object-cover"
      />
      <span className="sr-only">{name}</span>
    </div>
  );
}
