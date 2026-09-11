"use client";

import { animate, useMotionValue, useMotionValueEvent, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { agorot, formatILS, formatSignedILS } from "@/lib/money";
import { DUR, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

function moneyText(value: number, signed: boolean): string {
  return signed ? formatSignedILS(agorot(value)) : formatILS(agorot(value));
}

export function Money({
  value,
  signed = false,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children" | "dir"> & {
  value: number;
  signed?: boolean;
}) {
  return (
    <span dir="ltr" className={cn("money inline-block", className)} {...props}>
      {moneyText(value, signed)}
    </span>
  );
}

export function AnimatedMoney({
  value,
  signed = false,
  from,
  delay = 0,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children" | "dir"> & {
  value: number;
  signed?: boolean;
  from?: number;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();
  const motionValue = useMotionValue(from ?? value);
  const ref = useRef<HTMLSpanElement>(null);

  /* The mount-time text, and the only text React ever renders here. Every later
     value is written straight to the node below.

     A count is ~36 frames. Routing those through `setState` re-rendered this
     component once per frame, and settlement mounts one instance per player plus
     the pot -- all counting at once, on top of confetti, on the slowest screen in
     the app. The motion value is already the source of truth for the number, so
     React does not need to hear about the intermediate ones. Keeping the child
     expression constant is what stops React from clobbering the node's text on a
     parent re-render. */
  const [initialText] = useState(() => moneyText(from ?? value, signed));

  useMotionValueEvent(motionValue, "change", (latest) => {
    // This interpolation is display-only; persisted money remains integer agorot.
    const node = ref.current;
    if (node) node.textContent = moneyText(Math.round(latest), signed);
  });

  useEffect(() => {
    if (reduceMotion || from === value) {
      motionValue.set(value);
      return;
    }
    const controls = animate(motionValue, value, {
      duration: DUR.count,
      delay,
      ease: EASE_OUT,
    });
    return () => controls.stop();
  }, [delay, from, motionValue, reduceMotion, value]);

  return (
    <span ref={ref} dir="ltr" className={cn("money inline-block", className)} {...props}>
      {initialText}
    </span>
  );
}
