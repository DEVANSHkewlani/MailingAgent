/**
 * API Utility — helper functions to connect the Mailing Agent frontend to our backend.
 */

import { getAuthToken } from '../store/auth'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function authHeaders(extraHeaders: Record<string, string> = {}): HeadersInit {
  const token = getAuthToken()
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...extraHeaders,
  }
}

export interface MessageInput {
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

export async function sendMessage(conversationId: string, instruction: string) {
  const groqKey = localStorage.getItem('mailing_agent_groq_key') || ''

  const response = await fetch(`${API_BASE_URL}/chat/${conversationId}/message`, {
    method: 'POST',
    headers: authHeaders({ 'X-Groq-Api-Key': groqKey }),
    body: JSON.stringify({ instruction }),
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json()
}

export async function fetchConversations(): Promise<Conversation[]> {
  const response = await fetch(`${API_BASE_URL}/chat/conversations`, {
    headers: authHeaders()
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json()
}

export async function createConversation(conversationId: string, title: string) {
  const response = await fetch(`${API_BASE_URL}/chat/conversations`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ conversation_id: conversationId, title }),
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json()
}

export async function deleteConversation(conversationId: string) {
  const response = await fetch(`${API_BASE_URL}/chat/${conversationId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json()
}

export async function fetchMessages(conversationId: string): Promise<Message[]> {
  const response = await fetch(`${API_BASE_URL}/chat/${conversationId}/messages`, {
    headers: authHeaders()
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json()
}

export async function fetchApprovals(status = 'pending'): Promise<Approval[]> {
  const response = await fetch(`${API_BASE_URL}/approvals?status=${status}`, {
    headers: authHeaders()
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json()
}

export async function approveAction(approvalId: string, editedPayload?: any) {
  const response = await fetch(`${API_BASE_URL}/approvals/${approvalId}/approve`, {
    method: 'POST',
    headers: authHeaders(),
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
    headers: authHeaders(),
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json()
}

export function getGoogleLoginUrl(): string {
  const frontendUrl = window.location.origin
  return `${API_BASE_URL}/auth/login?frontend_url=${encodeURIComponent(frontendUrl)}`
}

export async function fetchEmails(): Promise<any[]> {
  const response = await fetch(`${API_BASE_URL}/chat/emails`, {
    headers: authHeaders()
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json()
}

export async function fetchAlerts(): Promise<any[]> {
  const response = await fetch(`${API_BASE_URL}/chat/alerts`, {
    headers: authHeaders()
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return response.json()
}

export async function checkGoogleAuthStatus(): Promise<boolean> {
  const response = await fetch(`${API_BASE_URL}/auth/status`, {
    headers: authHeaders()
  })
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

export async function fetchGoogleProfile(): Promise<GoogleProfile> {
  const response = await fetch(`${API_BASE_URL}/auth/profile`, {
    headers: authHeaders()
  })
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

export async function fetchCronJobs(): Promise<CronJob[]> {
  const response = await fetch(`${API_BASE_URL}/cron`, {
    headers: authHeaders()
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function createCronJob(payload: {
  name?: string
  prompt: string
  schedule_type: 'interval_minutes' | 'daily'
  schedule_value: string
}): Promise<CronJob> {
  const response = await fetch(`${API_BASE_URL}/cron`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function updateCronJob(jobId: string, payload: Partial<CronJob>): Promise<CronJob> {
  const response = await fetch(`${API_BASE_URL}/cron/${jobId}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function pauseCronJob(jobId: string): Promise<CronJob> {
  const response = await fetch(`${API_BASE_URL}/cron/${jobId}/pause`, { 
    method: 'POST',
    headers: authHeaders()
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function resumeCronJob(jobId: string): Promise<CronJob> {
  const response = await fetch(`${API_BASE_URL}/cron/${jobId}/resume`, { 
    method: 'POST',
    headers: authHeaders()
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function triggerCronJob(jobId: string): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/cron/${jobId}/trigger`, { 
    method: 'POST',
    headers: authHeaders()
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function deleteCronJob(jobId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/cron/${jobId}`, { 
    method: 'DELETE',
    headers: authHeaders()
  })
  if (!response.ok) throw new Error(await response.text())
}

export interface CronRun {
  id: string
  job_id: string
  conversation_id: string
  status: 'running' | 'completed' | 'failed'
  output?: string
  error?: string
  started_at: string
  finished_at?: string
}

export async function fetchCronRuns(jobId: string): Promise<CronRun[]> {
  const response = await fetch(`${API_BASE_URL}/cron/${jobId}/runs`, {
    headers: authHeaders()
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}


export interface SMTPSettings {
  configured: boolean
  smtp_host: string
  smtp_port: number
  smtp_username: string
  smtp_use_tls: boolean
  has_password?: boolean
}

export async function fetchSMTPSettings(): Promise<SMTPSettings> {
  const response = await fetch(`${API_BASE_URL}/auth/smtp`, {
    headers: authHeaders()
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function saveSMTPSettings(payload: {
  smtp_host: string
  smtp_port: number
  smtp_username: string
  smtp_password?: string
  smtp_use_tls: boolean
}): Promise<{ status: string, message: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/smtp`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function fetchEmailBody(emailId: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/chat/emails/${encodeURIComponent(emailId)}/body`, {
    headers: authHeaders()
  })
  if (!response.ok) throw new Error(await response.text())
  const data = await response.json()
  return data.body || ""
}

export async function fetchGroqSettings(): Promise<{ configured: boolean, groq_api_key: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/groq`, {
    headers: authHeaders()
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function saveGroqSettings(key: string): Promise<{ status: string, message: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/groq`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ groq_api_key: key }),
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}


// ─── Bulk Emailer API ────────────────────────────────────────────────────────

export interface BulkSMTPConfig {
  host: string
  port: number
  email: string
  password?: string
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
    headers: authHeaders(),
    body: JSON.stringify(cfg),
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function uploadBulkCsv(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  const headers = authHeaders() as Record<string, string>
  // Remove Content-Type so browser sets it with boundary
  delete headers['Content-Type']
  const response = await fetch(`${API_BASE_URL}/api/bulk-email/upload-csv`, {
    method: 'POST',
    headers,
    body: formData,
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json() as Promise<{ contacts: Record<string, string>[]; columns: string[]; count: number }>
}

export async function startBulkCampaign(request: BulkSendRequest) {
  const response = await fetch(`${API_BASE_URL}/api/bulk-email/send`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(request),
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json() as Promise<{ job_id: string; total: number }>
}

export function streamBulkProgress(jobId: string): EventSource {
  const token = getAuthToken()
  return new EventSource(`${API_BASE_URL}/api/bulk-email/stream/${jobId}?token=${encodeURIComponent(token)}`)
}

export async function stopBulkCampaign(jobId: string) {
  const response = await fetch(`${API_BASE_URL}/api/bulk-email/stop/${jobId}`, { 
    method: 'POST',
    headers: authHeaders()
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function fetchBulkHistory(): Promise<BulkHistoryEntry[]> {
  const response = await fetch(`${API_BASE_URL}/api/bulk-email/history`, {
    headers: authHeaders()
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}

export async function sendBulkTestEmail(smtp: BulkSMTPConfig, compose: BulkComposePayload, to: string) {
  const response = await fetch(`${API_BASE_URL}/api/bulk-email/test-email`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ smtp, compose, to }),
  })
  if (!response.ok) throw new Error(await response.text())
  return response.json()
}
