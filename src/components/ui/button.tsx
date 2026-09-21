import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 touch-manipulation items-center justify-center rounded-full text-sm font-medium whitespace-nowrap transition-[color,background-color,box-shadow,transform,filter] duration-[var(--dur-micro)] ease-[var(--ease-out)] outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none aria-invalid:ring-2 aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1.125em]",
  {
    variants: {
      variant: {
        // The primary is the highest-contrast object on the screen and carries no
        // hue at all, so it can never be read as money. Everything else is a step
        // of the same near-black.
        default:
          "bg-light text-light-ink shadow-[0_6px_18px_-10px_rgb(0_0_0/0.9)] hover:brightness-95",
        secondary:
          "bg-ink-700 text-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.06)] hover:bg-ink-600 aria-expanded:bg-ink-600",
        outline:
          "bg-transparent text-foreground shadow-[inset_0_0_0_1px_var(--glass-3)] hover:bg-ink-800 aria-expanded:bg-ink-800",
        ghost:
          "bg-transparent text-[var(--text-1)] hover:bg-ink-800 hover:text-foreground aria-expanded:bg-ink-800 aria-expanded:text-foreground",
        // Destructive is ink on a near-black pill, the way the reference draws a
        // "Folded" badge. Nothing in this app is filled in the money colours.
        destructive:
          "bg-ink-800 text-destructive hover:bg-[color-mix(in_oklab,var(--red-400)_14%,var(--ink-800))] focus-visible:ring-destructive/50",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-12 gap-2 px-5 text-base has-data-[icon=inline-end]:pe-4 has-data-[icon=inline-start]:ps-4",
        // Below the 44px floor at their drawn size, so the hit area is grown underneath
        // with a pseudo-element rather than the control itself -- same fix as
        // switch.tsx / checkbox.tsx. The offset is sized to reach 44px, not further, so
        // it does not reach into a neighbour's own hit area.
        xs: "h-8 gap-1 px-3 text-xs has-data-[icon=inline-end]:pe-2 has-data-[icon=inline-start]:ps-2 after:absolute after:-inset-1.5",
        sm: "h-10 gap-1.5 px-4 text-sm has-data-[icon=inline-end]:pe-3 has-data-[icon=inline-start]:ps-3 after:absolute after:-inset-1",
        lg: "h-14 gap-2 px-7 text-base font-semibold has-data-[icon=inline-end]:pe-5 has-data-[icon=inline-start]:ps-5",
        icon: "size-12",
        "icon-xs": "size-8 after:absolute after:-inset-1.5",
        "icon-sm": "size-10 after:absolute after:-inset-1",
        "icon-lg": "size-14",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
