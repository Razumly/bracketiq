"use client"

import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { CheckIcon, ChevronRightIcon } from "lucide-react"

import { cn, mergeBaseUIClassName } from "@/lib/utils"

function Menu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="menu" {...props} />
}

function MenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot="menu-portal" {...props} />
}

function MenuTrigger({ className, ...props }: MenuPrimitive.Trigger.Props) {
  return (
    <MenuPrimitive.Trigger
      data-slot="menu-trigger"
      className={mergeBaseUIClassName(
        "inline-flex min-h-11 min-w-11 outline-none transition-[background-color,border-color,box-shadow,color] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring motion-reduce:transition-none! disabled:pointer-events-none disabled:cursor-not-allowed data-disabled:pointer-events-none data-disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  )
}

function MenuContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  className,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <MenuPortal>
      <MenuPrimitive.Positioner
        className="isolate z-50 max-w-[calc(100dvw-1rem)] outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          data-slot="menu-content"
          className={mergeBaseUIClassName(
            "z-50 max-h-[min(var(--available-height),calc(100dvh-1rem))] w-(--anchor-width) min-w-[min(9rem,var(--available-width),calc(100dvw-1rem))] max-w-[min(var(--available-width),calc(100dvw-1rem))] origin-(--transform-origin) overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none duration-100 focus-visible:ring-[3px] focus-visible:ring-ring data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:overflow-hidden data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:animate-none! motion-reduce:transition-none!",
            className
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPortal>
  )
}

function MenuGroup({ ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="menu-group" {...props} />
}

function MenuLabel({
  className,
  inset,
  ...props
}: MenuPrimitive.GroupLabel.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="menu-label"
      data-inset={inset ? "" : undefined}
      className={mergeBaseUIClassName(
        "px-2 py-1.5 text-xs font-medium text-muted-foreground data-inset:pl-9",
        className
      )}
      {...props}
    />
  )
}

function MenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: MenuPrimitive.Item.Props & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <MenuPrimitive.Item
      data-slot="menu-item"
      data-inset={inset ? "" : undefined}
      data-variant={variant}
      className={mergeBaseUIClassName(
        "group/menu-item relative flex min-h-11 w-full cursor-default items-center gap-2 rounded-md px-2 py-2 text-sm whitespace-normal break-words outline-none select-none focus:bg-accent focus:text-accent-foreground focus:ring-[3px] focus:ring-inset focus:ring-ring not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-9 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive data-[variant=destructive]:focus:text-destructive-foreground data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive data-[variant=destructive]:focus:*:[svg]:text-destructive-foreground",
        className
      )}
      {...props}
    />
  )
}

function MenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot="menu-sub" {...props} />
}

function MenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="menu-sub-trigger"
      data-inset={inset ? "" : undefined}
      className={mergeBaseUIClassName(
        "flex min-h-11 min-w-11 w-full cursor-default items-center gap-2 rounded-md px-2 py-2 text-sm whitespace-normal break-words outline-none select-none focus:bg-accent focus:text-accent-foreground focus:ring-[3px] focus:ring-inset focus:ring-ring data-inset:pl-9 data-popup-open:bg-accent data-popup-open:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon aria-hidden="true" className="ml-auto" />
    </MenuPrimitive.SubmenuTrigger>
  )
}

function MenuSubContent({
  align = "start",
  alignOffset = -3,
  side = "right",
  sideOffset = 0,
  className,
  ...props
}: React.ComponentProps<typeof MenuContent>) {
  return (
    <MenuContent
      data-slot="menu-sub-content"
      className={mergeBaseUIClassName(
        "w-auto min-w-[min(9rem,var(--available-width),calc(100dvw-1rem))]",
        className
      )}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  )
}

function MenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: MenuPrimitive.CheckboxItem.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="menu-checkbox-item"
      data-inset={inset ? "" : undefined}
      className={mergeBaseUIClassName(
        "relative flex min-h-11 w-full cursor-default items-center gap-2 rounded-md py-2 pr-9 pl-2 text-sm whitespace-normal break-words outline-none select-none focus:bg-accent focus:text-accent-foreground focus:ring-[3px] focus:ring-inset focus:ring-ring focus:**:text-accent-foreground data-inset:pl-9 data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={checked}
      {...props}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-2 flex size-5 items-center justify-center"
        data-slot="menu-checkbox-item-indicator"
      >
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon aria-hidden="true" />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  )
}

function MenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
  return <MenuPrimitive.RadioGroup data-slot="menu-radio-group" {...props} />
}

function MenuRadioItem({
  className,
  children,
  inset,
  ...props
}: MenuPrimitive.RadioItem.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="menu-radio-item"
      data-inset={inset ? "" : undefined}
      className={mergeBaseUIClassName(
        "relative flex min-h-11 w-full cursor-default items-center gap-2 rounded-md py-2 pr-9 pl-2 text-sm whitespace-normal break-words outline-none select-none focus:bg-accent focus:text-accent-foreground focus:ring-[3px] focus:ring-inset focus:ring-ring focus:**:text-accent-foreground data-inset:pl-9 data-disabled:pointer-events-none data-disabled:cursor-not-allowed data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-2 flex size-5 items-center justify-center"
        data-slot="menu-radio-item-indicator"
      >
        <MenuPrimitive.RadioItemIndicator>
          <CheckIcon aria-hidden="true" />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  )
}

function MenuSeparator({
  className,
  ...props
}: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="menu-separator"
      className={mergeBaseUIClassName(
        "pointer-events-none -mx-1 my-1 h-px bg-border",
        className
      )}
      {...props}
    />
  )
}

function MenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="menu-shortcut"
      className={cn(
        "ml-auto shrink-0 text-xs tracking-widest text-muted-foreground group-focus/menu-item:text-accent-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuPortal,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuShortcut,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
}
