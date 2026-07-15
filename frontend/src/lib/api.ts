/**
 * API Utility — helper functions to connect the Mailing Agent frontend to our backend.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export interface MessageInput {
  user_id: string
  instruction: string
}

export interface Approval {
  approval_id: string
  conversation_id?: string | null
  action_type: string
  payload: any
  agent_reasoning: string
}

export interface Conversation {
  conversation_id: string
  title: string
  updated_at: string
}

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export async function sendMessage(conversationId: string, userId: string, instruction: string) {
  const groqKey = localStorage.getItem('mailing_agent_groq_key') || ''

  const response = await fetch(`${API_BASE_URL}/chat/${conversationId}/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Groq-Api-Key': groqKey
    },
    body: JSON.stringify({ user_id: userId, instruction }),
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json()
}

export async function fetchConversations(userId: string): Promise<Conversation[]> {
  const response = await fetch(`${API_BASE_URL}/chat/conversations?user_id=${encodeURIComponent(userId)}`)
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json()
}

export async function createConversation(conversationId: string, userId: string, title: string) {
  const response = await fetch(`${API_BASE_URL}/chat/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversation_id: conversationId, user_id: userId, title }),
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json()
}

export async function deleteConversation(conversationId: string) {
  const response = await fetch(`${API_BASE_URL}/chat/${conversationId}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json()
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const response = await fetch(`${API_BASE_URL}/chat/${conversationId}/messages`)
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json()
}

export async function fetchApprovals(userId: string, status = 'pending'): Promise<Approval[]> {
  const response = await fetch(`${API_BASE_URL}/approvals?user_id=${encodeURIComponent(userId)}&status=${status}`)
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json()
}

export async function approveAction(approvalId: string, editedPayload?: any) {
  const response = await fetch(`${API_BASE_URL}/approvals/${approvalId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: editedPayload ? JSON.stringify(editedPayload) : undefined,
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json()
}

export async function rejectAction(approvalId: string) {
  const response = await fetch(`${API_BASE_URL}/approvals/${approvalId}/reject`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json()
}

export function getGoogleLoginUrl(userId: string): string {
  const frontendUrl = window.location.origin
  return `${API_BASE_URL}/auth/login?user_id=${encodeURIComponent(userId)}&frontend_url=${encodeURIComponent(frontendUrl)}`
}

export async function fetchEmails(userId: string): Promise<any[]> {
  const response = await fetch(`${API_BASE_URL}/chat/emails?user_id=${encodeURIComponent(userId)}`)
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json()
}

export async function fetchAlerts(userId: string): Promise<any[]> {
  const response = await fetch(`${API_BASE_URL}/chat/alerts?user_id=${encodeURIComponent(userId)}`)
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json()
}

export async function checkGoogleAuthStatus(userId: string): Promise<boolean> {
  const response = await fetch(`${API_BASE_URL}/auth/status?user_id=${encodeURIComponent(userId)}`)
  if (!response.ok) {
    return false
  }
  const data = await response.json()
  return !!data.connected
}

export interface GoogleProfile {
  connected: boolean
  user_id: string
  email?: string
  display_name?: string
  provider?: string
  scopes?: string[]
  expires_at?: string | null
  connected_at?: string | null
}

export async function fetchGoogleProfile(userId: string): Promise<GoogleProfile> {
  const response = await fetch(`${API_BASE_URL}/auth/profile?user_id=${encodeURIComponent(userId)}`)
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json()
}

export interface CronJob {
  id: string
  user_id: string
  conversation_id?: string | null
  name?: string | null
  prompt: string
  schedule_type: 'interval_minutes' | 'daily'
  schedule_value: string
  enabled: boolean
  state: string
  last_run_at?: string | null
  next_run_at?: string | null
  last_error?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export async function fetchCronJobs(userId: string): Promise<CronJob[]> {
  const response = await fetch(`${API_BASE_URL}/cron?user_id=${encodeURIComponent(userId)}`)
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function createCronJob(payload: {
  user_id: string
  name?: string
  prompt: string
  schedule_type: 'interval_minutes' | 'daily'
  schedule_value: string
}): Promise<CronJob> {
  const response = await fetch(`${API_BASE_URL}/cron`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function updateCronJob(jobId: string, payload: Partial<CronJob>): Promise<CronJob> {
  const response = await fetch(`${API_BASE_URL}/cron/${jobId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function pauseCronJob(jobId: string): Promise<CronJob> {
  const response = await fetch(`${API_BASE_URL}/cron/${jobId}/pause`, { method: 'POST' })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function resumeCronJob(jobId: string): Promise<CronJob> {
  const response = await fetch(`${API_BASE_URL}/cron/${jobId}/resume`, { method: 'POST' })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function triggerCronJob(jobId: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/cron/${jobId}/trigger`, { method: 'POST' })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function deleteCronJob(jobId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/cron/${jobId}`, { method: 'DELETE' })
  if (!response.ok) throw new Error(await response.text())
}

export interface SMTPSettings {
  configured: boolean
  smtp_host: string
  smtp_port: number
  smtp_username: string
  smtp_use_tls: boolean
  has_password?: boolean
}

export async function fetchSMTPSettings(userId: string): Promise<SMTPSettings> {
  const response = await fetch(`${API_BASE_URL}/auth/smtp?user_id=${encodeURIComponent(userId)}`)
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function saveSMTPSettings(payload: {
  user_id: string
  smtp_host: string
  smtp_port: number
  smtp_username: string
  smtp_password?: string
  smtp_use_tls: boolean
}): Promise<{ status: string, message: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/smtp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function fetchEmailBody(userId: string, emailId: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/chat/emails/${encodeURIComponent(emailId)}/body?user_id=${encodeURIComponent(userId)}`)
  if (!response.ok) throw new Error(await response.text())
  const data = await response.json()
  return data.body || ""
}

export async function fetchGroqSettings(userId: string): Promise<{ configured: boolean, groq_api_key: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/groq?user_id=${encodeURIComponent(userId)}`)
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function saveGroqSettings(userId: string, key: string): Promise<{ status: string, message: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/groq`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, groq_api_key: key }),
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}


// ─── Bulk Emailer API ────────────────────────────────────────────────────────

export interface BulkSMTPConfig {
  host: string
  port: number
  email: string
  password: string
}

export interface BulkContact {
  email: string
  name?: string
  extra?: Record<string, string>
}

export interface BulkComposePayload {
  from_name?: string
  reply_to?: string
  cc?: string
  subject: string
  body_html: string
  signature?: string
  signature_enabled?: boolean
}

export interface BulkSendRequest {
  smtp: BulkSMTPConfig
  compose: BulkComposePayload
  contacts: BulkContact[]
  column_map?: { email?: string; name?: string; company?: string; role?: string; city?: string }
  delay_seconds?: number
  campaign_name?: string
}

export interface BulkRecipientResult {
  email: string
  name: string
  subject: string
  ok: boolean
  error?: string | null
  message_id?: string | null
}

export interface BulkSendProgress {
  total: number
  sent: number
  failed: number
  current: number
  done: boolean
  stopped: boolean
  result?: BulkRecipientResult | null
}

export interface BulkHistoryEntry {
  job_id: string
  campaign_name?: string | null
  started_at: string
  total: number
  sent: number
  failed: number
  stopped: boolean
  done: boolean
}

export async function testBulkSmtp(cfg: BulkSMTPConfig) {
  const response = await fetch(`${API_BASE_URL}/api/bulk-email/smtp-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function uploadBulkCsv(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch(`${API_BASE_URL}/api/bulk-email/upload-csv`, {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json() as Promise<{ contacts: Record<string, string>[]; columns: string[]; count: number }>
}

export async function startBulkCampaign(request: BulkSendRequest) {
  const response = await fetch(`${API_BASE_URL}/api/bulk-email/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json() as Promise<{ job_id: string; total: number }>
}

export function streamBulkProgress(jobId: string): EventSource {
  return new EventSource(`${API_BASE_URL}/api/bulk-email/stream/${jobId}`)
}

export async function stopBulkCampaign(jobId: string) {
  const response = await fetch(`${API_BASE_URL}/api/bulk-email/stop/${jobId}`, { method: 'POST' })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function fetchBulkHistory(): Promise<BulkHistoryEntry[]> {
  const response = await fetch(`${API_BASE_URL}/api/bulk-email/history`)
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function sendBulkTestEmail(smtp: BulkSMTPConfig, compose: BulkComposePayload, to: string) {
  const response = await fetch(`${API_BASE_URL}/api/bulk-email/test-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ smtp, compose, to }),
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}
