"use client";

/**
 * Add/edit/remove the denominations of one chip set: colour, value (entered in
 * shekels, converted to agorot at the edge via `shekelsToAgorot`), and an optional
 * chip image. Controlled component — the parent owns persistence (create/update
 * against /api/chip-sets) and gets every change through `onChange`.
 */

import * as React from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { shekelsToAgorot } from "@/lib/money";
import { cn } from "@/lib/utils";

const IMAGE_OPTIONS: Array<{ key: string | null; label: string }> = [
  { key: null, label: "ללא" },
  { key: "buyin-20.webp", label: "20" },
  { key: "buyin-30.webp", label: "30" },
  { key: "buyin-50.webp", label: "50" },
  { key: "buyin-100.webp", label: "100" },
  { key: "buyin-custom.webp", label: "מותאם" },
];

const DEFAULT_COLOR = "#B8A9A2";

/** One denomination row while being edited. `value` is agorot, 0 while invalid. */
export interface ChipSetDenominationDraft {
  id: string;
  color: string;
  valueText: string;
  value: number;
  imageKey: string | null;
}

export interface ChipSetEditorValue {
  name: string;
  denominations: ChipSetDenominationDraft[];
}

function parseValueText(valueText: string): number {
  const normalized = valueText.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return 0;
  try {
    return Number(shekelsToAgorot(Number(normalized)));
  } catch {
    return 0;
  }
}

/** Builds an empty row for "הוסף ז׳יטון". */
export function createEmptyDenomination(): ChipSetDenominationDraft {
  return {
    id: crypto.randomUUID(),
    color: DEFAULT_COLOR,
    valueText: "",
    value: 0,
    imageKey: null,
  };
}

interface ChipSetEditorProps {
  value: ChipSetEditorValue;
  onChange: (value: ChipSetEditorValue) => void;
  disabled?: boolean;
  className?: string;
}

export function ChipSetEditor({
  value,
  onChange,
  disabled,
  className,
}: ChipSetEditorProps) {
  function updateDenomination(
    id: string,
    patch: Partial<ChipSetDenominationDraft>,
  ) {
    onChange({
      ...value,
      denominations: value.denominations.map((denomination) =>
        denomination.id === id ? { ...denomination, ...patch } : denomination,
      ),
    });
  }

  function removeDenomination(id: string) {
    onChange({
      ...value,
      denominations: value.denominations.filter(
        (denomination) => denomination.id !== id,
      ),
    });
  }

  function addDenomination() {
    onChange({
      ...value,
      denominations: [...value.denominations, createEmptyDenomination()],
    });
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="chip-set-name">שם חבילה</Label>
        <Input
          id="chip-set-name"
          value={value.name}
          disabled={disabled}
          placeholder="לדוגמה: חבילת הבית"
          onChange={(event) =>
            onChange({ ...value, name: event.target.value })
          }
        />
      </div>

      <div className="flex flex-col gap-3">
        {value.denominations.map((denomination, index) => (
          <div
            key={denomination.id}
            className="flex flex-col gap-2 rounded-[14px] border border-foreground/8 bg-surface-2 p-3"
          >
            <div className="flex items-center gap-3">
              <Label
                htmlFor={`chip-color-${denomination.id}`}
                className="sr-only"
              >
                צבע ז׳יטון {index + 1}
              </Label>
              <input
                id={`chip-color-${denomination.id}`}
                type="color"
                value={denomination.color}
                disabled={disabled}
                onChange={(event) =>
                  updateDenomination(denomination.id, {
                    color: event.target.value,
                  })
                }
                className="size-11 shrink-0 cursor-pointer rounded-full border border-foreground/15 bg-transparent p-0"
              />
              <Input
                aria-label={`ערך ז׳יטון ${index + 1} בשקלים`}
                className="money min-w-0 flex-1 text-end"
                inputMode="decimal"
                placeholder="0"
                disabled={disabled}
                value={denomination.valueText}
                onChange={(event) => {
                  const valueText = event.target.value;
                  updateDenomination(denomination.id, {
                    valueText,
                    value: parseValueText(valueText),
                  });
                }}
              />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="size-11 shrink-0 rounded-full"
                disabled={disabled}
                aria-label="הסר ז׳יטון"
                onClick={() => removeDenomination(denomination.id)}
              >
                ✕
              </Button>
            </div>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={denomination.imageKey ?? "none"}
              disabled={disabled}
              onValueChange={(next) => {
                if (!next) return;
                updateDenomination(denomination.id, {
                  imageKey: next === "none" ? null : next,
                });
              }}
            >
              {IMAGE_OPTIONS.map((option) => (
                <ToggleGroupItem
                  key={option.key ?? "none"}
                  value={option.key ?? "none"}
                  aria-label={`תמונה ${option.label}`}
                  className="h-12 min-w-12 gap-1.5 px-2"
                >
                  {option.key ? (
                    <Image
                      src={`/art/${option.key}`}
                      alt=""
                      width={32}
                      height={32}
                      className="size-8 object-contain"
                    />
                  ) : null}
                  <span className={option.key ? "sr-only" : undefined}>{option.label}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        className="h-12"
        disabled={disabled}
        onClick={addDenomination}
      >
        הוסף ז׳יטון
      </Button>
    </div>
  );
}
