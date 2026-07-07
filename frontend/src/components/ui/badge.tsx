/**
 * Badge — small status labels.
 */

import { cn } from '../../lib/utils'
import type { HTMLAttributes } from 'react'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'muted' | 'destructive' | 'success' | 'warning'
}

const variantClasses: Record<string, string> = {
  default: 'bg-primary/10 text-primary border-primary/20',
  muted: 'bg-(--ui-bg-quaternary) text-(--ui-text-tertiary) border-(--ui-stroke-quaternary)',
  destructive: 'bg-destructive/10 text-destructive border-destructive/20',
  success: 'bg-[var(--ui-green)]/10 text-[var(--ui-green)] border-[var(--ui-green)]/20',
  warning: 'bg-[var(--ui-yellow)]/10 text-[var(--ui-yellow)] border-[var(--ui-yellow)]/20',
}

export function Badge({ variant = 'default', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.6875rem] font-medium leading-none',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  )
}
