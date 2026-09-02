import * as React from "react"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A plain native <input type="checkbox"> rather than a Radix primitive —
 * checkboxes have none of the focus-trap/portal complexity that justifies
 * Radix elsewhere in this UI kit, and native semantics (keyboard, screen
 * reader, indeterminate) come for free.
 */
function Checkbox({
  className,
  checked,
  onCheckedChange,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "onChange" | "checked"> & {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}) {
  return (
    <span className={cn("relative inline-flex size-4 shrink-0", className)}>
      <input
        type="checkbox"
        data-slot="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
        className={cn(
          "peer size-4 shrink-0 appearance-none rounded-sm border border-input bg-background",
          "checked:border-primary checked:bg-primary",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "transition-colors"
        )}
        {...props}
      />
      <Check className="pointer-events-none absolute inset-0 size-4 scale-0 text-primary-foreground opacity-0 transition-transform peer-checked:scale-100 peer-checked:opacity-100" />
    </span>
  )
}

export { Checkbox }
