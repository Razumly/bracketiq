"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"

import { cn, mergeBaseUIClassName } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ className, ...props }: SheetPrimitive.Trigger.Props) {
  return (
    <SheetPrimitive.Trigger
      data-slot="sheet-trigger"
      className={mergeBaseUIClassName(
        "inline-flex min-h-11 min-w-11 outline-none focus-visible:ring-[3px] focus-visible:ring-ring motion-reduce:transition-none!",
        className
      )}
      {...props}
    />
  )
}

function SheetClose({ className, ...props }: SheetPrimitive.Close.Props) {
  return (
    <SheetPrimitive.Close
      data-slot="sheet-close"
      className={mergeBaseUIClassName(
        "inline-flex min-h-11 min-w-11 outline-none focus-visible:ring-[3px] focus-visible:ring-ring motion-reduce:transition-none!",
        className
      )}
      {...props}
    />
  )
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={mergeBaseUIClassName(
        "fixed inset-0 isolate z-50 min-h-dvh bg-foreground/20 transition-opacity duration-150 supports-backdrop-filter:backdrop-blur-xs supports-[-webkit-touch-callout:none]:absolute data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none!",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={mergeBaseUIClassName(
          "fixed z-50 flex max-w-full flex-col gap-4 overflow-auto overscroll-contain border-border bg-popover bg-clip-padding pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-sm text-popover-foreground shadow-lg outline-none transition-[transform,opacity] duration-200 ease-in-out focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none! data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:max-h-[calc(100dvh-1rem)] data-[side=bottom]:w-full data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem] data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-dvh data-[side=left]:w-[min(100%,24rem)] data-[side=left]:border-r data-[side=left]:pl-[env(safe-area-inset-left)] data-[side=left]:data-ending-style:translate-x-[-2.5rem] data-[side=left]:data-starting-style:translate-x-[-2.5rem] data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-dvh data-[side=right]:w-[min(100%,24rem)] data-[side=right]:border-l data-[side=right]:pr-[env(safe-area-inset-right)] data-[side=right]:data-ending-style:translate-x-[2.5rem] data-[side=right]:data-starting-style:translate-x-[2.5rem] data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:max-h-[calc(100dvh-1rem)] data-[side=top]:w-full data-[side=top]:border-b data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem]",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))]"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex min-w-0 flex-col gap-0.5 p-4 pr-16", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex shrink-0 flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={mergeBaseUIClassName(
        "text-base font-medium break-words text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={mergeBaseUIClassName(
        "text-sm break-words text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
}
