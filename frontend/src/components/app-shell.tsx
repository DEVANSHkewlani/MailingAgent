/**
 * AppShell Component — master layout shell.
 * Coordinates sidebar toggles, settings modals, and view swapping.
 * Configured for side-by-side Chat + Inbox splits with a drag resizer.
 */

import { useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'
import { Menu, Mail } from 'lucide-react'
import { $activeView, $settingsOpen, $sidebarOpen, closeSettings } from '../store/layout'
import { ChatSidebar } from './chat-sidebar'
import { ChatPanel } from './chat-panel'
import { InboxView } from './views/inbox-view'
import { ApprovalsView } from './views/approvals-view'
import { CalendarView } from './views/calendar-view'
import { CronJobsView } from './views/cron-jobs-view'
import { SettingsView } from './settings'
import { loadConversations } from '../store/chat'
import { loadPendingApprovals, connectApprovalsWebSocket } from '../store/approvals'
import { $userId, setUserId } from '../store/auth'

export function AppShell() {
  const activeView = useStore($activeView)
  const settingsOpen = useStore($settingsOpen)
  const userId = useStore($userId)

  // Double-pane flexible width state (defaults to 400px)
  const [inboxWidth, setInboxWidth] = useState(400)
  const [mobileInboxOpen, setMobileInboxOpen] = useState(false)

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = inboxWidth

    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Dragging left increases the right panel's width
      const delta = startX - moveEvent.clientX
      const newWidth = Math.max(280, Math.min(700, startWidth + delta))
      setInboxWidth(newWidth)
    }

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  // Sync historical conversations and approvals list on start
  useEffect(() => {
    // Check if user_id is passed as a query parameter in URL (e.g. after OAuth callback)
    const hash = window.location.hash || ''
    const urlParams = new URLSearchParams(window.location.search || hash.substring(hash.indexOf('?')))
    const urlUserId = urlParams.get('user_id')
    if (urlUserId && urlUserId.length >= 32) {
      setUserId(urlUserId)
      // Clean query parameters from URL
      window.history.replaceState({}, document.title, window.location.pathname + window.location.hash.split('?')[0])
      window.location.reload()
      return
    }

    loadConversations(userId)
    loadPendingApprovals(userId)
    connectApprovalsWebSocket(userId)

    if (localStorage.getItem('open_settings_on_load')) {
      $settingsOpen.set(true)
    }
  }, [userId])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Left Sidebar Rail */}
      <ChatSidebar />

      {/* Main Panel View Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-(--ui-chat-surface-background) relative z-1 overflow-hidden">
        {/* Mobile Header Bar */}
        <div className="h-12 border-b border-(--ui-stroke-tertiary) flex items-center justify-between px-4 md:hidden shrink-0 select-none bg-(--ui-bg-sidebar)">
          <div className="flex items-center">
            <button
              onClick={() => $sidebarOpen.set(true)}
              className="p-1 rounded-sm hover:bg-(--ui-bg-quaternary) mr-3"
            >
              <Menu className="size-5" />
            </button>
            <span className="font-mono text-xs font-semibold tracking-wide text-primary">
              ✉ {activeView === 'chat' ? 'INBOX & CHAT' : activeView === 'approvals' ? 'APPROVALS & DRAFTS' : activeView === 'calendar' ? 'CALENDAR ALERTS' : 'CRON JOBS'}
            </span>
          </div>

          {activeView === 'chat' && (
            <button
              onClick={() => setMobileInboxOpen(!mobileInboxOpen)}
              className="p-1 rounded-sm hover:bg-(--ui-bg-quaternary) text-primary"
            >
              <Mail className="size-5" />
            </button>
          )}
        </div>

        <div className="flex-1 flex min-w-0 min-h-0 overflow-hidden relative">
          {activeView === 'chat' && (
            <div className="flex-1 flex min-w-0 h-full overflow-hidden relative">
              {/* Left Workspace: Conversational Chat */}
              <div className="flex-1 min-w-0 h-full flex flex-col">
                <ChatPanel />
              </div>

              {/* Split Resizer Handle - hidden on mobile */}
              <div
                className="hidden md:block w-1 cursor-col-resize hover:bg-primary bg-(--ui-stroke-tertiary) transition-colors shrink-0 h-full select-none"
                onMouseDown={handleMouseDown}
              />

              {/* Right Workspace: Live Inbox Feed - hidden on mobile */}
              <div
                style={{ width: `${inboxWidth}px` }}
                className="hidden md:flex shrink-0 h-full flex-col border-l border-(--ui-stroke-secondary)"
              >
                <InboxView />
              </div>

              {/* Mobile Inbox Drawer Overlay - slides in from right */}
              {mobileInboxOpen && (
                <>
                  <div
                    onClick={() => setMobileInboxOpen(false)}
                    className="fixed inset-0 bg-black/25 z-40 md:hidden"
                  />
                  <div className="fixed top-12 right-0 bottom-0 left-12 bg-(--ui-bg-sidebar) border-l border-(--ui-stroke-secondary) z-50 flex flex-col md:hidden transition-transform duration-200">
                    <div className="flex justify-end p-2 border-b border-(--ui-stroke-tertiary) bg-(--ui-bg-sidebar)">
                      <button
                        onClick={() => setMobileInboxOpen(false)}
                        className="text-xs font-semibold px-3 py-1 rounded-sm hover:bg-(--ui-bg-quaternary)"
                      >
                        ✕ Close Inbox
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      <InboxView />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          
          {activeView === 'approvals' && <ApprovalsView />}
          {activeView === 'calendar' && <CalendarView />}
          {activeView === 'cron' && <CronJobsView />}
        </div>
      </main>

      {/* Settings Overlay Dialog */}
      {settingsOpen && <SettingsView onClose={closeSettings} />}
    </div>
  )
}
export default AppShell
