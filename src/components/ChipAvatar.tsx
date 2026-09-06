"use client";

import Image from "next/image";
import {
  DEFAULT_AVATAR_KEY,
  avatarKeyForPerson,
  avatarSrc,
  isAvatarKey,
} from "@/lib/avatar";
import { cn } from "@/lib/utils";

export function deterministicChipKey(
  value: string | null | undefined,
  personId: string | null | undefined,
): string {
  if (isAvatarKey(value)) return value;
  return personId ? avatarKeyForPerson(personId) : DEFAULT_AVATAR_KEY;
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
    // Not cropped to a circle. The character is a whole little figure with stub arms
    // and legs, and a circular mask amputates them -- the chip body is already round
    // enough to read as an avatar without one.
    <div className={cn("relative flex size-16 shrink-0 items-center justify-center", className)}>
      <Image
        src={avatarSrc(chipKey)}
        alt=""
        fill
        sizes="64px"
        className="object-contain drop-shadow-[0_6px_10px_rgb(0_0_0/0.55)]"
      />
      <span className="sr-only">{name}</span>
    </div>
  );
}
