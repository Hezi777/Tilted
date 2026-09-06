import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "field-sizing-content min-h-24 w-full min-w-0 resize-none rounded-xl border border-input bg-surface-1/85 px-3 py-2 text-base shadow-[inset_0_1px_rgb(255_255_255/0.035)] transition-[border-color,box-shadow,background-color] outline-none placeholder:text-muted-foreground focus-visible:border-ruby/70 focus-visible:bg-surface-2 focus-visible:ring-3 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
