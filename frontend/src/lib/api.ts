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
  return `${API_BASE_URL}/auth/login?user_id=${encodeURIComponent(userId)}`
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


