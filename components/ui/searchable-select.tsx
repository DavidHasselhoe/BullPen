"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"

export interface SearchableOption {
  value: string
  label: string
}

/**
 * A Select for long lists (time zones, industries): a search box on top and a
 * list that scrolls inside the popover instead of running past the page.
 * `pinned` options sit above a separator and are always shown, like
 * "Automatic" or "Any industry". Use it instead of <Select> past ~20 options.
 */
export function SearchableSelect({
  id,
  value,
  onValueChange,
  options,
  pinned = [],
  searchPlaceholder,
  className,
  size = "default",
}: {
  id?: string
  value: string
  onValueChange: (value: string) => void
  options: SearchableOption[]
  pinned?: SearchableOption[]
  searchPlaceholder?: string
  className?: string
  size?: "sm" | "default"
}) {
  const { t } = useTranslation("common")
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")

  const selected = [...pinned, ...options].find((o) => o.value === value)
  // Our own filter: cmdk's re-sorts by match score, and these lists read best in their own order.
  const q = query.trim().toLowerCase()
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)) : options

  const pick = (v: string) => {
    onValueChange(v)
    setOpen(false)
  }

  const item = (o: SearchableOption) => (
    <CommandItem key={o.value} value={o.value} onSelect={pick}>
      <span className="flex-1">{o.label}</span>
      <CheckIcon className={cn("size-4", o.value === value ? "opacity-100" : "opacity-0")} />
    </CommandItem>
  )

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery("") }}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          data-size={size}
          className={cn(
            "border-input dark:bg-input/30 dark:hover:bg-input/50 focus-visible:border-ring focus-visible:ring-ring/50 flex w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] data-[size=default]:h-9 data-[size=sm]:h-8",
            className
          )}
        >
          {/* clamp-ok: a single-line option label, the full name is in the open list */}
          <span className="truncate">{selected?.label ?? value}</span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-56 p-0">
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder={searchPlaceholder ?? t("search")} />
          {/* A Dialog behind this (Settings) locks wheel scroll outside its own content. */}
          <CommandList onWheel={(e) => e.stopPropagation()}>
            <CommandEmpty>{t("noMatches")}</CommandEmpty>
            {pinned.length > 0 && !q && (
              <>
                <CommandGroup>{pinned.map(item)}</CommandGroup>
                <CommandSeparator />
              </>
            )}
            {shown.length > 0 && <CommandGroup>{shown.map(item)}</CommandGroup>}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
