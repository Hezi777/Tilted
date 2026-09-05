"use client";

/**
 * Add/edit/remove the denominations of one chip set.
 *
 * A denomination is two colours and a value. The body and the edge spots are both
 * chosen; the number's ink is derived from them, which is why there is no third control
 * — see `src/lib/chip-art.ts`. Values are entered in shekels and converted to agorot at
 * the edge via `shekelsToAgorot`.
 *
 * Controlled component: the parent owns persistence (create/update against
 * /api/chip-sets) and gets every change through `onChange`.
 */

import * as React from "react";
import { TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PokerChip } from "@/components/PokerChip";
import {
  CHIP_PRESETS,
  DEFAULT_CHIP_BODY,
  DEFAULT_CHIP_EDGE,
} from "@/lib/chip-art";
import { shekelsToAgorot } from "@/lib/money";
import { cn } from "@/lib/utils";

/** One denomination row while being edited. `value` is agorot, 0 while invalid. */
export interface ChipSetDenominationDraft {
  /** The server row id when editing an existing set, so the row survives the update. */
  id: string;
  color: string;
  edgeColor: string;
  valueText: string;
  value: number;
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
    color: DEFAULT_CHIP_BODY,
    edgeColor: DEFAULT_CHIP_EDGE,
    valueText: "",
    value: 0,
  };
}

interface ChipSetEditorProps {
  value: ChipSetEditorValue;
  onChange: (value: ChipSetEditorValue) => void;
  disabled?: boolean;
  className?: string;
}

/** A labelled colour well. Native input, but sized to the app's touch target. */
function ColorWell({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <Label htmlFor={id} className="t-caption ink-3">
        {label}
      </Label>
      <div className="flex items-center gap-2 rounded-[14px] border border-foreground/12 bg-surface-1 ps-2">
        <input
          id={id}
          type="color"
          value={value.toLowerCase()}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="size-8 shrink-0 cursor-pointer rounded-md border-0 bg-transparent p-0 disabled:opacity-50"
        />
        <span className="money ink-2 min-w-0 truncate pe-2 text-xs" dir="ltr">
          {value.toUpperCase()}
        </span>
      </div>
    </div>
  );
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
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
      </div>

      <div className="flex flex-col gap-3">
        {value.denominations.map((denomination, index) => {
          const shekels = denomination.valueText.trim();
          return (
            <div
              key={denomination.id}
              className="flex flex-col gap-3 rounded-[20px] border border-foreground/8 border-t-foreground/14 bg-surface-2 p-3"
            >
              <div className="flex items-center gap-3">
                <PokerChip
                  color={denomination.color}
                  edgeColor={denomination.edgeColor}
                  label={shekels || undefined}
                  className="size-14"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <Label
                    htmlFor={`chip-value-${denomination.id}`}
                    className="t-caption ink-3"
                  >
                    ערך בשקלים
                  </Label>
                  <Input
                    id={`chip-value-${denomination.id}`}
                    className="money text-end"
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
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-11 shrink-0 self-end border-destructive/35 text-destructive"
                  disabled={disabled || value.denominations.length === 1}
                  aria-label={`הסר ז׳יטון ${index + 1}`}
                  onClick={() => removeDenomination(denomination.id)}
                >
                  <TrashIcon aria-hidden="true" />
                </Button>
              </div>

              <div className="flex gap-2">
                <ColorWell
                  id={`chip-body-${denomination.id}`}
                  label="גוף"
                  value={denomination.color}
                  disabled={disabled}
                  onChange={(color) =>
                    updateDenomination(denomination.id, { color })
                  }
                />
                <ColorWell
                  id={`chip-edge-${denomination.id}`}
                  label="פסים"
                  value={denomination.edgeColor}
                  disabled={disabled}
                  onChange={(edgeColor) =>
                    updateDenomination(denomination.id, { edgeColor })
                  }
                />
              </div>

              <div
                role="group"
                aria-label={`צבעים מוכנים לז׳יטון ${index + 1}`}
                className="flex flex-wrap gap-1.5"
              >
                {CHIP_PRESETS.map((preset) => {
                  const selected =
                    denomination.color.toLowerCase() === preset.body.toLowerCase() &&
                    denomination.edgeColor.toLowerCase() === preset.edge.toLowerCase();
                  return (
                    <button
                      key={preset.body + preset.edge}
                      type="button"
                      disabled={disabled}
                      aria-label={
                        preset.convention
                          ? `${preset.name} (${preset.convention})`
                          : preset.name
                      }
                      aria-pressed={selected}
                      onClick={() =>
                        updateDenomination(denomination.id, {
                          color: preset.body,
                          edgeColor: preset.edge,
                        })
                      }
                      className={cn(
                        "grid size-11 place-items-center rounded-full border border-transparent transition-transform",
                        "focus-visible:ring-3 focus-visible:ring-ring active:scale-95 disabled:opacity-50",
                        selected && "border-brand-300",
                      )}
                    >
                      <PokerChip
                        color={preset.body}
                        edgeColor={preset.edge}
                        className="size-9"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
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
