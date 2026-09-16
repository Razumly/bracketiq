"use client"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"

import { mergeBaseUIClassName } from "@/lib/utils"
import { CheckIcon, MinusIcon } from "lucide-react"

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={mergeBaseUIClassName(
        "peer relative inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-primary-foreground outline-none select-none transition-opacity before:pointer-events-none before:absolute before:size-4 before:rounded-[4px] before:border before:border-input before:bg-background before:transition-[background-color,border-color,box-shadow] hover:before:bg-muted focus-visible:before:border-ring focus-visible:before:ring-[3px] focus-visible:before:ring-ring motion-reduce:transition-none motion-reduce:before:transition-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50 data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50 group-has-disabled/field:opacity-50 aria-invalid:before:border-destructive aria-invalid:before:ring-3 aria-invalid:before:ring-destructive/20 aria-invalid:focus-visible:before:ring-ring data-invalid:before:border-destructive data-invalid:before:ring-3 data-invalid:before:ring-destructive/20 data-invalid:focus-visible:before:ring-ring data-checked:before:border-primary data-checked:before:bg-primary data-checked:hover:before:bg-primary/90 data-indeterminate:before:border-primary data-indeterminate:before:bg-primary data-indeterminate:hover:before:bg-primary/90 aria-invalid:data-checked:before:border-destructive aria-invalid:data-indeterminate:before:border-destructive data-invalid:data-checked:before:border-destructive data-invalid:data-indeterminate:before:border-destructive",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="relative z-10 grid size-4 place-content-center text-current transition-none [&>svg]:size-3.5"
        render={(indicatorProps, state) => (
          <span {...indicatorProps}>
            {state.indeterminate ? (
              <MinusIcon
                aria-hidden="true"
                data-slot="checkbox-indeterminate-mark"
              />
            ) : (
              <CheckIcon aria-hidden="true" data-slot="checkbox-checked-mark" />
            )}
          </span>
        )}
      />
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
