/**
 * PermissionSettings Component — permission gate policy overrides.
 * Controls auto-approval vs human confirmation rules for agent tools.
 */

import { useState } from 'react'
import { Shield } from 'lucide-react'
import { SegmentedControl } from '../ui/segmented-control'
import { ListRow, SectionHeading } from './primitives'

interface PolicyRule {
  action: string
  description: string
  level: 'AUTO' | 'CONFIRM' | 'BLOCKED'
}

export function PermissionSettings() {
  const [rules, setRules] = useState<PolicyRule[]>([
    {
      action: 'send_email',
      description: 'Sends compiled replies directly to email recipients.',
      level: 'CONFIRM',
    },
    {
      action: 'create_event',
      description: 'Inserts new events into the Google Calendar database.',
      level: 'CONFIRM',
    },
    {
      action: 'create_draft',
      description: 'Drafts responses on Gmail without sending them immediately.',
      level: 'AUTO',
    },
    {
      action: 'list_emails',
      description: 'Searches and reads metadata listings from the inbox.',
      level: 'AUTO',
    },
    {
      action: 'create_reminder',
      description: 'Schedules follow-up reminders inside PostgreSQL logs.',
      level: 'AUTO',
    },
  ])

  const handleLevelChange = (action: string, level: 'AUTO' | 'CONFIRM' | 'BLOCKED') => {
    setRules(prev => prev.map(r => r.action === action ? { ...r, level } : r))
  }

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <SectionHeading icon={Shield} title="Permission Gate Policy rules" />
        <p className="text-xs text-(--ui-text-tertiary) mt-1">
          Specify which actions require manual human authorization, run completely unattended, or are explicitly blocked.
        </p>
      </div>

      <div className="mt-4 divide-y divide-(--ui-stroke-tertiary) space-y-4">
        {rules.map(rule => (
          <ListRow
            key={rule.action}
            title={<span className="font-bold text-foreground font-mono">{rule.action}</span>}
            description={rule.description}
            action={
              <SegmentedControl
                options={[
                  { id: 'AUTO', label: 'Auto' },
                  { id: 'CONFIRM', label: 'Confirm' },
                  { id: 'BLOCKED', label: 'Block' },
                ]}
                value={rule.level}
                onChange={val => handleLevelChange(rule.action, val as any)}
              />
            }
          />
        ))}
      </div>
    </div>
  )
}
export default PermissionSettings
