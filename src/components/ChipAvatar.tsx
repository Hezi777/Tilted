"use client";

import Image from "next/image";
import { useState } from "react";
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
  const [failed, setFailed] = useState(false);
  const key = deterministicChipKey(avatarKey, personId);
  return (
    <div className={cn("relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gold/15 ring-2 ring-gold/60", className)}>
      {!failed ? (
        <Image
          src={`/art/${key}.png`}
          alt=""
          fill
          sizes="56px"
          className="object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true" className="text-xl font-black text-felt">
          {name.trim().slice(0, 1)}
        </span>
      )}
      <span className="sr-only">{name}</span>
    </div>
  );
}
