"use client"

import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"

import { mergeBaseUIClassName } from "@/lib/utils"

function RadioGroup<Value>({
  className,
  ...props
}: RadioGroupPrimitive.Props<Value>) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={mergeBaseUIClassName("grid w-full gap-2", className)}
      {...props}
    />
  )
}

function RadioGroupItem<Value>({
  className,
  ...props
}: RadioPrimitive.Root.Props<Value>) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={mergeBaseUIClassName(
        "group/radio-group-item peer relative inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-primary-foreground outline-none select-none transition-opacity before:pointer-events-none before:absolute before:size-4 before:rounded-full before:border before:border-input before:bg-background before:transition-[background-color,border-color,box-shadow] hover:before:bg-muted focus-visible:before:border-ring focus-visible:before:ring-[3px] focus-visible:before:ring-ring motion-reduce:transition-none motion-reduce:before:transition-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50 data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50 aria-invalid:before:border-destructive aria-invalid:before:ring-3 aria-invalid:before:ring-destructive/20 aria-invalid:focus-visible:before:ring-ring data-invalid:before:border-destructive data-invalid:before:ring-3 data-invalid:before:ring-destructive/20 data-invalid:focus-visible:before:ring-ring data-checked:before:border-primary data-checked:before:bg-primary data-checked:hover:before:bg-primary/90 aria-invalid:data-checked:before:border-destructive data-invalid:data-checked:before:border-destructive",
        className
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="relative z-10 flex size-4 items-center justify-center"
      >
        <span className="size-2 rounded-full bg-current" />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  )
}

export { RadioGroup, RadioGroupItem }
