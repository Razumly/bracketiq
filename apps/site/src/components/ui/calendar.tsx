"use client"

import * as React from "react"
import {
  DayPicker,
  getDefaultClassNames,
  type CustomComponents,
  type DayButton,
  type Locale,
} from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"
import { ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon } from "lucide-react"

type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}

type CalendarClassNames = NonNullable<CalendarProps["classNames"]>

const RDP_DEFAULT_CLASS_NAMES = getDefaultClassNames()

type CalendarClassNameOptions = {
  buttonVariant: CalendarProps["buttonVariant"]
  captionLayout: CalendarProps["captionLayout"]
  classNames: CalendarProps["classNames"]
  defaultClassNames: CalendarClassNames
  showWeekNumber: CalendarProps["showWeekNumber"]
}

function getCalendarClassNames({
  buttonVariant,
  captionLayout,
  classNames,
  defaultClassNames,
  showWeekNumber,
}: CalendarClassNameOptions): CalendarClassNames {
  const overrides = classNames ?? {}

  return {
    ...overrides,
    root: cn(
      "w-fit max-w-full overflow-x-auto overscroll-x-contain",
      defaultClassNames.root,
      overrides.root
    ),
    months: cn(
      "relative flex flex-col gap-4 md:flex-row",
      defaultClassNames.months,
      overrides.months
    ),
    month: cn(
      "flex w-full flex-col gap-4",
      defaultClassNames.month,
      overrides.month
    ),
    nav: cn(
      "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
      defaultClassNames.nav,
      overrides.nav
    ),
    button_previous: cn(
      buttonVariants({ variant: buttonVariant }),
      "size-(--cell-size) p-0 select-none aria-disabled:opacity-50",
      defaultClassNames.button_previous,
      overrides.button_previous
    ),
    button_next: cn(
      buttonVariants({ variant: buttonVariant }),
      "size-(--cell-size) p-0 select-none aria-disabled:opacity-50",
      defaultClassNames.button_next,
      overrides.button_next
    ),
    month_caption: cn(
      "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
      defaultClassNames.month_caption,
      overrides.month_caption
    ),
    dropdowns: cn(
      "flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium",
      defaultClassNames.dropdowns,
      overrides.dropdowns
    ),
    dropdown_root: cn(
      "relative inline-flex min-h-11 min-w-11 items-stretch rounded-(--cell-radius) focus-within:z-20 focus-within:ring-[3px] focus-within:ring-ring",
      defaultClassNames.dropdown_root,
      overrides.dropdown_root
    ),
    dropdown: cn(
      "absolute inset-0 z-10 size-full min-h-11 min-w-11 cursor-pointer bg-popover opacity-0 focus:outline-none",
      defaultClassNames.dropdown,
      overrides.dropdown
    ),
    caption_label: cn(
      "font-medium select-none",
      captionLayout === "label"
        ? "text-sm"
        : "pointer-events-none flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-(--cell-radius) px-2 text-sm [&>svg]:size-3.5 [&>svg]:text-muted-foreground",
      defaultClassNames.caption_label,
      overrides.caption_label
    ),
    month_grid: cn(
      "w-full border-collapse",
      showWeekNumber
        ? "min-w-[calc(var(--cell-size)*8)]"
        : "min-w-[calc(var(--cell-size)*7)]",
      defaultClassNames.month_grid,
      overrides.month_grid
    ),
    weekdays: cn(
      "flex",
      defaultClassNames.weekdays,
      overrides.weekdays
    ),
    weekday: cn(
      "flex-1 rounded-(--cell-radius) text-[0.8rem] font-normal text-muted-foreground select-none",
      defaultClassNames.weekday,
      overrides.weekday
    ),
    week: cn(
      "mt-2 flex w-full",
      defaultClassNames.week,
      overrides.week
    ),
    week_number_header: cn(
      "w-(--cell-size) select-none",
      defaultClassNames.week_number_header,
      overrides.week_number_header
    ),
    week_number: cn(
      "text-[0.8rem] text-muted-foreground select-none",
      defaultClassNames.week_number,
      overrides.week_number
    ),
    day: cn(
      "group/day relative aspect-square h-full min-h-(--cell-size) w-full min-w-(--cell-size) rounded-(--cell-radius) p-0 text-center select-none [&:last-child[data-selected=true]_button]:rounded-r-(--cell-radius)",
      showWeekNumber
        ? "[&:nth-child(2)[data-selected=true]_button]:rounded-l-(--cell-radius)"
        : "[&:first-child[data-selected=true]_button]:rounded-l-(--cell-radius)",
      defaultClassNames.day,
      overrides.day
    ),
    range_start: cn(
      "relative isolate z-0 rounded-l-(--cell-radius) bg-control-track after:absolute after:inset-y-0 after:right-0 after:w-4 after:bg-control-track",
      defaultClassNames.range_start,
      overrides.range_start
    ),
    range_middle: cn(
      "rounded-none",
      defaultClassNames.range_middle,
      overrides.range_middle
    ),
    range_end: cn(
      "relative isolate z-0 rounded-r-(--cell-radius) bg-control-track after:absolute after:inset-y-0 after:left-0 after:w-4 after:bg-control-track",
      defaultClassNames.range_end,
      overrides.range_end
    ),
    today: cn(
      "rounded-(--cell-radius) bg-muted text-foreground ring-1 ring-inset ring-control-outline data-[selected=true]:rounded-none",
      defaultClassNames.today,
      overrides.today
    ),
    outside: cn(
      "text-muted-foreground aria-selected:text-muted-foreground",
      defaultClassNames.outside,
      overrides.outside
    ),
    disabled: cn(
      "text-muted-foreground opacity-50",
      defaultClassNames.disabled,
      overrides.disabled
    ),
    hidden: cn(
      "invisible",
      defaultClassNames.hidden,
      overrides.hidden
    ),
  }
}

function CalendarRoot({
  className,
  rootRef,
  ...props
}: React.ComponentProps<CustomComponents["Root"]>) {
  return (
    <div
      data-slot="calendar"
      ref={rootRef}
      className={cn(className)}
      {...props}
    />
  )
}

function CalendarChevron({
  className,
  orientation,
  ...props
}: React.ComponentProps<CustomComponents["Chevron"]>) {
  if (orientation === "left") {
    return (
      <ChevronLeftIcon className={cn("size-4", className)} {...props} />
    )
  }

  if (orientation === "right") {
    return (
      <ChevronRightIcon className={cn("size-4", className)} {...props} />
    )
  }

  return <ChevronDownIcon className={cn("size-4", className)} {...props} />
}

function CalendarWeekNumber({
  children,
  ...props
}: React.ComponentProps<CustomComponents["WeekNumber"]>) {
  return (
    <td {...props}>
      <div className="flex size-(--cell-size) items-center justify-center text-center">
        {children}
      </div>
    </td>
  )
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  locale,
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = RDP_DEFAULT_CLASS_NAMES
  const calendarClassNames = getCalendarClassNames({
    buttonVariant,
    captionLayout,
    classNames,
    defaultClassNames,
    showWeekNumber: props.showWeekNumber,
  })
  const calendarComponents = React.useMemo<Partial<CustomComponents>>(
    () => ({
      Root: CalendarRoot,
      Chevron: CalendarChevron,
      DayButton: (dayButtonProps) => (
        <CalendarDayButton locale={locale} {...dayButtonProps} />
      ),
      WeekNumber: CalendarWeekNumber,
      ...components,
    }),
    [components, locale]
  )

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "group/calendar max-w-full overflow-x-auto overscroll-x-contain bg-background p-2 [--cell-radius:var(--radius-md)] [--cell-size:--spacing(11)] motion-reduce:**:animate-none motion-reduce:**:transition-none in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      locale={locale}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString(locale?.code, { month: "short" }),
        ...formatters,
      }}
      classNames={calendarClassNames}
      components={calendarComponents}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  locale,
  ...props
}: React.ComponentProps<typeof DayButton> & { locale?: Partial<Locale> }) {
  const defaultClassNames = RDP_DEFAULT_CLASS_NAMES

  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <Button
      variant="ghost"
      size="icon"
      ref={ref}
      data-day={day.date.toLocaleDateString(locale?.code)}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "relative isolate z-10 flex aspect-square size-(--cell-size) min-h-(--cell-size) min-w-(--cell-size) flex-col gap-1 border-0 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-3 group-data-[focused=true]/day:ring-ring data-[range-end=true]:rounded-(--cell-radius) data-[range-end=true]:rounded-r-(--cell-radius) data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-control-track data-[range-middle=true]:text-foreground data-[range-start=true]:rounded-(--cell-radius) data-[range-start=true]:rounded-l-(--cell-radius) data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground [&>span]:text-xs [&>span]:opacity-70",
        defaultClassNames.day_button,
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
