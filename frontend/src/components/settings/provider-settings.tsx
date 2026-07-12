/**
 * ProviderSettings Component — OAuth connections, SMTP Credentials, and AI Credentials.
 * Lets the user connect Gmail, configure personal SMTP settings, and save their custom Groq Key.
 */

import { useState, useEffect } from 'react'
import { useStore } from '@nanostores/react'
import { Link as LinkIcon, Mail, Check, Key, Server } from 'lucide-react'
import {
  getGoogleLoginUrl,
  checkGoogleAuthStatus,
  fetchGoogleProfile,
  fetchSMTPSettings,
  saveSMTPSettings,
  fetchGroqSettings,
  saveGroqSettings,
  type GoogleProfile
} from '../../lib/api'
import { $userId } from '../../store/auth'
import { Button } from '../ui/button'
import { ListRow, SectionHeading } from './primitives'

export function ProviderSettings() {
  const userId = useStore($userId)
  const [googleConnected, setGoogleConnected] = useState(false)
  const [googleProfile, setGoogleProfile] = useState<GoogleProfile | null>(null)

  // Local storage state for custom keys
  const [groqKey, setGroqKey] = useState(localStorage.getItem('mailing_agent_groq_key') || '')
  const [isSaved, setIsSaved] = useState(false)

  // SMTP Settings State
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState(587)
  const [smtpUsername, setSmtpUsername] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [smtpUseTls, setSmtpUseTls] = useState(true)
  const [smtpSaved, setSmtpSaved] = useState(false)
  const [smtpHasPassword, setSmtpHasPassword] = useState(false)

  // Check backend to see if user has valid credentials in database
  useEffect(() => {
    checkGoogleAuthStatus(userId)
      .then(connected => setGoogleConnected(connected))
      .catch(err => console.error("ProviderSettings: Google status check failed", err))
    fetchGoogleProfile(userId)
      .then(profile => {
        setGoogleProfile(profile)
        setGoogleConnected(profile.connected)
      })
      .catch(err => console.error("ProviderSettings: Google profile fetch failed", err))

    // Load SMTP Settings from DB
    fetchSMTPSettings(userId)
      .then(cfg => {
        setSmtpHost(cfg.smtp_host || '')
        setSmtpPort(cfg.smtp_port || 587)
        setSmtpUsername(cfg.smtp_username || '')
        setSmtpUseTls(cfg.smtp_use_tls)
        setSmtpHasPassword(cfg.has_password || false)
      })
      .catch(err => console.error("ProviderSettings: SMTP settings load failed", err))

    // Load Groq Settings from DB
    fetchGroqSettings(userId)
      .then(cfg => {
        if (cfg.groq_api_key) {
          setGroqKey(cfg.groq_api_key)
          localStorage.setItem('mailing_agent_groq_key', cfg.groq_api_key)
        }
      })
      .catch(err => console.error("ProviderSettings: Groq settings load failed", err))
  }, [userId])

  const handleConnectGoogle = () => {
    localStorage.setItem('open_settings_on_load', 'providers')
    window.location.href = getGoogleLoginUrl(userId)
  }

  const handleSaveKeys = () => {
    localStorage.setItem('mailing_agent_groq_key', groqKey)
    saveGroqSettings(userId, groqKey)
      .then(() => {
        setIsSaved(true)
        setTimeout(() => setIsSaved(false), 2000)
      })
      .catch(err => {
        console.error("Failed to save Groq Key to database", err)
        setIsSaved(true)
        setTimeout(() => setIsSaved(false), 2000)
      })
  }

  const handleSaveSMTPSettings = () => {
    saveSMTPSettings({
      user_id: userId,
      smtp_host: smtpHost,
      smtp_port: smtpPort,
      smtp_username: smtpUsername,
      smtp_password: smtpPassword || undefined,
      smtp_use_tls: smtpUseTls
    })
      .then(() => {
        setSmtpSaved(true)
        setSmtpHasPassword(true)
        setSmtpPassword('') // clear password field after saving
        setTimeout(() => setSmtpSaved(false), 2000)
      })
      .catch(err => {
        console.error("Failed to save SMTP settings", err)
        alert("Failed to save SMTP settings")
      })
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
            description={
              googleProfile?.connected ? (
                <div className="space-y-1">
                  <div>Connected as {googleProfile.email || googleProfile.display_name || 'Google account'}.</div>
                  <div className="font-mono text-[0.6875rem] text-(--ui-text-quaternary)">
                    User ID: {googleProfile.user_id}
                  </div>
                  {googleProfile.expires_at && (
                    <div>Token expires: {new Date(googleProfile.expires_at).toLocaleString()}</div>
                  )}
                  {googleProfile.scopes && googleProfile.scopes.length > 0 && (
                    <div className="max-w-xl break-words text-[0.6875rem] text-(--ui-text-quaternary)">
                      Scopes: {googleProfile.scopes.join(', ')}
                    </div>
                  )}
                </div>
              ) : (
                'Syncs Gmail messages, drafts list, and Google Calendar events availability.'
              )
            }
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

      {/* 2. User-Specific SMTP Configuration */}
      <div className="space-y-4 border-t border-(--ui-stroke-tertiary) pt-6">
        <div>
          <SectionHeading icon={Server} title="Personal SMTP Credentials" />
          <p className="text-xs text-(--ui-text-tertiary) mt-1">
            Configure your personal SMTP outgoing mail server parameters. When set, outgoing emails will be dispatched using these settings instead of OAuth REST APIs.
          </p>
        </div>

        <div className="space-y-4 max-w-lg select-text">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-(--ui-text-secondary) select-none">
                SMTP Host
              </label>
              <input
                type="text"
                placeholder="e.g. smtp.gmail.com"
                value={smtpHost}
                onChange={e => setSmtpHost(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) text-xs outline-none focus:border-primary placeholder:text-(--ui-text-quaternary)"
              />
            </div>
            <div className="col-span-1 flex flex-col gap-1.5">
              <label className="text-[11px] font-bold text-(--ui-text-secondary) select-none">
                SMTP Port
              </label>
              <input
                type="number"
                placeholder="587"
                value={smtpPort}
                onChange={e => setSmtpPort(parseInt(e.target.value) || 587)}
                className="w-full px-3 py-1.5 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) text-xs outline-none focus:border-primary placeholder:text-(--ui-text-quaternary)"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-(--ui-text-secondary) select-none">
              SMTP Username (Email)
            </label>
            <input
              type="text"
              placeholder="e.g. user@gmail.com"
              value={smtpUsername}
              onChange={e => setSmtpUsername(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) text-xs outline-none focus:border-primary placeholder:text-(--ui-text-quaternary)"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-(--ui-text-secondary) select-none flex items-center justify-between">
              <span>SMTP Password (or App Password)</span>
              {smtpHasPassword && (
                <span className="text-[10px] text-green-600 font-semibold flex items-center gap-1 font-mono">
                  <Check className="size-3" /> Password Saved
                </span>
              )}
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={smtpPassword}
              onChange={e => setSmtpPassword(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) text-xs outline-none focus:border-primary placeholder:text-(--ui-text-quaternary) font-mono"
            />
          </div>

          <div className="flex items-center gap-2 select-none py-1">
            <input
              type="checkbox"
              id="smtp_tls"
              checked={smtpUseTls}
              onChange={e => setSmtpUseTls(e.target.checked)}
              className="rounded border-(--ui-stroke-tertiary)"
            />
            <label htmlFor="smtp_tls" className="text-xs text-(--ui-text-secondary) font-semibold cursor-pointer">
              Use TLS encryption (recommended)
            </label>
          </div>

          <div className="select-none flex items-center gap-3">
            <Button
              onClick={handleSaveSMTPSettings}
              className="bg-primary hover:brightness-110 text-primary-foreground font-bold px-5"
            >
              Save SMTP Config
            </Button>
            {smtpSaved && (
              <span className="text-xs text-[var(--ui-green)] font-bold flex items-center gap-1">
                <Check className="size-4" /> SMTP Settings saved!
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 3. AI Engine API Keys */}
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
export default ProviderSettings;
