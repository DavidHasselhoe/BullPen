"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import type { Matcher } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

/** Parses a "YYYY-MM-DD" string as a local-midnight Date, avoiding the UTC
 *  off-by-one shift that `new Date(isoString)` produces outside UTC. */
function parseISODate(value?: string | null): Date | undefined {
  if (!value) return undefined
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return undefined
  const [, y, m, d] = match
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  return Number.isNaN(date.getTime()) ? undefined : date
}

/** Inverse of parseISODate — formats using local getters, not toISOString(),
 *  for the same UTC-shift reason. */
function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

const displayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
})

export interface DatePickerProps {
  id?: string
  /** ISO date string ("YYYY-MM-DD"), or "" when empty. */
  value: string
  onChange: (value: string) => void
  /** ISO date string — earliest selectable day (inclusive). */
  min?: string
  /** ISO date string — latest selectable day (inclusive). */
  max?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  size?: "default" | "sm"
  "aria-invalid"?: boolean
}

export function DatePicker({
  id,
  value,
  onChange,
  min,
  max,
  placeholder = "Pick a date",
  disabled,
  className,
  size = "default",
  ...props
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const selected = parseISODate(value)
  const minDate = parseISODate(min)
  const maxDate = parseISODate(max)

  const disabledMatchers: Matcher[] = []
  if (minDate) disabledMatchers.push({ before: minDate })
  if (maxDate) disabledMatchers.push({ after: maxDate })

  // Bound the year/month dropdowns to a 50-year window anchored on max (or
  // today) so the year select stays a reasonable length by default.
  const endMonth = maxDate ?? new Date()
  const startMonth = minDate ?? new Date(endMonth.getFullYear() - 50, 0, 1)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          aria-invalid={props["aria-invalid"]}
          className={cn(
            "w-full justify-start gap-2 font-normal",
            size === "sm" ? "h-8 px-2.5 text-xs" : "h-9",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className={cn("shrink-0", size === "sm" ? "size-3.5" : "size-4")} />
          <span className="truncate">
            {selected ? displayFormatter.format(selected) : placeholder}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          startMonth={startMonth}
          endMonth={endMonth}
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (!date) return
            onChange(toISODate(date))
            setOpen(false)
          }}
          disabled={disabledMatchers.length ? disabledMatchers : undefined}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  )
}
