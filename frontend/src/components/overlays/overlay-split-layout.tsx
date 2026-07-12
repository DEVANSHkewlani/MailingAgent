/**
 * OverlaySplitLayout — 13rem sidebar + scrollable main content.
 * Ported from Hermes Agent's overlay-split-layout.tsx.
 */

import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import type { LucideIcon } from 'lucide-react'

export function OverlaySplitLayout({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn(
      'grid h-full min-h-0 flex-1 grid-cols-[13rem_minmax(0,1fr)] overflow-hidden bg-transparent max-[47.5rem]:grid-cols-1',
      className,
    )}>
      {children}
    </div>
  )
}

export function OverlaySidebar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <aside className={cn(
      'flex min-h-0 flex-col gap-0.5 overflow-y-auto bg-(--ui-sidebar-surface-background) px-2.5 pb-3 pt-6',
      className,
    )}>
      {children}
    </aside>
  )
}

export function OverlayMain({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cn(
      'flex min-h-0 flex-1 flex-col overflow-y-auto bg-transparent pb-3 pt-6 px-[clamp(1.25rem,4vw,4rem)]',
      className,
    )}>
      <div className="mx-auto w-full max-w-4xl">{children}</div>
    </main>
  )
}

export function OverlayNavItem({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: LucideIcon
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        'flex h-7 w-full items-center justify-start gap-2 rounded-sm px-2 text-left text-[0.8125rem] font-normal transition-colors',
        active
          ? 'bg-(--ui-bg-tertiary) text-foreground font-semibold'
          : 'bg-transparent text-(--ui-text-secondary) hover:bg-(--ui-bg-quaternary) hover:text-foreground',
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className={cn('size-4 shrink-0', active ? 'text-foreground/80' : 'text-(--ui-text-tertiary)/80')} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  )
}
