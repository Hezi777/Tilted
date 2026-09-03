"use client";

import Image from "next/image";
import { avatarKeyForPerson } from "@/lib/avatar";
import { cn } from "@/lib/utils";

const CHIP_KEYS = new Set(Array.from({ length: 12 }, (_, index) => `chip-${String(index + 1).padStart(2, "0")}`));

export function deterministicChipKey(
  value: string | null | undefined,
  personId: string | null | undefined,
): string {
  if (value && CHIP_KEYS.has(value)) return value;
  return personId ? avatarKeyForPerson(personId) : "chip-01";
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
    <div className={cn("relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#080305] shadow-[0_8px_18px_-9px_rgb(0_0_0/0.95)] ring-1 ring-ruby/55", className)}>
      <Image
        src={`/art/${chipKey}.png`}
        alt=""
        fill
        sizes="64px"
        className="object-cover"
      />
      <span className="sr-only">{name}</span>
    </div>
  );
}
