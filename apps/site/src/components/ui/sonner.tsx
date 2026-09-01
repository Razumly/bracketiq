"use client"

import type { CSSProperties } from "react"
import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

import { cn } from "@/lib/utils"

const toasterTheme = {
  "--normal-bg": "var(--popover)",
  "--normal-text": "var(--popover-foreground)",
  "--normal-border": "var(--border)",
  "--success-bg": "var(--secondary)",
  "--success-text": "var(--foreground)",
  "--success-border": "var(--chart-5)",
  "--info-bg": "var(--secondary)",
  "--info-text": "var(--foreground)",
  "--info-border": "var(--primary)",
  "--warning-bg": "var(--accent)",
  "--warning-text": "var(--accent-foreground)",
  "--warning-border": "var(--accent)",
  "--error-bg": "var(--destructive)",
  "--error-text": "var(--destructive-foreground)",
  "--error-border": "var(--destructive)",
  "--border-radius": "var(--radius)",
} as CSSProperties

const viewportOffset = {
  top: "calc(env(safe-area-inset-top) + 1rem)",
  right: "calc(env(safe-area-inset-right) + 1rem)",
  bottom: "calc(env(safe-area-inset-bottom) + 1rem)",
  left: "calc(env(safe-area-inset-left) + 1rem)",
}

const mobileViewportOffset = {
  top: "calc(env(safe-area-inset-top) + 0.75rem)",
  right: "calc(env(safe-area-inset-right) + 0.75rem)",
  bottom: "calc(env(safe-area-inset-bottom) + 0.75rem)",
  left: "calc(env(safe-area-inset-left) + 0.75rem)",
}

type ToastOptions = NonNullable<ToasterProps["toastOptions"]>
type ToastClassNames = NonNullable<ToastOptions["classNames"]>

const defaultCloseButtonAriaLabel = "Dismiss notification"

const defaultToastClassNames = {
  toast:
    "group/toast min-w-0 max-w-full rounded-xl border border-border bg-popover text-popover-foreground shadow-lg",
  title: "break-words text-sm font-semibold text-foreground",
  description: "break-words text-sm text-muted-foreground",
  content: "min-w-0",
  closeButton:
    "border-border bg-popover text-foreground outline-none after:absolute after:-inset-3 after:content-[''] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring motion-reduce:transition-none",
  actionButton:
    "min-h-11 min-w-11 rounded-lg bg-primary! px-3 text-primary-foreground! outline-none transition-colors hover:bg-action-hover! focus-visible:bg-action-hover! focus-visible:ring-[3px] focus-visible:ring-ring motion-reduce:transition-none",
  cancelButton:
    "min-h-11 min-w-11 rounded-lg bg-secondary! px-3 text-secondary-foreground! outline-none transition-colors hover:bg-muted! hover:text-foreground! focus-visible:bg-muted! focus-visible:text-foreground! focus-visible:ring-[3px] focus-visible:ring-ring motion-reduce:transition-none",
} satisfies ToastClassNames

const normalizeToastClassNames = (classNames: ToastClassNames = {}): ToastClassNames => ({
  ...classNames,
  toast: cn(defaultToastClassNames.toast, classNames.toast),
  title: cn(defaultToastClassNames.title, classNames.title),
  description: cn(defaultToastClassNames.description, classNames.description),
  content: cn(defaultToastClassNames.content, classNames.content),
  closeButton: cn(defaultToastClassNames.closeButton, classNames.closeButton),
  actionButton: cn(defaultToastClassNames.actionButton, classNames.actionButton),
  cancelButton: cn(defaultToastClassNames.cancelButton, classNames.cancelButton),
})

const normalizeToastOptions = (toastOptions: ToastOptions = {}): ToastOptions => ({
  ...toastOptions,
  closeButtonAriaLabel: toastOptions.closeButtonAriaLabel ?? defaultCloseButtonAriaLabel,
  classNames: normalizeToastClassNames(toastOptions.classNames),
})

const Toaster = ({ className, style, toastOptions, ...props }: ToasterProps) => (
  <Sonner
    {...props}
    theme="light"
    invert={false}
    position="bottom-right"
    richColors
    closeButton
    containerAriaLabel="Application notifications"
    className={cn(
      "toaster group font-sans motion-reduce:transition-none motion-reduce:**:animate-none motion-reduce:**:transition-none",
      className
    )}
    icons={{
      success: <CircleCheckIcon aria-hidden="true" className="size-4" />,
      info: <InfoIcon aria-hidden="true" className="size-4" />,
      warning: <TriangleAlertIcon aria-hidden="true" className="size-4" />,
      error: <OctagonXIcon aria-hidden="true" className="size-4" />,
      loading: <Loader2Icon aria-hidden="true" className="size-4 motion-safe:animate-spin" />,
    }}
    style={{ ...style, zIndex: 40, ...toasterTheme }}
    offset={viewportOffset}
    mobileOffset={mobileViewportOffset}
    toastOptions={normalizeToastOptions(toastOptions)}
  />
)

export { Toaster }
