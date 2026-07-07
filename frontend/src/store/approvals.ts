/**
 * Approvals Store — tracks pending gateway actions, auto-syncs with backend
 * REST endpoints and the real-time WebSocket channel.
 */

import { atom } from 'nanostores'
import { fetchApprovals, approveAction, rejectAction, type Approval } from '../lib/api'

export const $approvals = atom<Approval[]>([])
export const $approvalsLoading = atom<boolean>(false)
export const $approvalsError = atom<string | null>(null)

export async function loadPendingApprovals(userId: string) {
  $approvalsLoading.set(true)
  $approvalsError.set(null)
  try {
    const list = await fetchApprovals(userId, 'pending')
    $approvals.set(list)
  } catch (err: any) {
    $approvalsError.set(err.message || 'Failed to fetch approvals')
  } finally {
    $approvalsLoading.set(false)
  }
}

export async function handleApprove(approvalId: string, editedPayload?: any) {
  try {
    await approveAction(approvalId, editedPayload)
    // Remove from the local pending queue list on success
    $approvals.set($approvals.get().filter(app => app.approval_id !== approvalId))
  } catch (err: any) {
    alert(`Approval failed: ${err.message}`)
  }
}

export async function handleReject(approvalId: string) {
  try {
    await rejectAction(approvalId)
    // Remove from the local pending queue list on success
    $approvals.set($approvals.get().filter(app => app.approval_id !== approvalId))
  } catch (err: any) {
    alert(`Rejection failed: ${err.message}`)
  }
}

// ── WebSocket live listener ──────────────────────────────────────────────────

let ws: WebSocket | null = null

export function connectApprovalsWebSocket(userId: string) {
  if (ws) {
    ws.close()
  }

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const wsUrl = API_BASE_URL.replace(/^http/, 'ws') + `/ws/${encodeURIComponent(userId)}`

  ws = new WebSocket(wsUrl)

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (data.approval_id && data.action) {
        // Build new Approval object
        const newApproval: Approval = {
          approval_id: data.approval_id,
          action_type: data.action.type,
          payload: data.action.payload || {},
          agent_reasoning: data.action.reasoning || 'Action intercept',
        }
        // Append to state
        $approvals.set([newApproval, ...$approvals.get()])
      }
    } catch (e) {
      console.error('Error parsing WebSocket message:', e)
    }
  }

  ws.onclose = () => {
    // Reconnect after 3 seconds
    setTimeout(() => connectApprovalsWebSocket(userId), 3000)
  }

  ws.onerror = (err) => {
    console.error('WebSocket Error:', err)
  }
}
