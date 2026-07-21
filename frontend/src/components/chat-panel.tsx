/**
 * ChatPanel Component — conversation view thread.
 * Displays history messages or a startup serif header when empty,
 * with automatic scrolling.
 */

import { useRef, useEffect } from 'react'
import { useStore } from '@nanostores/react'
import { $messages, handleSendMessage, $chatSending } from '../store/chat'

import { Composer } from './composer'
import { cn } from '../lib/utils'

export function ChatPanel() {
  const messages = useStore($messages)
  const chatSending = useStore($chatSending)
  const threadEndRef = useRef<HTMLDivElement | null>(null)

  // Scroll to bottom on updates
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, chatSending])

  const onSend = (text: string) => {
    handleSendMessage(text)
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 scrollbar-themed space-y-4">
        {messages.length === 0 ? (
          /* Landing Screen (Start Screen like photo 2) */
          <div className="flex h-full flex-col items-center justify-center text-center select-none max-w-2xl mx-auto px-6">
            <h1 className="font-serif text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground mb-4">
              MAILING AGENT
            </h1>
            <p className="text-[0.875rem] leading-6 text-(--ui-text-secondary) font-mono">
              Describe the task in your own words. I'll pick the right tools, check your calendar, write templates, and wait for your confirmation before sending.
            </p>
          </div>
        ) : (
          /* Message List */
          <div className="max-w-3xl mx-auto space-y-4 w-full">
            {messages.map((msg, index) => {
              const isUser = msg.role === 'user'
              return (
                <div
                  key={index}
                  className={cn(
                    'flex w-full',
                    isUser ? 'justify-end' : 'justify-start'
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[80%] rounded-xl px-4 py-2.5 text-[0.8125rem] leading-6 shadow-sm border',
                      isUser
                        ? 'bg-(--ui-bg-tertiary) text-foreground border-(--ui-stroke-tertiary)'
                        : 'bg-(--ui-bg-editor) text-foreground border-(--ui-stroke-secondary)'
                    )}
                  >
                    {/* Render message body */}
                    <div className="whitespace-pre-wrap font-sans">
                      {msg.content}
                    </div>
                  </div>
                </div>
              )
            })}
            {chatSending && (
              <div className="flex w-full justify-start animate-fade-in">
                <div className="bg-(--ui-bg-editor) text-foreground border border-(--ui-stroke-secondary) rounded-xl px-4 py-3.5 shadow-sm">
                  <div className="flex items-center gap-1.5 py-1">
                    <span className="w-1.5 h-1.5 bg-(--ui-text-secondary) rounded-full animate-typing-dot" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-(--ui-text-secondary) rounded-full animate-typing-dot" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-(--ui-text-secondary) rounded-full animate-typing-dot" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={threadEndRef} />
          </div>
        )}
      </div>

      {/* Bottom Input Composer */}
      <Composer onSend={onSend} />
    </div>
  )
}
export default ChatPanel
