"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { useRender } from "@base-ui/react/use-render"

import { cn, mergeBaseUIClassName } from "@/lib/utils"

type PopoverAnchorContextValue = {
  anchor: Element | null
  setAnchor: React.Dispatch<React.SetStateAction<Element | null>>
}

const PopoverAnchorContext = React.createContext<PopoverAnchorContextValue | null>(
  null
)

function Popover({ children, ...props }: PopoverPrimitive.Root.Props) {
  const [anchor, setAnchor] = React.useState<Element | null>(null)
  const anchorContext = React.useMemo(
    () => ({ anchor, setAnchor }),
    [anchor]
  )

  return (
    <PopoverAnchorContext.Provider value={anchorContext}>
      <PopoverPrimitive.Root data-slot="popover" {...props}>
        {children}
      </PopoverPrimitive.Root>
    </PopoverAnchorContext.Provider>
  )
}

function PopoverTrigger({
  className,
  ...props
}: PopoverPrimitive.Trigger.Props) {
  return (
    <PopoverPrimitive.Trigger
      data-slot="popover-trigger"
      className={mergeBaseUIClassName(
        "inline-flex min-h-11 min-w-11 outline-none transition-[background-color,border-color,box-shadow,color] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring motion-reduce:transition-none! disabled:pointer-events-none disabled:cursor-not-allowed data-disabled:pointer-events-none data-disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  )
}

function PopoverAnchor({
  render,
  ref,
  ...props
}: useRender.ComponentProps<"span">) {
  const anchorContext = React.useContext(PopoverAnchorContext)

  if (!anchorContext) {
    throw new Error("PopoverAnchor must be used within Popover")
  }

  return useRender({
    defaultTagName: "span",
    render,
    ref: [ref ?? null, anchorContext.setAnchor],
    props: {
      "data-slot": "popover-anchor",
      ...props,
    },
  })
}

function PopoverPortal({ ...props }: PopoverPrimitive.Portal.Props) {
  return <PopoverPrimitive.Portal data-slot="popover-portal" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  anchor: anchorProp,
  side = "bottom",
  sideOffset = 4,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "anchor" | "side" | "sideOffset"
  >) {
  const anchorContext = React.useContext(PopoverAnchorContext)
  const anchor =
    anchorProp === undefined ? (anchorContext?.anchor ?? undefined) : anchorProp

  return (
    <PopoverPortal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50 max-w-[calc(100dvw-1rem)]"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={mergeBaseUIClassName(
            "z-50 flex max-h-[min(var(--available-height),calc(100dvh-1rem))] w-72 min-w-0 max-w-[min(var(--available-width),calc(100dvw-1rem))] origin-(--transform-origin) flex-col gap-2.5 overflow-auto overscroll-contain rounded-lg border border-border bg-popover p-3 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none duration-100 focus-visible:ring-[3px] focus-visible:ring-ring data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:animate-none! motion-reduce:transition-none!",
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPortal>
  )
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex min-w-0 flex-col gap-1 text-sm", className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={mergeBaseUIClassName("font-medium break-words", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={mergeBaseUIClassName(
        "break-words text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function PopoverClose({ className, ...props }: PopoverPrimitive.Close.Props) {
  return (
    <PopoverPrimitive.Close
      data-slot="popover-close"
      className={mergeBaseUIClassName(
        "inline-flex min-h-11 min-w-11 outline-none transition-[background-color,border-color,box-shadow,color] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring motion-reduce:transition-none! disabled:pointer-events-none disabled:cursor-not-allowed data-disabled:pointer-events-none data-disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverAnchor,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverPortal,
  PopoverTitle,
  PopoverTrigger,
}
