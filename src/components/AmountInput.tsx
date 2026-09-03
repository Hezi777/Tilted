"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { agorot, formatILS, shekelsToAgorot, type Agorot } from "@/lib/money";

interface AmountInputProps {
  initialAmount: number | null;
  onChange: (amount: number | null) => void;
  onCommit: (amount: number) => void;
  disabled?: boolean;
  "aria-label"?: string;
}

/** A shekel keypad field whose committed value is always integer agorot. */
export function AmountInput({
  initialAmount,
  onChange,
  onCommit,
  disabled,
  "aria-label": ariaLabel,
}: AmountInputProps) {
  const [text, setText] = React.useState(() =>
    initialAmount === null
      ? ""
      : formatILS(agorot(initialAmount)).replace(/^₪/, ""),
  );

  function parse(value: string): Agorot | null {
    if (!value.trim()) return null;
    const normalized = value.replace(",", ".");
    if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
    try {
      return shekelsToAgorot(Number(normalized));
    } catch {
      return null;
    }
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setText(value);
    const amount = parse(value);
    onChange(amount === null ? null : Number(amount));
  }

  function handleBlur() {
    const amount = parse(text);
    if (amount !== null) onCommit(Number(amount));
  }

  return (
    <Input
      aria-label={ariaLabel}
      className="h-14 min-w-0 rounded-xl border-foreground/15 bg-surface-1/90 text-end text-xl tabular-nums shadow-inner focus-visible:border-ruby focus-visible:ring-ruby/30"
      disabled={disabled}
      inputMode="decimal"
      pattern="[0-9]*[.,]?[0-9]*"
      type="text"
      value={text}
      onBlur={handleBlur}
      onChange={handleChange}
    />
  );
}
