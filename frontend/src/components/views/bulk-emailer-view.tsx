/**
 * BulkEmailerView — Full-featured bulk email compose, send & history UI.
 * SMTP config → CSV upload → Compose → Send with live progress → History.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'
import { $userId } from '../../store/auth'
import {
  Mail, Upload, Play, Square, FlaskConical, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, History, Settings2, FileText,
} from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import {
  testBulkSmtp,
  uploadBulkCsv,
  startBulkCampaign,
  streamBulkProgress,
  stopBulkCampaign,
  fetchBulkHistory,
  sendBulkTestEmail,
  fetchSMTPSettings,
  type BulkSMTPConfig,
  type BulkComposePayload,
  type BulkSendProgress,
  type BulkHistoryEntry,
  type BulkContact,
} from '../../lib/api'

type Tab = 'compose' | 'history'

export function BulkEmailerView() {
  const userId = useStore($userId)
  const [tab, setTab] = useState<Tab>('compose')

  // ─── SMTP state ──────────────────────────────────────────────────────────
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState(587)
  const [smtpEmail, setSmtpEmail] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [smtpStatus, setSmtpStatus] = useState<string | null>(null)
  const [smtpTesting, setSmtpTesting] = useState(false)
  const [smtpOk, setSmtpOk] = useState(false)
  const [smtpCollapsed, setSmtpCollapsed] = useState(false)

  // ─── CSV state ───────────────────────────────────────────────────────────
  const [contacts, setContacts] = useState<Record<string, string>[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [csvName, setCsvName] = useState<string | null>(null)
  const [csvError, setCsvError] = useState<string | null>(null)
  const [colEmail, setColEmail] = useState('email')
  const [colName, setColName] = useState('name')
  const fileRef = useRef<HTMLInputElement>(null)

  // ─── Compose state ───────────────────────────────────────────────────────
  const [fromName, setFromName] = useState('')
  const [replyTo, setReplyTo] = useState('')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [delaySec, setDelaySec] = useState(3)

  // ─── Send state ──────────────────────────────────────────────────────────
  const [sending, setSending] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [progress, setProgress] = useState<BulkSendProgress | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)

  // ─── History state ───────────────────────────────────────────────────────
  const [history, setHistory] = useState<BulkHistoryEntry[]>([])
  const [histLoading, setHistLoading] = useState(false)

  const smtpCfg: BulkSMTPConfig = useMemo(() => ({
    host: smtpHost, port: smtpPort, email: smtpEmail, password: smtpPassword,
  }), [smtpHost, smtpPort, smtpEmail, smtpPassword, userId])

  const composeCfg: BulkComposePayload = useMemo(() => ({
    from_name: fromName, reply_to: replyTo || undefined, cc: cc || undefined,
    subject, body_html: bodyHtml,
  }), [fromName, replyTo, cc, subject, bodyHtml])

  const canSend = smtpOk && contacts.length > 0 && subject.trim().length > 0 && bodyHtml.trim().length > 0

  // Load saved SMTP settings on mount
  useEffect(() => {
    fetchSMTPSettings()
      .then(cfg => {
        if (cfg.configured) {
          setSmtpHost(cfg.smtp_host || '')
          setSmtpPort(cfg.smtp_port || 587)
          setSmtpEmail(cfg.smtp_username || '')
          if (cfg.has_password) {
            setSmtpPassword('__SAVED_PASSWORD__')
            setSmtpOk(true)
          }
        }
      })
      .catch(err => console.error("BulkEmailerView: Failed to load SMTP settings", err))
  }, [userId])

  // ─── Handlers ────────────────────────────────────────────────────────────

  async function handleSmtpTest() {
    setSmtpTesting(true)
    setSmtpStatus(null)
    try {
      const r = await testBulkSmtp(smtpCfg)
      setSmtpOk(r.ok)
      setSmtpStatus(r.message)
    } catch (e: any) {
      setSmtpOk(false)
      setSmtpStatus(e.message)
    } finally {
      setSmtpTesting(false)
    }
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvError(null)
    try {
      const data = await uploadBulkCsv(file)
      setContacts(data.contacts)
      setColumns(data.columns)
      setCsvName(file.name)
      // Auto-detect email/name columns
      const lowerCols = data.columns.map(c => c.toLowerCase())
      if (lowerCols.includes('email')) setColEmail(data.columns[lowerCols.indexOf('email')])
      if (lowerCols.includes('name')) setColName(data.columns[lowerCols.indexOf('name')])
    } catch (err: any) {
      setCsvError(err.message)
    }
  }

  async function handleTestEmail() {
    const to = prompt('Send test email to:')
    if (!to) return
    try {
      const r = await sendBulkTestEmail(smtpCfg, composeCfg, to)
      alert(r.ok ? `✓ Test email sent to ${to}` : `✗ Failed: ${r.error}`)
    } catch (e: any) {
      alert(`Error: ${e.message}`)
    }
  }

  async function handleStartSend() {
    setSending(true)
    setSendError(null)
    setProgress(null)
    try {
      const mapped: BulkContact[] = contacts.map(row => ({
        email: row[colEmail] || '',
        name: row[colName] || '',
        extra: row,
      }))
      const { job_id } = await startBulkCampaign({
        smtp: smtpCfg,
        compose: composeCfg,
        contacts: mapped,
        column_map: { email: colEmail, name: colName },
        delay_seconds: delaySec,
        campaign_name: campaignName || undefined,
      })
      setJobId(job_id)

      // Connect SSE
      const es = streamBulkProgress(job_id)
      esRef.current = es
      es.onmessage = (ev) => {
        try {
          const p: BulkSendProgress = JSON.parse(ev.data)
          setProgress(p)
          if (p.done || p.stopped) {
            es.close()
            setSending(false)
          }
        } catch { /* ignore parse errors */ }
      }
      es.onerror = () => {
        es.close()
        setSending(false)
      }
    } catch (e: any) {
      setSendError(e.message)
      setSending(false)
    }
  }

  async function handleStop() {
    if (jobId) {
      await stopBulkCampaign(jobId)
    }
  }

  async function loadHistory() {
    setHistLoading(true)
    try {
      setHistory(await fetchBulkHistory())
    } catch { /* ignore */ }
    finally { setHistLoading(false) }
  }

  useEffect(() => {
    if (tab === 'history') loadHistory()
  }, [tab])

  // Cleanup SSE on unmount
  useEffect(() => () => { esRef.current?.close() }, [])

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-themed">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-(--ui-stroke-tertiary) pb-4">
          <div className="flex items-center gap-2">
            <Mail className="size-5 text-primary" />
            <h2 className="text-[1.125rem] font-bold text-foreground">Bulk Emailer</h2>
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant={tab === 'compose' ? 'default' : 'outline'}
              onClick={() => setTab('compose')}
            >
              <FileText className="size-3.5" /> Compose
            </Button>
            <Button
              size="sm"
              variant={tab === 'history' ? 'default' : 'outline'}
              onClick={() => setTab('history')}
            >
              <History className="size-3.5" /> History
            </Button>
          </div>
        </div>

        {tab === 'compose' && (
          <div className="space-y-5">
            {/* ─── SMTP Config Panel ─────────────────────────────────────── */}
            <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) overflow-hidden">
              <button
                onClick={() => setSmtpCollapsed(!smtpCollapsed)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-(--ui-bg-quaternary) transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Settings2 className="size-4 opacity-70" />
                  SMTP Configuration
                  {smtpOk && <Badge variant="success">Connected</Badge>}
                </div>
                {smtpCollapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
              </button>
              {!smtpCollapsed && (
                <div className="px-4 pb-4 space-y-3 border-t border-(--ui-stroke-tertiary)">
                  <div className="grid gap-3 md:grid-cols-2 pt-3">
                    <input
                      value={smtpHost} onChange={e => setSmtpHost(e.target.value)}
                      placeholder="SMTP Host (e.g. smtp.gmail.com)"
                      className="rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-3 py-2 text-xs outline-none focus:border-primary"
                    />
                    <input
                      type="number" value={smtpPort} onChange={e => setSmtpPort(+e.target.value)}
                      placeholder="Port (587)"
                      className="rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-3 py-2 text-xs outline-none focus:border-primary"
                    />
                    <input
                      value={smtpEmail} onChange={e => setSmtpEmail(e.target.value)}
                      placeholder="Email / Login"
                      className="rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-3 py-2 text-xs outline-none focus:border-primary"
                    />
                    <input
                      type="password" value={smtpPassword} onChange={e => setSmtpPassword(e.target.value)}
                      placeholder="App Password"
                      className="rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-3 py-2 text-xs outline-none focus:border-primary"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Button size="sm" onClick={handleSmtpTest} disabled={smtpTesting || !smtpHost || !smtpEmail}>
                      {smtpTesting ? 'Testing...' : 'Test Connection'}
                    </Button>
                    {smtpStatus && (
                      <span className={`text-xs ${smtpOk ? 'text-green-400' : 'text-(--ui-red)'}`}>
                        {smtpStatus}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ─── CSV Upload ────────────────────────────────────────────── */}
            <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Upload className="size-4 opacity-70" />
                Recipients (CSV)
              </div>
              <div className="flex items-center gap-3">
                <input ref={fileRef} type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
                <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload className="size-3.5" /> Upload CSV
                </Button>
                {csvName && (
                  <span className="text-xs text-(--ui-text-secondary)">
                    {csvName} — {contacts.length} contacts
                  </span>
                )}
              </div>
              {csvError && <div className="text-xs text-(--ui-red)">{csvError}</div>}

              {columns.length > 0 && (
                <div className="flex flex-wrap gap-3 pt-1">
                  <label className="text-xs text-(--ui-text-secondary) flex items-center gap-1">
                    Email col:
                    <select value={colEmail} onChange={e => setColEmail(e.target.value)}
                      className="rounded border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-2 py-1 text-xs outline-none">
                      {columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-(--ui-text-secondary) flex items-center gap-1">
                    Name col:
                    <select value={colName} onChange={e => setColName(e.target.value)}
                      className="rounded border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-2 py-1 text-xs outline-none">
                      {columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                </div>
              )}

              {contacts.length > 0 && (
                <div className="max-h-40 overflow-auto rounded-lg border border-(--ui-stroke-tertiary)">
                  <table className="w-full text-xs">
                    <thead className="bg-(--ui-bg-quinary) sticky top-0">
                      <tr>
                        {columns.slice(0, 5).map(c => (
                          <th key={c} className="px-3 py-1.5 text-left font-semibold text-(--ui-text-secondary)">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.slice(0, 10).map((row, i) => (
                        <tr key={i} className="border-t border-(--ui-stroke-tertiary)">
                          {columns.slice(0, 5).map(c => (
                            <td key={c} className="px-3 py-1 text-(--ui-text-secondary) truncate max-w-[150px]">{row[c]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {contacts.length > 10 && (
                    <div className="px-3 py-1 text-[0.6875rem] text-(--ui-text-tertiary) bg-(--ui-bg-quinary)">
                      ... and {contacts.length - 10} more
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ─── Compose Editor ────────────────────────────────────────── */}
            <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-4 space-y-3">
              <div className="text-sm font-semibold text-foreground">Compose</div>
              <div className="grid gap-3 md:grid-cols-2">
                <input value={campaignName} onChange={e => setCampaignName(e.target.value)}
                  placeholder="Campaign name (optional)"
                  className="rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-3 py-2 text-xs outline-none focus:border-primary" />
                <input value={fromName} onChange={e => setFromName(e.target.value)}
                  placeholder="From Name (display name)"
                  className="rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-3 py-2 text-xs outline-none focus:border-primary" />
                <input value={replyTo} onChange={e => setReplyTo(e.target.value)}
                  placeholder="Reply-To (optional)"
                  className="rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-3 py-2 text-xs outline-none focus:border-primary" />
                <input value={cc} onChange={e => setCc(e.target.value)}
                  placeholder="CC (comma-separated, optional)"
                  className="rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-3 py-2 text-xs outline-none focus:border-primary" />
              </div>
              <input value={subject} onChange={e => setSubject(e.target.value)}
                placeholder="Subject — use $name, $company, $role for personalization"
                className="w-full rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-3 py-2 text-xs outline-none focus:border-primary" />
              <textarea value={bodyHtml} onChange={e => setBodyHtml(e.target.value)}
                placeholder="Email body (HTML supported) — use $name, $company, $email, $role, $city for personalization"
                rows={8}
                className="w-full rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-3 py-2 text-xs outline-none focus:border-primary font-mono resize-y" />
              <div className="text-[0.6875rem] text-(--ui-text-tertiary)">
                Placeholders: <code className="text-primary">$name</code> <code className="text-primary">$email</code> <code className="text-primary">$company</code> <code className="text-primary">$role</code> <code className="text-primary">$city</code> — replaced per recipient from CSV columns
              </div>
            </div>

            {/* ─── Send Controls ──────────────────────────────────────────── */}
            <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs text-(--ui-text-secondary) flex items-center gap-1">
                  Delay (s):
                  <input type="number" value={delaySec} onChange={e => setDelaySec(+e.target.value)}
                    min={0} max={60} className="w-16 rounded border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) px-2 py-1 text-xs outline-none" />
                </label>
                <Button size="sm" variant="outline" onClick={handleTestEmail} disabled={!smtpOk || !subject}>
                  <FlaskConical className="size-3.5" /> Send Test
                </Button>
                {!sending ? (
                  <Button size="sm" onClick={handleStartSend} disabled={!canSend} className="bg-primary text-primary-foreground">
                    <Play className="size-3.5" /> Start Campaign ({contacts.length})
                  </Button>
                ) : (
                  <Button size="sm" variant="destructive" onClick={handleStop}>
                    <Square className="size-3.5" /> Stop
                  </Button>
                )}
              </div>

              {sendError && <div className="text-xs text-(--ui-red)">{sendError}</div>}

              {/* Progress Bar */}
              {progress && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-(--ui-text-secondary)">
                    <span>{progress.current} / {progress.total}</span>
                    <span>
                      <span className="text-green-400">{progress.sent} sent</span>
                      {progress.failed > 0 && <span className="text-(--ui-red) ml-2">{progress.failed} failed</span>}
                    </span>
                  </div>
                  <div className="h-2 bg-(--ui-bg-quinary) rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-200"
                      style={{
                        width: `${(progress.current / progress.total) * 100}%`,
                        background: progress.failed > 0 ? 'linear-gradient(90deg, var(--ui-green, #22c55e), var(--color-primary))' : 'var(--color-primary)',
                      }}
                    />
                  </div>
                  {progress.result && (
                    <div className="flex items-center gap-2 text-xs">
                      {progress.result.ok
                        ? <CheckCircle2 className="size-3.5 text-green-400" />
                        : <XCircle className="size-3.5 text-(--ui-red)" />
                      }
                      <span className="text-(--ui-text-secondary) truncate">
                        {progress.result.email} — {progress.result.ok ? 'Sent' : progress.result.error}
                      </span>
                    </div>
                  )}
                  {progress.done && (
                    <div className="text-xs font-semibold text-green-400">
                      ✓ Campaign complete — {progress.sent} sent, {progress.failed} failed
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── History Tab ──────────────────────────────────────────────── */}
        {tab === 'history' && (
          <div className="space-y-3">
            {histLoading ? (
              <div className="p-8 text-center text-xs text-(--ui-text-tertiary)">Loading history...</div>
            ) : history.length === 0 ? (
              <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-8 text-center">
                <div className="text-sm font-medium text-foreground">No campaigns yet</div>
                <p className="mt-1 text-xs text-(--ui-text-tertiary)">Start your first bulk email campaign from the Compose tab.</p>
              </div>
            ) : (
              history.map(h => (
                <div key={h.job_id} className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm text-foreground truncate">
                          {h.campaign_name || 'Unnamed Campaign'}
                        </h3>
                        <Badge variant={h.done ? 'success' : h.stopped ? 'muted' : 'default'}>
                          {h.done ? 'Done' : h.stopped ? 'Stopped' : 'Running'}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.6875rem] text-(--ui-text-tertiary)">
                        <span>{new Date(h.started_at).toLocaleString()}</span>
                        <span>Total: {h.total}</span>
                        <span className="text-green-400">Sent: {h.sent}</span>
                        {h.failed > 0 && <span className="text-(--ui-red)">Failed: {h.failed}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default BulkEmailerView
