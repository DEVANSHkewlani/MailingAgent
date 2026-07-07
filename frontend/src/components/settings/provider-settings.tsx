/**
 * ProviderSettings Component — OAuth connections and AI Credentials.
 * Lets the user connect Gmail and save their custom Groq or Anthropic API Keys.
 */

import { useState, useEffect } from 'react'
import { useStore } from '@nanostores/react'
import { Link as LinkIcon, Mail, Check, Key } from 'lucide-react'
import { getGoogleLoginUrl, checkGoogleAuthStatus } from '../../lib/api'
import { $userId } from '../../store/auth'
import { Button } from '../ui/button'
import { ListRow, SectionHeading } from './primitives'

export function ProviderSettings() {
  const userId = useStore($userId)
  const [googleConnected, setGoogleConnected] = useState(false)

  // Local storage state for custom keys
  const [groqKey, setGroqKey] = useState(localStorage.getItem('mailing_agent_groq_key') || '')
  const [isSaved, setIsSaved] = useState(false)

  // Check backend to see if user has valid credentials in database
  useEffect(() => {
    checkGoogleAuthStatus(userId)
      .then(connected => setGoogleConnected(connected))
      .catch(err => console.error("ProviderSettings: Google status check failed", err))
  }, [userId])

  const handleConnectGoogle = () => {
    window.location.href = getGoogleLoginUrl(userId)
  }

  const handleSaveKeys = () => {
    localStorage.setItem('mailing_agent_groq_key', groqKey)
    setIsSaved(true)
    setTimeout(() => setIsSaved(false), 2000)
  }

  return (
    <div className="space-y-8 select-none">
      {/* 1. Email Connections */}
      <div className="space-y-4">
        <div>
          <SectionHeading icon={Mail} title="Email Provider Connections" />
          <p className="text-xs text-(--ui-text-tertiary) mt-1">
            Authorize your Google account to grant reading and writing access so the agents can check inbox, draft replies, and book calendar invites.
          </p>
        </div>

        <div className="divide-y divide-(--ui-stroke-tertiary)">
          {/* Google connection row */}
          <ListRow
            title={
              <div className="flex items-center gap-2">
                <span className="font-bold text-foreground">Google (Gmail & Calendar)</span>
                {googleConnected ? (
                  <span className="inline-flex items-center gap-1 text-[0.6875rem] font-bold text-[var(--ui-green)] bg-[var(--ui-green)]/10 rounded px-1.5 py-0.5">
                    <Check className="size-3" /> Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[0.6875rem] font-bold text-(--ui-text-tertiary) bg-(--ui-bg-quaternary) rounded px-1.5 py-0.5">
                    Not Connected
                  </span>
                )}
              </div>
            }
            description="Syncs Gmail messages, drafts list, and Google Calendar events availability."
            action={
              <Button
                onClick={handleConnectGoogle}
                className="bg-primary hover:brightness-110 text-primary-foreground font-semibold flex items-center gap-1.5"
              >
                <LinkIcon className="size-3.5" />
                Connect Gmail
              </Button>
            }
          />

          {/* Outlook connector stub */}
          <ListRow
            title={<span className="font-bold text-foreground opacity-60">Microsoft (Outlook & Teams)</span>}
            description="Outlook dynamic provider synchronization support is coming soon in future releases."
            action={
              <Button
                disabled
                variant="outline"
                className="font-semibold text-xs border-(--ui-stroke-tertiary) opacity-50"
              >
                Connect Outlook
              </Button>
            }
          />
        </div>
      </div>

      {/* 2. AI Engine API Keys */}
      <div className="space-y-4 border-t border-(--ui-stroke-tertiary) pt-6">
        <div>
          <SectionHeading icon={Key} title="AI Model Credentials" />
          <p className="text-xs text-(--ui-text-tertiary) mt-1">
            Connect a Groq key (recommended for fast, free execution) to unlock LLM categorizing, scheduling, and drafting.
          </p>
        </div>

        <div className="space-y-4 max-w-lg select-text">
          {/* Groq Key Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-(--ui-text-secondary) select-none">
              Groq API Key (gsk_...)
            </label>
            <input
              type="password"
              placeholder="Paste your Groq API Key"
              value={groqKey}
              onChange={e => setGroqKey(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) text-xs outline-none focus:border-primary placeholder:text-(--ui-text-quaternary) font-mono"
            />
          </div>

          {/* Save trigger */}
          <div className="pt-2 select-none flex items-center gap-3">
            <Button
              onClick={handleSaveKeys}
              className="bg-primary hover:brightness-110 text-primary-foreground font-bold px-5"
            >
              Save Credentials
            </Button>
            {isSaved && (
              <span className="text-xs text-[var(--ui-green)] font-bold flex items-center gap-1">
                <Check className="size-4" /> Keys updated!
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
export default ProviderSettings
