import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden={true}
      className={cn(
        "min-w-0 max-w-full rounded-md bg-muted motion-safe:animate-pulse",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
