/**
 * Composer Component — bottom input bar.
 * Supports multi-line input, enter-to-submit key binds, and disabled states.
 */

import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useStore } from '@nanostores/react'
import { Send, Loader2 } from 'lucide-react'
import { $chatSending } from '../store/chat'
import { cn } from '../lib/utils'

interface ComposerProps {
  onSend: (text: string) => void
  placeholder?: string
}

export function Composer({ onSend, placeholder = 'Tell me what to do with your email...' }: ComposerProps) {
  const [text, setText] = useState('')
  const sending = useStore($chatSending)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Auto-resize the height based on text input
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`
    }
  }, [text])

  const handleSubmit = () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    onSend(trimmed)
    setText('')
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="w-full max-w-(--composer-width) px-4 pb-6 mx-auto bg-transparent">
      <div className={cn(
        'relative flex items-end rounded-xl border desktop-input-chrome shadow-composer p-2',
        sending && 'opacity-80 pointer-events-none'
      )}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={sending}
          className="flex-1 bg-transparent px-3 py-1.5 resize-none text-[0.8125rem] leading-5 text-foreground placeholder:text-(--ui-text-tertiary) outline-none min-h-[1.625rem] max-h-[12rem] overflow-y-auto scrollbar-themed"
        />
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || sending}
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed'
          )}
        >
          {sending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-3.5" />
          )}
        </button>
      </div>
    </div>
  )
}
export default Composer
