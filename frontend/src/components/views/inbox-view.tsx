import { useState, useEffect } from 'react'
import { useStore } from '@nanostores/react'
import { Search, MessageSquare, ArrowLeft } from 'lucide-react'
import { handleSendMessage, $emailRefreshSignal } from '../../store/chat'
import { $userId } from '../../store/auth'
import { Button } from '../ui/button'
import { fetchEmails, fetchEmailBody } from '../../lib/api'

interface EmailItem {
  id: string
  from: string
  subject: string
  preview: string
  time: string
  unread: boolean
}

/**
 * Format an ISO timestamp to a user-friendly relative or localized string.
 * Returns "2h ago", "Yesterday 3:45 PM", "Jul 3, 10:00 AM", etc.
 */
function formatEmailTime(isoString: string): string {
  if (!isoString) return ''
  try {
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return isoString
  }
}

export function InboxView() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedEmail, setSelectedEmail] = useState<EmailItem | null>(null)
  const [emailBody, setEmailBody] = useState<string>('')
  const [loadingBody, setLoadingBody] = useState(false)
  const [emails, setEmails] = useState<EmailItem[]>([])
  const [loading, setLoading] = useState(false)
  
  const userId = useStore($userId)
  const refreshSignal = useStore($emailRefreshSignal)

  // Fetch emails from the real backend database on mount, user change, or after agent sync
  useEffect(() => {
    let active = true
    setLoading(true)
    fetchEmails(userId)
      .then(data => {
        if (active) setEmails(data)
      })
      .catch(err => console.error("InboxView: Failed to load emails", err))
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [userId, refreshSignal])

  const handleSelectEmail = (email: EmailItem) => {
    setSelectedEmail(email)
    setEmailBody('')
    setLoadingBody(true)
    fetchEmailBody(userId, email.id)
      .then(body => {
        setEmailBody(body)
      })
      .catch(err => {
        console.error("InboxView: Failed to load email body", err)
        setEmailBody(email.preview || "Failed to load email body.")
      })
      .finally(() => {
        setLoadingBody(false)
      })
  }

  const filtered = emails.filter(email =>
    email.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
    email.subject.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const triggerAgentSummary = () => {
    handleSendMessage($userId.get(), 'Summarize my unread emails and list action items.')
  }

  const triggerAgentReply = (email: EmailItem) => {
    handleSendMessage($userId.get(), `Draft a reply to ${email.from} regarding "${email.subject}".`)
  }

  return (
    <div className="flex h-full w-full flex-col bg-transparent overflow-hidden">
      {selectedEmail ? (
        /* Reading Pane (Slides in on click) */
        <div className="flex-1 flex flex-col bg-transparent overflow-y-auto scrollbar-themed p-4 space-y-4 select-text">
          {/* Header Action */}
          <button
            onClick={() => setSelectedEmail(null)}
            className="flex items-center gap-1.5 text-xs text-primary font-bold hover:underline self-start mb-2 select-none"
          >
            <ArrowLeft className="size-3.5" /> Back to Inbox
          </button>

          {/* Email Subject */}
          <div className="border-b border-(--ui-stroke-tertiary) pb-3">
            <h3 className="text-[1.125rem] font-bold text-foreground leading-tight">
              {selectedEmail.subject}
            </h3>
            <div className="mt-2 flex items-center justify-between text-xs text-(--ui-text-secondary)">
              <span>From: <strong className="text-foreground">{selectedEmail.from}</strong></span>
              <span className="text-(--ui-text-tertiary) font-mono">{formatEmailTime(selectedEmail.time)}</span>
            </div>
          </div>

          {/* Email Content */}
          <div className="text-xs leading-relaxed text-foreground font-sans whitespace-pre-wrap break-words overflow-x-hidden bg-[var(--ui-bg-editor)] border border-[var(--ui-stroke-secondary)] p-5 shadow-sm min-h-[12rem] rounded-md">
            {loadingBody ? (
              <span className="text-(--ui-text-quaternary) font-mono">Fetching full email content...</span>
            ) : (
              emailBody || selectedEmail.preview
            )}
          </div>

          {/* Action Buttons for Chat connection */}
          <div className="flex flex-col gap-2 pt-2 select-none">
            <Button
              onClick={() => triggerAgentReply(selectedEmail)}
              className="bg-primary hover:brightness-110 text-white font-bold w-full flex items-center justify-center gap-2"
            >
              <MessageSquare className="size-4" />
              Reply with Agent
            </Button>
            <Button
              onClick={() => {
                handleSendMessage($userId.get(), `Set follow-up reminder for email from ${selectedEmail.from} in 2 days.`)
              }}
              variant="outline"
              className="border-(--ui-stroke-secondary) text-xs font-bold w-full"
            >
              Set Follow-up Reminder
            </Button>
          </div>
        </div>
      ) : (
        /* Email List Pane */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search Header */}
          <div className="p-3 border-b border-(--ui-stroke-tertiary) flex gap-2 select-none">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2 size-3.5 text-(--ui-text-tertiary)" />
              <input
                type="text"
                placeholder="Search emails..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) text-xs outline-none focus:border-primary placeholder:text-(--ui-text-tertiary)"
              />
            </div>
            <Button
              size="sm"
              onClick={triggerAgentSummary}
              className="bg-primary hover:brightness-110 text-white text-xs font-bold px-2.5"
            >
              Summarize
            </Button>
          </div>

          {/* Email list */}
          <div className="flex-1 overflow-y-auto scrollbar-themed divide-y divide-(--ui-stroke-tertiary)">
            {loading ? (
              <div className="p-8 text-center text-xs text-(--ui-text-quaternary) font-mono">
                Querying database mail cache...
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-xs text-(--ui-text-quaternary) font-mono">
                No synced emails. Connect your Gmail in Settings and type "sync my inbox" to run the agent.
              </div>
            ) : (
              filtered.map(email => (
                <button
                  key={email.id}
                  onClick={() => handleSelectEmail(email)}
                  className="w-full p-4 text-left transition-colors flex flex-col gap-1.5 hover:bg-(--ui-bg-quinary)"
                >
                  <div className="flex items-center justify-between text-[0.6875rem] font-mono">
                    <span className={`font-bold ${email.unread ? 'text-primary' : 'text-(--ui-text-secondary)'}`}>
                      {email.from}
                    </span>
                    <span className="text-(--ui-text-tertiary)">{formatEmailTime(email.time)}</span>
                  </div>
                  <h4 className={`text-xs truncate ${email.unread ? 'font-bold text-foreground' : 'text-(--ui-text-secondary)'}`}>
                    {email.subject}
                  </h4>
                  <p className="text-[0.75rem] leading-[1.125rem] text-(--ui-text-tertiary) line-clamp-2">
                    {email.preview}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
export default InboxView
