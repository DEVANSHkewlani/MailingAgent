/**
 * StyleSettings Component — default email style configuration.
 * Maps to backend style specifications and signature templates.
 */

import { useState } from 'react'
import { FileText } from 'lucide-react'
import { SegmentedControl } from '../ui/segmented-control'
import { ListRow, SectionHeading } from './primitives'

export function StyleSettings() {
  const [tone, setTone] = useState<'formal' | 'casual' | 'warm'>('formal')
  const [signature, setSignature] = useState('<p>Warm regards,<br>Development Team</p>')
  const [font, setFont] = useState('Inter')
  const [fontSize, setFontSize] = useState('11')

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <SectionHeading icon={FileText} title="Email Style Specifications" />
        <p className="text-xs text-(--ui-text-tertiary) mt-1">
          Configure the default templates, font sizes, and tone profiles used by the assistant to draft and style emails.
        </p>
      </div>

      <div className="mt-4 divide-y divide-(--ui-stroke-tertiary)">
        {/* Signature editor */}
        <ListRow
          title="HTML Email Signature"
          description="The HTML signature block appended to the bottom of all generated replies."
          wide
          below={
            <div className="mt-2 border border-(--ui-stroke-tertiary) rounded-lg overflow-hidden bg-(--ui-bg-chrome)">
              <textarea
                value={signature}
                onChange={e => setSignature(e.target.value)}
                rows={4}
                className="w-full bg-transparent px-3 py-2.5 text-xs text-foreground font-mono outline-none resize-none leading-5 scrollbar-themed"
              />
            </div>
          }
        />

        {/* Tone profile */}
        <ListRow
          title="Drafting Tone Profile"
          description="Specify the semantic tone used by the summarization/drafting agents to reply."
          action={
            <SegmentedControl
              options={[
                { id: 'formal', label: 'Formal' },
                { id: 'casual', label: 'Casual' },
                { id: 'warm', label: 'Warm' },
              ]}
              value={tone}
              onChange={val => setTone(val as any)}
            />
          }
        />

        {/* Font styling configuration */}
        <ListRow
          title="Typography Styling"
          description="Font Family and Size (in pt) used to compile structured email HTML output."
          wide
          below={
            <div className="flex gap-4 mt-2 max-w-sm">
              <div className="flex-1">
                <label className="text-[10px] uppercase font-bold text-(--ui-text-tertiary) block mb-1">
                  Font Family
                </label>
                <select
                  value={font}
                  onChange={e => setFont(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) text-xs outline-none text-foreground focus:border-primary"
                >
                  <option value="Inter">Inter</option>
                  <option value="Calibri">Calibri</option>
                  <option value="Arial">Arial</option>
                  <option value="Segoe UI">Segoe UI</option>
                </select>
              </div>
              <div className="w-24">
                <label className="text-[10px] uppercase font-bold text-(--ui-text-tertiary) block mb-1">
                  Font Size (pt)
                </label>
                <select
                  value={fontSize}
                  onChange={e => setFontSize(e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-quinary) text-xs outline-none text-foreground focus:border-primary"
                >
                  <option value="10">10 pt</option>
                  <option value="11">11 pt</option>
                  <option value="12">12 pt</option>
                  <option value="14">14 pt</option>
                </select>
              </div>
            </div>
          }
        />
      </div>
    </div>
  )
}
export default StyleSettings
