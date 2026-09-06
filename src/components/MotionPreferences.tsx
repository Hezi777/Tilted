"use client";

import { MotionConfig } from "framer-motion";
import { useEffect } from "react";
import { setHapticsEnabled } from "@/lib/motion";

/**
 * Applies the two motion preferences the profile screen has always offered and nothing
 * has ever read.
 *
 * `reduceMotion` reaches Framer through `MotionConfig`, so every `useReducedMotion()`
 * in the app answers the account setting as well as the OS one, and it reaches CSS
 * through `data-reduce-motion` on `<html>` (see `globals.css`). `hapticsEnabled` is
 * pushed into `lib/motion` because the buzz sites are event handlers, not components.
 */
export function MotionPreferences({
  hapticsEnabled,
  reduceMotion,
  children,
}: {
  hapticsEnabled: boolean;
  reduceMotion: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    setHapticsEnabled(hapticsEnabled);
  }, [hapticsEnabled]);

  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>
      {children}
    </MotionConfig>
  );
}
