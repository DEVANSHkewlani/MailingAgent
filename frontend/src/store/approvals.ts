/**
 * Approvals Store — tracks pending gateway actions, auto-syncs with backend
 * REST endpoints and the real-time WebSocket channel.
 */

import { atom } from 'nanostores'
import { fetchApprovals, approveAction, rejectAction, type Approval } from '../lib/api'
import { getAuthToken } from './auth'

export const $approvals = atom<Approval[]>([])
export const $approvalsLoading = atom<boolean>(false)
export const $approvalsError = atom<string | null>(null)
export const $approvalSubmittingIds = atom<string[]>([])

function mergeApprovals(existing: Approval[], incoming: Approval[]): Approval[] {
  const byId = new Map<string, Approval>()
  for (const app of existing) byId.set(app.approval_id, app)
  for (const app of incoming) byId.set(app.approval_id, app)
  return Array.from(byId.values())
}

export async function loadPendingApprovals() {
  $approvalsLoading.set(true)
  $approvalsError.set(null)
  try {
    const list = await fetchApprovals('pending')
    $approvals.set(mergeApprovals([], list))
  } catch (err: any) {
    $approvalsError.set(err.message || 'Failed to fetch approvals')
  } finally {
    $approvalsLoading.set(false)
  }
}

export async function handleApprove(approvalId: string, editedPayload?: any) {
  if ($approvalSubmittingIds.get().includes(approvalId)) return
  $approvalSubmittingIds.set([...$approvalSubmittingIds.get(), approvalId])
  try {
    await approveAction(approvalId, editedPayload)
    // Remove from the local pending queue list on success
    $approvals.set($approvals.get().filter(app => app.approval_id !== approvalId))
  } catch (err: any) {
    alert(`Approval failed: ${err.message}`)
  } finally {
    $approvalSubmittingIds.set($approvalSubmittingIds.get().filter(id => id !== approvalId))
  }
}

export async function handleReject(approvalId: string) {
  if ($approvalSubmittingIds.get().includes(approvalId)) return
  $approvalSubmittingIds.set([...$approvalSubmittingIds.get(), approvalId])
  try {
    await rejectAction(approvalId)
    // Remove from the local pending queue list on success
    $approvals.set($approvals.get().filter(app => app.approval_id !== approvalId))
  } catch (err: any) {
    alert(`Rejection failed: ${err.message}`)
  } finally {
    $approvalSubmittingIds.set($approvalSubmittingIds.get().filter(id => id !== approvalId))
  }
}

// ── WebSocket live listener ──────────────────────────────────────────────────

let ws: WebSocket | null = null

export function connectApprovalsWebSocket() {
  if (ws) {
    ws.close()
  }

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const token = getAuthToken()
  const wsUrl = API_BASE_URL.replace(/^http/, 'ws') + `/ws?token=${encodeURIComponent(token)}`

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
        $approvals.set(mergeApprovals($approvals.get(), [newApproval]))
      }
    } catch (e) {
      console.error('Error parsing WebSocket message:', e)
    }
  }

  ws.onclose = () => {
    // Reconnect after 3 seconds
    setTimeout(() => connectApprovalsWebSocket(), 3000)
  }

  ws.onerror = (err) => {
    console.error('WebSocket Error:', err)
  }
}
