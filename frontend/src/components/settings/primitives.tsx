/**
 * Settings primitives — ListRow, SectionHeading, SettingsContent.
 * Ported from Hermes Agent's settings/primitives.tsx.
 */

import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import type { LucideIcon } from 'lucide-react'

export function SettingsContent({ children }: { children: ReactNode }) {
  return (
    <section className="min-h-0 overflow-hidden">
      <div className="h-full min-h-0 overflow-y-auto pb-20 px-[clamp(1.25rem,4vw,4rem)]">
        <div className="mx-auto w-full max-w-4xl">{children}</div>
      </div>
    </section>
  )
}

export function SectionHeading({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-2 pt-2 text-[0.8125rem] font-medium">
      <Icon className="size-4 text-(--ui-text-tertiary)" />
      <span>{title}</span>
    </div>
  )
}

export function ListRow({
  title,
  description,
  action,
  below,
  wide = false,
}: {
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  below?: ReactNode
  wide?: boolean
}) {
  return (
    <div className={cn(
      'grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(15rem,22rem)] sm:items-center',
      wide && 'sm:grid-cols-1 sm:items-start',
    )}>
      <div className="min-w-0">
        <div className="text-[0.8125rem] font-medium text-foreground">{title}</div>
        {description && (
          <div className="mt-1 text-[0.75rem] leading-[1rem] text-(--ui-text-tertiary)">{description}</div>
        )}
        {below}
      </div>
      {action && <div className={cn('min-w-0', !wide && 'sm:justify-self-end')}>{action}</div>}
    </div>
  )
}
