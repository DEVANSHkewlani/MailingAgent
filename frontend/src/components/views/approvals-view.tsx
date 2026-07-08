/**
 * ApprovalsView Component — permission gateway approvals queue.
 * Displays pending email sends, drafts, and calendar updates with inline editors.
 */

import { useState } from 'react'
import { useStore } from '@nanostores/react'
import { Check, X, ShieldAlert, Edit2, Save, CornerDownRight } from 'lucide-react'
import { $approvals, $approvalsLoading, $approvalsError, $approvalSubmittingIds, handleApprove, handleReject } from '../../store/approvals'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'

export function ApprovalsView() {
  const approvals = useStore($approvals)
  const loading = useStore($approvalsLoading)
  const error = useStore($approvalsError)
  const submittingIds = useStore($approvalSubmittingIds)

  // Track inline edits per approval row
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const startEdit = (id: string, currentVal: string) => {
    setEditingId(id)
    setEditText(currentVal)
  }

  const saveEdit = (approvalId: string, payload: any, textKey: string) => {
    const updatedPayload = { ...payload, [textKey]: editText }
    handleApprove(approvalId, updatedPayload)
    setEditingId(null)
  }

  const getRiskLevel = (actionType: string, payload: any): 'LOW' | 'MEDIUM' | 'HIGH' => {
    if (actionType === 'send_email') {
      const to = payload.to || ''
      // If external domain, rate it high risk
      if (to.includes('@partner.com') || to.includes('@client.com')) return 'HIGH'
      return 'MEDIUM'
    }
    return 'LOW'
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="mt-3 text-xs text-(--ui-text-tertiary)">Loading approvals queue...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-center text-xs text-(--ui-red)">
        Error: {error}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-themed space-y-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-(--ui-stroke-tertiary) pb-4">
          <ShieldAlert className="size-5 text-primary" />
          <h2 className="text-[1.125rem] font-bold text-foreground">Permission Gateway Queue</h2>
        </div>

        {approvals.length === 0 ? (
          <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-8 text-center select-none">
            <ShieldAlert className="size-8 mx-auto text-(--ui-text-quaternary) opacity-50 mb-3" />
            <div className="text-[0.875rem] font-medium text-foreground">All Clear!</div>
            <p className="mt-1 text-xs text-(--ui-text-tertiary)">
              There are no pending actions awaiting manual human confirmation.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {approvals.map(app => {
              const risk = getRiskLevel(app.action_type, app.payload)
              const isEmail = app.action_type === 'send_email' || app.action_type === 'create_draft'
              const isSubmitting = submittingIds.includes(app.approval_id)

              return (
                <div
                  key={app.approval_id}
                  className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) overflow-hidden shadow-sm flex flex-col"
                >
                  {/* Approval Top Row */}
                  <div className="flex items-center justify-between bg-(--ui-bg-sidebar) px-4 py-3 border-b border-(--ui-stroke-tertiary)">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold uppercase text-primary">
                        {isEmail ? '📧 Send Email' : '📅 Calendar Sync'}
                      </span>
                      <Badge
                        variant={risk === 'HIGH' ? 'destructive' : risk === 'MEDIUM' ? 'warning' : 'success'}
                      >
                        {risk} Risk
                      </Badge>
                    </div>
                    <span className="text-[0.6875rem] font-mono text-(--ui-text-quaternary)">
                      ID: {app.approval_id.slice(0, 8)}
                    </span>
                  </div>

                  {/* Body Content */}
                  <div className="p-4 space-y-4 flex-1">
                    {/* Agent Reasoning */}
                    {app.agent_reasoning && (
                      <div className="text-xs text-(--ui-text-secondary) bg-(--ui-bg-quinary) rounded-lg p-2.5 flex items-start gap-2 border border-(--ui-stroke-quaternary)">
                        <CornerDownRight className="size-4 text-primary shrink-0 mt-0.5" />
                        <div>
                          <strong className="text-[0.6875rem] text-(--ui-text-tertiary) block uppercase font-mono mb-0.5">
                            Agent Reasoning
                          </strong>
                          <span>{app.agent_reasoning}</span>
                        </div>
                      </div>
                    )}

                    {/* Action Payload Details */}
                    {isEmail ? (
                      /* Email drafts */
                      <div className="space-y-3">
                        <div className="grid grid-cols-[3rem_1fr] text-xs gap-1">
                          <span className="text-(--ui-text-tertiary) font-semibold">To:</span>
                          <span className="text-foreground select-text">{app.payload.to || '(not set)'}</span>
                          <span className="text-(--ui-text-tertiary) font-semibold">Subject:</span>
                          <span className="text-foreground select-text font-medium">{app.payload.subject || '(no subject)'}</span>
                        </div>

                        {/* Email Body Draft Text */}
                        <div className="border border-(--ui-stroke-tertiary) rounded-lg overflow-hidden bg-(--ui-bg-chrome)">
                          <div className="px-3 py-1.5 bg-(--ui-bg-quinary) border-b border-(--ui-stroke-tertiary) flex justify-between items-center">
                            <span className="text-[0.6875rem] font-semibold text-(--ui-text-secondary)">
                              Response Body
                            </span>
                            {editingId !== app.approval_id ? (
                              <button
                                onClick={() => startEdit(app.approval_id, app.payload.body)}
                                className="flex items-center gap-1 text-[0.6875rem] text-primary hover:underline font-semibold"
                              >
                                <Edit2 className="size-3" /> Edit
                              </button>
                            ) : (
                              <button
                                onClick={() => saveEdit(app.approval_id, app.payload, 'body')}
                                className="flex items-center gap-1 text-[0.6875rem] text-[var(--ui-green)] hover:underline font-semibold"
                              >
                                <Save className="size-3" /> Save Changes
                              </button>
                            )}
                          </div>
                          {editingId === app.approval_id ? (
                            <textarea
                              value={editText}
                              onChange={e => setEditText(e.target.value)}
                              rows={8}
                              className="w-full bg-transparent px-3 py-2.5 text-xs text-foreground outline-none resize-none font-sans leading-5 scrollbar-themed"
                            />
                          ) : (
                            <div className="px-3 py-2.5 text-xs text-foreground font-sans leading-5 whitespace-pre-wrap select-text max-h-48 overflow-y-auto scrollbar-themed">
                              {app.payload.body}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Calendar Events */
                      <div className="space-y-2 text-xs">
                        <div className="grid grid-cols-[6rem_1fr] gap-1">
                          <span className="text-(--ui-text-tertiary) font-semibold">Summary:</span>
                          <span className="text-foreground font-medium">{app.payload.title || app.payload.summary || '(untitled)'}</span>
                          <span className="text-(--ui-text-tertiary) font-semibold">Start Time:</span>
                          <span className="text-foreground font-mono">{app.payload.start_iso || app.payload.start_time || app.payload.start || '—'}</span>
                          <span className="text-(--ui-text-tertiary) font-semibold">End Time:</span>
                          <span className="text-foreground font-mono">{app.payload.end_iso || app.payload.end_time || app.payload.end || '—'}</span>
                          <span className="text-(--ui-text-tertiary) font-semibold">Attendees:</span>
                          <span className="text-foreground">{(app.payload.attendees || []).join(', ') || 'None'}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Bottom Approval Action Buttons */}
                  <div className="flex justify-end gap-2 bg-(--ui-bg-sidebar) px-4 py-2 border-t border-(--ui-stroke-tertiary)">
                    <Button
                      onClick={() => handleReject(app.approval_id)}
                      disabled={isSubmitting}
                      variant="ghost"
                      size="sm"
                      className="text-(--ui-red) hover:bg-(--ui-red)/10"
                    >
                      <X className="size-3.5" />
                      Reject Action
                    </Button>
                    <Button
                      onClick={() => handleApprove(app.approval_id)}
                      disabled={isSubmitting}
                      size="sm"
                      className="bg-[var(--ui-green)] hover:brightness-110 text-white"
                    >
                      <Check className="size-3.5" />
                      {isSubmitting ? 'Executing...' : 'Approve & Execute'}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
export default ApprovalsView
