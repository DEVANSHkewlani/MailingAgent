/**
 * SegmentedControl — mutually exclusive choice control.
 * Ported from Hermes Agent's SegmentedControl.
 */

import { cn } from '../../lib/utils'
import type { ReactNode } from 'react'

interface SegmentOption<T extends string> {
  id: T
  label: string
  icon?: ReactNode
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[]
  value: T
  onChange: (id: T) => void
  className?: string
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) p-0.5',
        className,
      )}
    >
      {options.map(opt => (
        <button
          key={opt.id}
          type="button"
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[0.75rem] font-medium transition-all',
            value === opt.id
              ? 'bg-(--ui-bg-tertiary) text-foreground shadow-sm'
              : 'text-(--ui-text-tertiary) hover:text-(--ui-text-secondary)',
          )}
          onClick={() => onChange(opt.id)}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  )
}
