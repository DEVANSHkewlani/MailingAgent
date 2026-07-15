import { useState } from 'react'
import { FileText, Cpu, Mail, Settings, Radio, Activity } from 'lucide-react'

interface StageInfo {
  title: string
  icon: React.ReactNode
  description: string
  action: string
  tech: string
}

const stages: StageInfo[] = [
  {
    title: '1. CSV Ingestion',
    icon: <FileText className="size-4" />,
    description: 'Upload lists. Auto-detects columns (email, name, company) and loads placeholders.',
    action: 'Parses rows into structural objects.',
    tech: 'CSV parser / engine',
  },
  {
    title: '2. Template Compiler',
    icon: <Cpu className="size-4" />,
    description: 'Substitutes $name, $company and formatting into responsive templates.',
    action: 'Injects recipient parameters.',
    tech: 'Jinja2 rendering spec',
  },
  {
    title: '3. Thread Matching',
    icon: <Mail className="size-4" />,
    description: 'Finds previous campaigns. Sets In-Reply-To/References for thread grouping.',
    action: 'Matches RFC Message-ID cache.',
    tech: 'Postgres thread cache',
  },
  {
    title: '4. SMTP Handshake',
    icon: <Settings className="size-4" />,
    description: 'Verifies transport connections with NOOP handshake checks before dispatching.',
    action: 'Handshakes SSL/TLS channels.',
    tech: 'python smtplib / TLS',
  },
  {
    title: '5. Queue Dispatcher',
    icon: <Activity className="size-4" />,
    description: 'Sends messages sequentially, respecting user-defined interval delays.',
    action: 'Delivers mail with sleep gaps.',
    tech: 'Async workers loop',
  },
  {
    title: '6. SSE Progress Stream',
    icon: <Radio className="size-4" />,
    description: 'Pushes real-time progress statistics (sent counts, fail logs) to front views.',
    action: 'Pushes EventSource data streams.',
    tech: 'FastAPI EventSourceResponse',
  },
]

export function BulkEmailerVisual() {
  const [activeStage, setActiveStage] = useState(0)

  return (
    <div 
      className="w-full rounded-xl overflow-hidden shadow-2xl p-5 space-y-4 font-sans"
      style={{
        background: 'rgba(20, 20, 20, 0.45)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
      }}
    >
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div>
          <h3 className="text-xs font-bold text-white/90 flex items-center gap-1.5 uppercase tracking-wide">
            <Activity className="size-3.5 text-white/70" />
            Outreach Delivery Pipeline
          </h3>
        </div>
        <div className="text-[9px] font-mono bg-white/5 border border-white/5 px-2 py-0.5 rounded text-white/50">
          transactional_send.py
        </div>
      </div>

      {/* Stepper Node Flow */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {stages.map((stage, idx) => {
          const isActive = idx === activeStage
          return (
            <button
              key={idx}
              onClick={() => setActiveStage(idx)}
              className="flex flex-col items-center text-center p-2 rounded-lg border transition-all cursor-pointer focus:outline-none"
              style={{
                background: isActive ? 'rgba(255, 255, 255, 0.07)' : 'rgba(255, 255, 255, 0.01)',
                borderColor: isActive ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.03)',
              }}
            >
              <div 
                className="p-1.5 rounded-full mb-1.5 text-white/70"
                style={{
                  background: isActive ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                }}
              >
                {stage.icon}
              </div>
              <span 
                className="text-[9px] font-medium leading-tight"
                style={{
                  color: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.45)',
                }}
              >
                {stage.title.split('. ')[1]}
              </span>
            </button>
          )
        })}
      </div>

      {/* Connection Indicator Flow Path (Pulsing Line) */}
      <div className="relative h-1 w-full rounded-full overflow-hidden hidden md:block" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
        <div 
          className="absolute h-full transition-all duration-500"
          style={{ 
            width: `${((activeStage + 1) / stages.length) * 100}%`,
            background: 'rgba(255, 255, 255, 0.3)'
          }}
        />
      </div>

      {/* Stage Details Inspector */}
      <div 
        className="rounded-lg p-4 md:grid md:grid-cols-[1.6fr_1fr] gap-6"
        style={{
          background: 'rgba(10, 10, 10, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.03)',
        }}
      >
        <div className="space-y-1.5">
          <h4 className="text-[11px] font-bold text-white/90 flex items-center gap-1.5">
            <span className="text-white/50">{stages[activeStage].icon}</span>
            {stages[activeStage].title}
          </h4>
          <p className="text-[11px] text-white/50 leading-relaxed">
            {stages[activeStage].description}
          </p>
        </div>
        <div className="mt-3 md:mt-0 border-t md:border-t-0 md:border-l border-white/5 pt-2.5 md:pt-0 md:pl-5 space-y-1.5 text-[10px] leading-relaxed">
          <div>
            <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider block">Operation</span>
            <span className="text-white/60 font-medium">{stages[activeStage].action}</span>
          </div>
          <div>
            <span className="text-[8px] font-bold text-white/30 uppercase tracking-wider block">Module</span>
            <code className="text-white/80 font-semibold font-mono">{stages[activeStage].tech}</code>
          </div>
        </div>
      </div>
    </div>
  )
}
