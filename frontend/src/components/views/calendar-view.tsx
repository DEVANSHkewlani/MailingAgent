/**
 * CalendarView Component — simplified system notification feed.
 * Displays dynamic confirmation alerts for scheduled events and follow-up warnings.
 */

import { useState, useEffect } from 'react'
import { useStore } from '@nanostores/react'
import { Calendar, Bell, Shield } from 'lucide-react'
import { handleSendMessage } from '../../store/chat'
import { $activeView } from '../../store/layout'
import { $userId } from '../../store/auth'
import { Button } from '../ui/button'
import { fetchAlerts } from '../../lib/api'

interface AlertItem {
  id: string
  type: 'calendar' | 'reminder' | 'security'
  message: string
  time: string
}

export function CalendarView() {
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [loading, setLoading] = useState(false)
  
  const userId = useStore($userId)

  // Fetch calendar events and reminders from the real database
  useEffect(() => {
    let active = true
    setLoading(true)
    fetchAlerts(userId)
      .then(data => {
        if (active) setAlerts(data)
      })
      .catch(err => console.error("CalendarView: Failed to load alerts", err))
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [userId])

  const triggerAutoClean = () => {
    handleSendMessage($userId.get(), 'Reconcile my schedule and clean up duplicate reminders.')
    $activeView.set('chat')
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 scrollbar-themed space-y-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-(--ui-stroke-tertiary) pb-4">
          <div className="flex items-center gap-2">
            <Bell className="size-5 text-primary" />
            <h2 className="text-[1.125rem] font-bold text-foreground">System Alerts & Notifications</h2>
          </div>
          <Button
            size="sm"
            onClick={triggerAutoClean}
            variant="outline"
            className="text-xs font-bold border-(--ui-stroke-secondary)"
          >
            Reconcile Alerts
          </Button>
        </div>

        {/* Alerts Feed */}
        <div className="space-y-3">
          {loading ? (
            <div className="p-8 text-center text-xs text-(--ui-text-quaternary) font-mono bg-(--ui-bg-editor) border border-(--ui-stroke-secondary)">
              Querying database notification feeds...
            </div>
          ) : alerts.length === 0 ? (
            <div className="p-8 text-center text-xs text-(--ui-text-quaternary) font-mono bg-(--ui-bg-editor) border border-(--ui-stroke-secondary)">
              No notifications. Type a message like "Schedule a meeting with John tomorrow at 2 PM" to add events.
            </div>
          ) : (
            alerts.map(alert => (
              <div
                key={alert.id}
                className="border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-4 flex gap-3.5 items-start relative select-text"
              >
                {alert.type === 'calendar' ? (
                  <Calendar className="size-4 text-primary shrink-0 mt-0.5" />
                ) : alert.type === 'security' ? (
                  <Shield className="size-4 text-(--ui-red) shrink-0 mt-0.5" />
                ) : (
                  <Bell className="size-4 text-(--ui-yellow) shrink-0 mt-0.5" />
                )}
                <div className="flex-1 space-y-1">
                  <p className="text-xs leading-5 text-foreground font-sans">
                    {alert.message}
                  </p>
                  <span className="text-[10px] font-mono text-(--ui-text-quaternary) block">
                    {alert.time}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
export default CalendarView
