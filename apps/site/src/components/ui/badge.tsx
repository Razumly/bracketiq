import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex min-h-6 min-w-0 max-w-full items-center justify-center gap-1 rounded-full border border-transparent px-2 py-1 text-center text-xs leading-none font-medium whitespace-normal break-words outline-none transition-[background-color,border-color,box-shadow,color] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring motion-reduce:transition-none [a]:min-h-11 [a]:min-w-11 [a]:cursor-pointer [a]:px-3 [a]:py-2 [button]:min-h-11 [button]:min-w-11 [button]:cursor-pointer [button]:px-3 [button]:py-2 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/30 aria-invalid:focus-visible:ring-ring [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground [a]:hover:bg-action-hover [button]:hover:bg-action-hover",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80 [button]:hover:bg-secondary/80",
        destructive:
          "bg-destructive text-destructive-foreground focus-visible:border-destructive focus-visible:ring-ring [a]:hover:bg-danger-hover [button]:hover:bg-danger-hover",
        accent:
          "bg-accent text-accent-foreground [a]:hover:bg-accent/80 [button]:hover:bg-accent/80",
        outline:
          "border-border bg-background text-foreground [a]:border-control-outline [a]:hover:bg-muted [a]:hover:text-foreground [button]:border-control-outline [button]:hover:bg-muted [button]:hover:text-foreground",
        ghost:
          "text-foreground [a]:hover:bg-muted [a]:hover:text-foreground [button]:hover:bg-muted [button]:hover:text-foreground",
        link:
          "text-primary underline-offset-4 [a]:hover:underline [button]:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
