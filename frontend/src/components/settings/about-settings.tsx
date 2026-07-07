/**
 * AboutSettings Component — metadata and version indicators.
 */

import { Info, Globe } from 'lucide-react'
import { SectionHeading } from './primitives'

export function AboutSettings() {
  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <SectionHeading icon={Info} title="About Mailing Agent" />
        <p className="text-xs text-(--ui-text-tertiary) mt-1">
          A security-focused, multi-agent mail assistant and calendar manager running on LangGraph.
        </p>
      </div>

      <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-5 space-y-4">
        <div className="grid grid-cols-[6rem_1fr] text-xs gap-y-2">
          <span className="text-(--ui-text-tertiary) font-semibold">Core Version:</span>
          <span className="text-foreground font-mono font-medium">v1.0.0</span>
          
          <span className="text-(--ui-text-tertiary) font-semibold">OS Version:</span>
          <span className="text-foreground font-mono font-medium">macOS macOS</span>
          
          <span className="text-(--ui-text-tertiary) font-semibold">License:</span>
          <span className="text-foreground font-mono font-medium">MIT License</span>
        </div>

        <div className="h-px bg-border/20" />

        <div className="flex items-center gap-2 text-xs text-(--ui-text-secondary)">
          <Globe className="size-4 opacity-75" />
          <span>Created by pair programming with Antigravity AI, Google DeepMind.</span>
        </div>
      </div>
    </div>
  )
}
export default AboutSettings
