/**
 * OverlayView — full-screen backdrop-blur modal card.
 * Ported from Hermes Agent's overlay-view.tsx.
 */

import { useEffect, type ReactNode } from 'react'
import { Button } from '../ui/button'
import { X } from 'lucide-react'

interface OverlayViewProps {
  children: ReactNode
  onClose: () => void
  closeLabel?: string
}

export function OverlayView({ children, onClose, closeLabel = 'Close' }: OverlayViewProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/22 backdrop-blur-[0.125rem] p-6 sm:p-8"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="presentation"
    >
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-chat-surface-background) shadow-md">
        {/* Close button */}
        <Button
          aria-label={closeLabel}
          className="absolute right-3 top-3 z-10 text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground"
          onClick={onClose}
          size="icon-xs"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>

        <div className="min-h-0 flex flex-1 flex-col">{children}</div>
      </div>
    </div>
  )
}
