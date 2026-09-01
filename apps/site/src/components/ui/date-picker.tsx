"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarDaysIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export type DatePickerCalendarProps = Pick<
  React.ComponentProps<typeof Calendar>,
  "disabled" | "startMonth" | "endMonth"
>

export interface DatePickerProps {
  value?: Date
  onValueChange: (value: Date | undefined) => void
  label: string
  placeholder?: string
  disabled?: boolean
  calendarProps?: DatePickerCalendarProps
}

function DatePicker({
  value,
  onValueChange,
  label,
  placeholder = "Select a date",
  disabled = false,
  calendarProps,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const displayValue = value ? format(value, "PPP") : placeholder

  React.useEffect(() => {
    if (disabled) {
      setOpen(false)
    }
  }, [disabled])

  function handleOpenChange(nextOpen: boolean) {
    setOpen(disabled ? false : nextOpen)
  }

  function handleSelect(nextValue: Date | undefined) {
    if (disabled) {
      return
    }

    onValueChange(nextValue)
    setOpen(false)
  }

  return (
    <Popover open={open && !disabled} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        disabled={disabled}
        render={
          <Button
            variant="outline"
            aria-label={`${label}: ${displayValue}`}
            className="w-full min-w-0 max-w-full justify-start gap-2 text-left whitespace-normal"
          />
        }
      >
        <CalendarDaysIcon data-icon="inline-start" aria-hidden="true" />
        <span className="min-w-0 break-words">
          {displayValue}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={`${label} calendar`}
        className="w-auto p-0"
      >
        <Calendar
          {...calendarProps}
          disabled={disabled ? true : calendarProps?.disabled}
          autoFocus
          defaultMonth={value}
          mode="single"
          selected={value}
          onSelect={handleSelect}
        />
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker }
