"use client";

import { animate, useMotionValue, useMotionValueEvent, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { agorot, formatILS, formatSignedILS } from "@/lib/money";
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
  const [displayValue, setDisplayValue] = useState(from ?? value);

  useMotionValueEvent(motionValue, "change", (latest) => {
    // This interpolation is display-only; persisted money remains integer agorot.
    setDisplayValue(Math.round(latest));
  });

  useEffect(() => {
    if (reduceMotion || from === value) {
      motionValue.set(value);
      return;
    }
    const controls = animate(motionValue, value, {
      duration: 0.6,
      delay,
      ease: [0.2, 0.8, 0.2, 1],
    });
    return () => controls.stop();
  }, [delay, from, motionValue, reduceMotion, value]);

  return (
    <span dir="ltr" className={cn("money inline-block", className)} {...props}>
      {moneyText(displayValue, signed)}
    </span>
  );
}
