import { useState } from 'react'
import { Layers, Activity } from 'lucide-react'

interface NodeDetail {
  title: string
  role: string
  responsibilities: string[]
  file: string
}

const nodeDetails: Record<string, NodeDetail> = {
  START: {
    title: 'Start Node',
    role: 'Graph Entrypoint',
    responsibilities: [
      'Accepts user natural-language instruction',
      'Loads active conversation thread history context',
      'Initializes state structures with custom reducers',
    ],
    file: 'graph.py',
  },
  Supervisor: {
    title: 'Supervisor Node',
    role: 'Decomposer & Orchestrator',
    responsibilities: [
      'Parses instructions to compile active task schedules',
      'Determines which agents are required (Reader, Scheduler, etc.)',
      'Prepares parallel worker task payloads',
    ],
    file: 'supervisor.py',
  },
  Reader: {
    title: 'Reader Agent',
    role: 'Data Aggregation & Caching',
    responsibilities: [
      'Fetches email threads via Google APIs',
      'Loads attachments and extracts message metadata',
      'Routes dynamically to other agents or policy gates',
    ],
    file: 'reader.py',
  },
  Categorizer: {
    title: 'Categorizer Agent',
    role: 'Classification & Rules',
    responsibilities: [
      'Applies user-defined classification rule mappings',
      'Tags threads with categories (urgent, personal, spam)',
      'Uses LLM backups for ambiguous message patterns',
    ],
    file: 'categorizer.py',
  },
  Summarizer: {
    title: 'Summarizer Agent',
    role: 'Context Condensation',
    responsibilities: [
      'Processes raw multi-message thread contents',
      'Generates short bullet-point summaries',
      'Maintains last-processed message watermark to avoid re-runs',
    ],
    file: 'summarizer.py',
  },
  Drafter: {
    title: 'Drafter Agent',
    role: 'Tone & Style Composition',
    responsibilities: [
      'Analyzes sender history to match tone styles',
      'Generates context-aware replies with Jinja2 templates',
      'Embeds style profiles (signatures, fonts, accent colors)',
    ],
    file: 'drafter.py',
  },
  Scheduler: {
    title: 'Scheduler Agent',
    role: 'Calendar Automation',
    responsibilities: [
      'Scans emails for scheduling intents or dates',
      'Queries Google Calendar for conflicting events',
      'Prepares calendar insert payloads',
    ],
    file: 'scheduler.py',
  },
  Reminder: {
    title: 'Reminder Agent',
    role: 'Follow-Up Tracking',
    responsibilities: [
      'Scans conversations to identify follow-up commitments',
      'Inserts follow-up reminders into database',
      'Sets scheduling boundary parameters for background ticks',
    ],
    file: 'reminder.py',
  },
  PolicyGate: {
    title: 'Security Policy Gate',
    role: 'Access & Compliance Gate',
    responsibilities: [
      'Evaluates actions against security gating lists',
      'Bypasses confirm steps for verified cron loop tasks',
      'Generates secure HMAC confirmation tokens and raises interrupts',
    ],
    file: 'policy.py',
  },
  Executor: {
    title: 'Tool Executor Node',
    role: 'Action Delivery Dispatcher',
    responsibilities: [
      'Delivers drafted responses via SMTP or Gmail compose API',
      'Saves calendar events to Google Calendar endpoints',
      'Logs executed events to write-only database audit ledgers',
    ],
    file: 'executor.py',
  },
  Aggregator: {
    title: 'Aggregator Node',
    role: 'Outcome Consolidator',
    responsibilities: [
      'Collates outcomes from parallel agent task loops',
      'Constructs clean natural-language summaries of run outcomes',
      'Passes final text back to conversation streams',
    ],
    file: 'aggregator.py',
  },
  END: {
    title: 'End Node',
    role: 'Terminal State',
    responsibilities: [
      'Saves state graphs to database checkpointers',
      'Unlocks application shells for client-side response rendering',
      'Flushes execution cycle cache parameters',
    ],
    file: 'graph.py',
  },
}

export function AgentFlowVisual() {
  const [selectedNode, setSelectedNode] = useState<string>('Supervisor')

  const details = nodeDetails[selectedNode] || nodeDetails.Supervisor

  return (
    <div className="w-full rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) overflow-hidden shadow-2xl flex flex-col md:grid md:grid-cols-[1.2fr_1fr] min-h-[500px]">
      {/* Graph Visual Panel */}
      <div className="p-6 border-b md:border-b-0 md:border-r border-(--ui-stroke-secondary) relative flex flex-col justify-center items-center bg-[#070708]">
        <div className="absolute top-4 left-6 text-xs text-(--ui-text-tertiary) flex items-center gap-1.5 font-sans">
          <Activity className="size-3.5 text-primary animate-pulse" />
          Interactive Stateflow Graph (Click nodes to inspect)
        </div>

        <svg className="w-full h-auto max-w-[480px] mt-4" viewBox="0 0 600 560" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Definitions */}
          <defs>
            <pattern id="gridPattern" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.01)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#gridPattern)" rx="8" />

          {/* Connection Lines (Parallel Fan-Out) */}
          {/* START -> Supervisor */}
          <path d="M 300 45 L 300 70" stroke="#6366f1" strokeWidth="2" strokeDasharray="3 3" />
          
          {/* Supervisor -> Workers */}
          <path d="M 300 112 L 300 135 M 300 135 L 60 135 L 60 170" stroke="#6366f1" strokeWidth="1.5" fill="none" />
          <path d="M 300 135 L 156 135 L 156 170" stroke="#6366f1" strokeWidth="1.5" fill="none" />
          <path d="M 300 135 L 252 135 L 252 170" stroke="#6366f1" strokeWidth="1.5" fill="none" />
          <path d="M 300 135 L 348 135 L 348 170" stroke="#6366f1" strokeWidth="1.5" fill="none" />
          <path d="M 300 135 L 444 135 L 444 170" stroke="#6366f1" strokeWidth="1.5" fill="none" />
          <path d="M 300 135 L 540 135 L 540 170" stroke="#6366f1" strokeWidth="1.5" fill="none" />

          {/* Reader Conditional Loops back to others */}
          <path d="M 60 215 L 60 240 L 540 240 L 540 215" stroke="rgba(59, 130, 246, 0.3)" strokeWidth="1" fill="none" strokeDasharray="2 2" />

          {/* Workers -> Gating Policy */}
          <path d="M 60 215 L 60 270 L 300 270 L 300 300" stroke="#3b82f6" strokeWidth="1.2" fill="none" />
          <path d="M 156 215 L 156 270 L 300 270" stroke="#3b82f6" strokeWidth="1.2" fill="none" />
          <path d="M 252 215 L 252 270 L 300 270" stroke="#3b82f6" strokeWidth="1.2" fill="none" />
          <path d="M 348 215 L 348 270 L 300 270" stroke="#3b82f6" strokeWidth="1.2" fill="none" />
          <path d="M 444 215 L 444 270 L 300 270" stroke="#3b82f6" strokeWidth="1.2" fill="none" />
          <path d="M 540 215 L 540 270 L 300 270" stroke="#3b82f6" strokeWidth="1.2" fill="none" />

          {/* Gating Policy -> END / Executor */}
          <path d="M 300 345 L 300 380" stroke="#ef4444" strokeWidth="2" fill="none" />
          <path d="M 300 325 L 430 325 L 430 520 L 335 520" stroke="#f59e0b" strokeWidth="1.5" fill="none" strokeDasharray="3 3" />

          {/* Executor -> Aggregator -> END */}
          <path d="M 300 422 L 300 450" stroke="#10b981" strokeWidth="2" fill="none" />
          <path d="M 300 492 L 300 510" stroke="#10b981" strokeWidth="2" fill="none" />

          {/* Animated Flows */}
          <circle r="3" fill="#6366f1">
            <animateMotion dur="4s" repeatCount="indefinite" path="M 300 135 L 60 135 L 60 170" />
          </circle>
          <circle r="3" fill="#8b5cf6">
            <animateMotion dur="4s" repeatCount="indefinite" path="M 300 135 L 348 135 L 348 170" />
          </circle>
          <circle r="3" fill="#10b981">
            <animateMotion dur="3s" repeatCount="indefinite" path="M 300 422 L 300 450" />
          </circle>

          {/* Node Renderings */}
          {/* START */}
          <g onClick={() => setSelectedNode('START')} className="cursor-pointer">
            <rect x="255" y="10" width="90" height="35" rx="17.5" fill={selectedNode === 'START' ? '#1e1b4b' : '#0f172a'} stroke={selectedNode === 'START' ? '#6366f1' : '#334155'} strokeWidth="1.5" />
            <text x="300" y="32" fill={selectedNode === 'START' ? '#ffffff' : '#94a3b8'} fontSize="10" fontWeight="bold" textAnchor="middle" style={{ fontFamily: 'Inter, sans-serif' }}>START</text>
          </g>

          {/* Supervisor */}
          <g onClick={() => setSelectedNode('Supervisor')} className="cursor-pointer">
            <rect x="210" y="70" width="180" height="42" rx="21" fill={selectedNode === 'Supervisor' ? 'rgba(99, 102, 241, 0.2)' : '#141416'} stroke={selectedNode === 'Supervisor' ? '#6366f1' : '#334155'} strokeWidth="2" />
            <text x="300" y="96" fill="#ffffff" fontSize="11" fontWeight="bold" textAnchor="middle" style={{ fontFamily: 'Inter, sans-serif' }}>Supervisor Node</text>
          </g>

          {/* Workers */}
          {[
            { id: 'Reader', name: 'Reader', x: 15, label: 'Reader' },
            { id: 'Categorizer', name: 'Categorizer', x: 111, label: 'Categorize' },
            { id: 'Summarizer', name: 'Summarizer', x: 207, label: 'Summarize' },
            { id: 'Drafter', name: 'Drafter', x: 303, label: 'Drafter' },
            { id: 'Scheduler', name: 'Scheduler', x: 399, label: 'Scheduler' },
            { id: 'Reminder', name: 'Reminder', x: 495, label: 'Reminder' },
          ].map(w => {
            const isSel = selectedNode === w.id
            return (
              <g key={w.id} onClick={() => setSelectedNode(w.id)} className="cursor-pointer">
                <rect x={w.x} y="170" width="90" height="45" rx="8" fill={isSel ? 'rgba(59, 130, 246, 0.2)' : '#141417'} stroke={isSel ? '#3b82f6' : 'rgba(59, 130, 246, 0.25)'} strokeWidth="1.5" />
                <text x={w.x + 45} y="197" fill={isSel ? '#ffffff' : '#93c5fd'} fontSize="9.5" fontWeight="bold" textAnchor="middle" style={{ fontFamily: 'Inter, sans-serif' }}>{w.label}</text>
              </g>
            )
          })}

          {/* Gating Policy */}
          <g onClick={() => setSelectedNode('PolicyGate')} className="cursor-pointer">
            <rect x="200" y="300" width="200" height="45" rx="8" fill={selectedNode === 'PolicyGate' ? 'rgba(239, 68, 68, 0.15)' : '#141416'} stroke={selectedNode === 'PolicyGate' ? '#ef4444' : '#334155'} strokeWidth="2" />
            <text x="300" y="321" fill={selectedNode === 'PolicyGate' ? '#ffffff' : '#f87171'} fontSize="10.5" fontWeight="bold" textAnchor="middle" style={{ fontFamily: 'Inter, sans-serif' }}>Security Policy Gate</text>
            <text x="300" y="335" fill="#fca5a5" fontSize="7.5" textAnchor="middle" style={{ fontFamily: 'Inter, sans-serif' }}>(Interrupt / HMAC Verification)</text>
          </g>

          {/* Executor */}
          <g onClick={() => setSelectedNode('Executor')} className="cursor-pointer">
            <rect x="210" y="380" width="180" height="42" rx="8" fill={selectedNode === 'Executor' ? 'rgba(16, 185, 129, 0.15)' : '#141416'} stroke={selectedNode === 'Executor' ? '#10b981' : '#334155'} strokeWidth="1.5" />
            <text x="300" y="405" fill="#a7f3d0" fontSize="11" fontWeight="bold" textAnchor="middle" style={{ fontFamily: 'Inter, sans-serif' }}>Tool Executor Node</text>
          </g>

          {/* Aggregator */}
          <g onClick={() => setSelectedNode('Aggregator')} className="cursor-pointer">
            <rect x="220" y="450" width="160" height="42" rx="8" fill={selectedNode === 'Aggregator' ? 'rgba(6, 182, 212, 0.15)' : '#141416'} stroke={selectedNode === 'Aggregator' ? '#06b6d4' : '#334155'} strokeWidth="1.5" />
            <text x="300" y="475" fill="#a5f3fc" fontSize="10.5" fontWeight="bold" textAnchor="middle" style={{ fontFamily: 'Inter, sans-serif' }}>Aggregator Node</text>
          </g>

          {/* END */}
          <g onClick={() => setSelectedNode('END')} className="cursor-pointer">
            <rect x="255" y="510" width="90" height="35" rx="17.5" fill={selectedNode === 'END' ? '#1e1b4b' : '#0f172a'} stroke={selectedNode === 'END' ? '#6366f1' : '#334155'} strokeWidth="1.5" />
            <text x="300" y="531" fill={selectedNode === 'END' ? '#ffffff' : '#94a3b8'} fontSize="10" fontWeight="bold" textAnchor="middle" style={{ fontFamily: 'Inter, sans-serif' }}>END</text>
          </g>
        </svg>
      </div>

      {/* Inspector Details Panel */}
      <div className="p-6 flex flex-col justify-between bg-(--ui-bg-sidebar) font-sans">
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-(--ui-stroke-secondary) pb-3">
            <div>
              <span className="text-[10px] font-bold text-primary tracking-wider uppercase">Active Inspector Node</span>
              <h4 className="text-[1.125rem] font-bold text-foreground mt-0.5">{details.title}</h4>
            </div>
            <div className="bg-(--ui-bg-quinary) border border-(--ui-stroke-tertiary) px-2.5 py-1 rounded text-[10px] font-mono text-(--ui-text-secondary)">
              {details.file}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-[10px] font-bold text-(--ui-text-tertiary) uppercase tracking-wider">Role In Graph</div>
              <p className="text-xs text-foreground font-medium mt-0.5">{details.role}</p>
            </div>

            <div>
              <div className="text-[10px] font-bold text-(--ui-text-tertiary) uppercase tracking-wider mb-2">Key Actions & Responsibilities</div>
              <ul className="space-y-2">
                {details.responsibilities.map((r, i) => (
                  <li key={i} className="text-xs text-(--ui-text-secondary) flex items-start gap-2 leading-relaxed">
                    <span className="flex h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-(--ui-stroke-secondary) text-[11px] text-(--ui-text-tertiary) leading-relaxed flex items-center gap-1.5">
          <Layers className="size-4 text-(--ui-text-quaternary)" />
          This interactive graph outlines the actual parallel fan-out and permission interrupts configured in LangGraph.
        </div>
      </div>
    </div>
  )
}
