/**
 * ChatSidebar Component — left navigation rail.
 * Shows inbox/drafts/approvals counters, calendar shortcut,
 * chat session switcher, and the settings trigger.
 */

import { useStore } from '@nanostores/react'
import {
  Inbox,
  ShieldCheck,
  Mail,
  Clock3,
  Plus,
  Settings,
  MessageSquare,
  Trash2,
} from 'lucide-react'
import { $conversations, $activeConversationId, selectConversation, startNewConversation, handleDeleteConversation } from '../store/chat'
import { $approvals } from '../store/approvals'
import { $userId } from '../store/auth'
import { $activeView, $sidebarOpen, openSettings } from '../store/layout'
import { cn } from '../lib/utils'

interface NavItem {
  id: 'chat' | 'approvals' | 'bulk-email' | 'cron'
  label: string
  icon: any
  count?: number
}

export function ChatSidebar() {
  const activeView = useStore($activeView)
  const conversations = useStore($conversations)
  const activeConvId = useStore($activeConversationId)
  const approvals = useStore($approvals)
  const userId = useStore($userId)
  const sidebarOpen = useStore($sidebarOpen)

  const pendingApprovalsCount = approvals.length

  const navItems: NavItem[] = [
    { id: 'chat', label: 'Inbox & Chat', icon: Inbox },
    { id: 'approvals', label: 'Approvals & Drafts', icon: ShieldCheck, count: pendingApprovalsCount },
    { id: 'bulk-email', label: 'Bulk Emailer', icon: Mail },
    { id: 'cron', label: 'Cron Jobs', icon: Clock3 },
  ]

  return (
    <>
      {/* Mobile backdrop overlay */}
      {sidebarOpen && (
        <div
          onClick={() => $sidebarOpen.set(false)}
          className="fixed inset-0 bg-black/20 z-40 md:hidden"
        />
      )}

      <aside className={cn(
        "flex h-full w-[var(--sidebar-width)] flex-col border-r border-(--ui-stroke-secondary) bg-(--ui-bg-sidebar) select-none transition-transform duration-200 z-50 shrink-0",
        "max-md:fixed max-md:top-0 max-md:left-0 max-md:bottom-0",
        sidebarOpen ? "translate-x-0" : "max-md:-translate-x-full"
      )}>
        {/* Brand Header */}
        <div className="flex h-[var(--titlebar-height,3rem)] items-center px-4 border-b border-(--ui-stroke-tertiary)">
          <span className="font-mono text-sm font-semibold tracking-wide text-primary">
            ✉ MAILING AGENT
          </span>
        </div>

      {/* Action Button */}
      <div className="p-3">
        <button
          onClick={() => startNewConversation(userId)}
          className="flex w-full items-center justify-center gap-2 rounded-sm bg-primary py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:brightness-110 active:scale-95 transition-all"
        >
          <Plus className="size-4" />
          New Chat
        </button>
      </div>

      {/* Main Product Views */}
      <nav className="flex-1 space-y-0.5 px-2 overflow-y-auto scrollbar-themed">
        {navItems.map(item => {
          const active = activeView === item.id
          const Icon = item.icon

          return (
            <button
              key={item.id}
              onClick={() => $activeView.set(item.id)}
              className={cn(
                'flex w-full items-center justify-between rounded-sm px-3 py-1.5 text-[0.8125rem] transition-colors',
                active
                  ? 'bg-(--ui-bg-tertiary) text-foreground font-semibold'
                  : 'text-(--ui-text-secondary) hover:bg-(--ui-bg-quaternary) hover:text-foreground'
              )}
            >
              <div className="flex items-center gap-2.5">
                <Icon className="size-4 shrink-0 opacity-80" />
                <span>{item.label}</span>
              </div>
              {item.count !== undefined && item.count > 0 && (
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-primary">
                  {item.count}
                </span>
              )}
            </button>
          )
        })}

        {/* Separator */}
        <div className="my-4 h-px bg-border/20 mx-2" />

        {/* Historical Conversation Sessions */}
        <div className="px-2 pb-2 text-[0.6875rem] font-medium tracking-wider text-(--ui-text-quaternary) uppercase">
          Recent Chats
        </div>
        <div className="space-y-0.5 max-h-48 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-(--ui-text-quaternary)">
              No recent chats
            </div>
          ) : (
            conversations.map(conv => {
              const active = activeView === 'chat' && activeConvId === conv.conversation_id

              return (
                <div
                  key={conv.conversation_id}
                  onClick={() => {
                    $activeView.set('chat')
                    selectConversation(conv.conversation_id)
                  }}
                  className={cn(
                    'group flex w-full items-center justify-between gap-2 px-3 py-1.5 text-[0.8125rem] transition-colors text-left select-none cursor-pointer rounded-sm',
                    active
                      ? 'bg-(--ui-bg-tertiary) text-foreground font-semibold'
                      : 'text-(--ui-text-secondary) hover:bg-(--ui-bg-quaternary) hover:text-foreground'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <MessageSquare className="size-3.5 shrink-0 opacity-60" />
                    <span className="truncate">{conv.title}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm('Delete this conversation thread?')) {
                        handleDeleteConversation(conv.conversation_id)
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 text-(--ui-text-tertiary) hover:text-(--ui-red) p-0.5 shrink-0 transition-opacity"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              )
            })
          )}
        </div>
      </nav>

      {/* Settings Bottom Area */}
      <div className="p-3 border-t border-(--ui-stroke-tertiary) bg-(--ui-bg-sidebar)">
        <button
          onClick={openSettings}
          className="flex w-full items-center gap-3 rounded-sm px-3 py-2 text-[0.8125rem] text-(--ui-text-secondary) hover:bg-(--ui-bg-quaternary) hover:text-foreground transition-colors"
        >
          <Settings className="size-4 opacity-80" />
          <span>Settings</span>
        </button>
      </div>
    </aside>
    </>
  )
}
export default ChatSidebar
