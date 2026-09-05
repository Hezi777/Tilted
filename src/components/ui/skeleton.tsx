import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-[14px] bg-surface-2 after:absolute after:inset-y-0 after:w-1/2 after:bg-[linear-gradient(90deg,transparent,rgb(193_18_31/0.12),transparent)] after:animate-[accent-sheen_1.8s_ease-in-out_infinite] motion-reduce:after:hidden",
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
