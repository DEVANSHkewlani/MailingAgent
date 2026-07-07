/**
 * AppShell Component — master layout shell.
 * Coordinates sidebar toggles, settings modals, and view swapping.
 * Configured for side-by-side Chat + Inbox splits with a drag resizer.
 */

import { useEffect, useState } from 'react'
import { useStore } from '@nanostores/react'
import { $activeView, $settingsOpen, closeSettings } from '../store/layout'
import { ChatSidebar } from './chat-sidebar'
import { ChatPanel } from './chat-panel'
import { InboxView } from './views/inbox-view'
import { ApprovalsView } from './views/approvals-view'
import { CalendarView } from './views/calendar-view'
import { SettingsView } from './settings'
import { loadConversations } from '../store/chat'
import { loadPendingApprovals, connectApprovalsWebSocket } from '../store/approvals'
import { $userId } from '../store/auth'

export function AppShell() {
  const activeView = useStore($activeView)
  const settingsOpen = useStore($settingsOpen)
  const userId = useStore($userId)

  // Double-pane flexible width state (defaults to 400px)
  const [inboxWidth, setInboxWidth] = useState(400)

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
    loadConversations(userId)
    loadPendingApprovals(userId)
    connectApprovalsWebSocket(userId)
  }, [userId])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Left Sidebar Rail */}
      <ChatSidebar />

      {/* Main Panel View Area */}
      <main className="flex-1 flex min-w-0 bg-(--ui-chat-surface-background) relative z-1 overflow-hidden">
        {activeView === 'chat' && (
          <div className="flex-1 flex min-w-0 h-full overflow-hidden">
            {/* Left Workspace: Conversational Chat */}
            <div className="flex-1 min-w-0 h-full flex flex-col">
              <ChatPanel />
            </div>

            {/* Split Resizer Handle */}
            <div
              className="w-1 cursor-col-resize hover:bg-primary bg-(--ui-stroke-tertiary) transition-colors shrink-0 h-full select-none"
              onMouseDown={handleMouseDown}
            />

            {/* Right Workspace: Live Inbox Feed (Flexible width) */}
            <div
              style={{ width: `${inboxWidth}px` }}
              className="shrink-0 h-full flex flex-col border-l border-(--ui-stroke-secondary)"
            >
              <InboxView />
            </div>
          </div>
        )}
        
        {activeView === 'approvals' && <ApprovalsView />}
        {activeView === 'calendar' && <CalendarView />}
      </main>

      {/* Settings Overlay Dialog */}
      {settingsOpen && <SettingsView onClose={closeSettings} />}
    </div>
  )
}
export default AppShell
