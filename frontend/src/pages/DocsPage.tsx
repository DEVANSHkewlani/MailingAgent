import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { AgentFlowVisual } from '../components/AgentFlowVisual'
import { BulkEmailerVisual } from '../components/BulkEmailerVisual'

/**
 * DocsPage — Complete project documentation using the app's own CSS variable theme.
 * The layout features a fixed/static left sidebar and a scrollable content area.
 */

const sections = [
  { id: 'overview', label: 'Overview' },
  { id: 'orchestration', label: 'Agent Orchestration' },
  { id: 'security', label: 'Security & Gating' },
  { id: 'database', label: 'Database Schema' },
  { id: 'cron', label: 'Background Loops' },
  { id: 'bulk-emailer', label: 'Bulk Emailer' },
  { id: 'webhooks', label: 'Webhooks & Notifications' },
  { id: 'frontend', label: 'Frontend Architecture' },
  { id: 'api-reference', label: 'API Reference' },
  { id: 'setup-guide', label: 'Connect & Setup Guide' },
  { id: 'deployment', label: 'Deployment' },
]

export function DocsPage() {
  const [activeSection, setActiveSection] = useState('overview')
  const mainRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        }
      },
      {
        root: mainRef.current,
        rootMargin: '-40px 0px -70% 0px'
      }
    )
    sections.forEach(s => {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-background text-foreground" style={{ fontFamily: "'Inter', 'Space Mono', sans-serif" }}>
      {/* ─── Top Nav ─── */}
      <header className="flex items-center justify-between px-6 sm:px-12 h-14 bg-(--ui-bg-sidebar) border-b border-(--ui-stroke-secondary) shrink-0" style={{ backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-1.5 text-sm text-(--ui-text-secondary) hover:text-foreground transition-colors">
            <ArrowLeft className="size-4" />
            Home
          </Link>
          <span className="text-(--ui-stroke-tertiary)">|</span>
          <span className="text-sm font-semibold select-none">Documentation</span>
        </div>
        <Link to="/app">
          <button className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold hover:brightness-110 transition-all">
            Launch App
          </button>
        </Link>
      </header>

      {/* ─── Layout ─── */}
      <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">

        {/* ─── Fixed/Static Sidebar (Big) ─── */}
        <aside className="hidden lg:block w-72 border-r border-(--ui-stroke-secondary) bg-(--ui-bg-sidebar) overflow-y-auto select-none p-6 shrink-0 h-full">
          <div className="text-[0.6875rem] font-medium tracking-wider text-(--ui-text-quaternary) uppercase mb-3">
            Sections
          </div>
          <nav className="flex flex-col space-y-0.5">
            {sections.map((s, i) => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className={`text-left text-sm py-1.5 px-1 transition-colors cursor-pointer focus:outline-none ${
                  activeSection === s.id
                    ? 'text-primary font-semibold'
                    : 'text-(--ui-text-secondary) hover:text-foreground'
                }`}
              >
                {i + 1}. {s.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* ─── Main Scrollable Content ─── */}
        <main ref={mainRef} className="flex-1 overflow-y-auto px-6 sm:px-12 py-10 space-y-16 scrollbar-themed">

          {/* §0 Overview */}
          <section id="overview">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">Mailing Agent — System Documentation</h1>
            <p className="mt-3 text-sm leading-relaxed text-(--ui-text-secondary) max-w-2xl">
              Mailing Agent is a self-learning email assistant powered by LangGraph. It categorizes, drafts, summarizes, and sends emails with human-in-the-loop approval. It also includes a full-featured bulk emailer for campaign-style outreach.
            </p>
            <div className="mt-4 rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-4">
              <div className="text-xs font-semibold text-foreground mb-2">Tech Stack</div>
              <div className="flex flex-wrap gap-2 text-xs text-(--ui-text-secondary)">
                {['Python 3.11+', 'FastAPI', 'LangGraph', 'PostgreSQL', 'Google Gmail API', 'React + Vite', 'Tailwind CSS', 'Nanostores', 'Electron (optional)'].map(t => (
                  <span key={t} className="rounded-full bg-(--ui-bg-quinary) px-2.5 py-1 border border-(--ui-stroke-tertiary)">{t}</span>
                ))}
              </div>
            </div>
          </section>

          {/* §1 Agent Orchestration */}
          <section id="orchestration" className="border-t border-(--ui-stroke-tertiary) pt-8">
            <h2 className="text-xl font-bold text-foreground mb-4">1. Multi-Agent Orchestration</h2>
            <p className="text-sm leading-relaxed text-(--ui-text-secondary) mb-4">
              The system resolves natural-language instructions using a Directed Cyclic Graph on LangGraph. A Supervisor Router dispatches tasks sequentially to specialized worker nodes.
            </p>
            
            {/* Architectural Visual Diagram */}
            <div className="mb-6">
              <AgentFlowVisual />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { name: 'Reader Agent', desc: 'Fetches emails from Gmail via the Google API. Extracts headers, body, attachments, timestamps, and thread IDs. Supports pagination and label filtering.' },
                { name: 'Categorizer Agent', desc: 'Classifies emails into categories (urgent, action_needed, newsletter, personal, etc.) using user-seeded rules with LLM fallback for ambiguous cases.' },
                { name: 'Drafter Agent', desc: 'Generates context-aware reply drafts matching the user\'s writing style profile — font, tone, signature, and HTML formatting are preserved.' },
                { name: 'Summarizer Agent', desc: 'Condenses multi-reply threads into key-point summaries. Maintains a watermark so re-summarizing only processes new messages.' },
                { name: 'Scheduler Agent', desc: 'Coordinates calendars and schedules meetings on Google Calendar, performing conflict avoidance checks.' },
                { name: 'Reminder Agent', desc: 'Automatically schedules commitments and follows up on deadlines flagged in conversations.' },
                { name: 'Executor Agent (Tool)', desc: 'Performs approved actions: sending emails via Gmail API or SMTP, creating calendar events, applying labels, and archiving threads.' },
                { name: 'Supervisor Router', desc: 'The orchestrator node that reads user intent, selects the right worker sequence, and manages state transitions through the graph.' },
              ].map((w, i) => (
                <div key={i} className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-4">
                  <div className="text-xs font-semibold text-primary mb-1">{w.name}</div>
                  <p className="text-xs leading-relaxed text-(--ui-text-secondary)">{w.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* §2 Security */}
          <section id="security" className="border-t border-(--ui-stroke-tertiary) pt-8">
            <h2 className="text-xl font-bold text-foreground mb-4">2. Security & Gating Policies</h2>
            <p className="text-sm leading-relaxed text-(--ui-text-secondary) mb-4">
              Every action requested by a graph node passes through a strict policy gate before entering the executor loop.
            </p>

            {/* Security Visual Diagram */}
            <div className="mb-6 rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-6">
              <div className="text-xs font-semibold text-foreground mb-4 text-center">Gated Action Approval Pipeline Flow</div>
              <svg className="w-full h-auto max-w-xl mx-auto" viewBox="0 0 600 130" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="grid2" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.015)" strokeWidth="1"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid2)" rx="8" />
                
                {/* 1. Request Action */}
                <rect x="15" y="42" width="90" height="45" rx="6" fill="#141416" stroke="rgba(59, 130, 246, 0.3)" />
                <text x="60" y="62" fill="#ffffff" fontSize="9" fontWeight="bold" textAnchor="middle" style={{ fontFamily: 'Inter, sans-serif' }}>1. Action Req</text>
                <text x="60" y="74" fill="#999999" fontSize="7" textAnchor="middle" style={{ fontFamily: 'Inter, sans-serif' }}>e.g., Send Reply</text>

                {/* Arrow */}
                <path d="M 113 64.5 L 133 64.5" stroke="#475569" strokeWidth="1.5" fill="none" />
                
                {/* 2. Security Gate */}
                <rect x="140" y="42" width="95" height="45" rx="6" fill="rgba(249, 115, 22, 0.1)" stroke="#f97316" />
                <text x="187.5" y="62" fill="#ffd8a8" fontSize="9" fontWeight="bold" textAnchor="middle" style={{ fontFamily: 'Inter, sans-serif' }}>2. Policy Gate</text>
                <text x="187.5" y="74" fill="#f97316" fontSize="7" textAnchor="middle" style={{ fontFamily: 'Inter, sans-serif' }}>Checks Rules</text>

                {/* Arrow */}
                <path d="M 243 64.5 L 263 64.5" stroke="#475569" strokeWidth="1.5" fill="none" />

                {/* 3. HMAC Token Generation */}
                <rect x="270" y="42" width="100" height="45" rx="6" fill="rgba(139, 92, 246, 0.1)" stroke="#8b5cf6" />
                <text x="320" y="62" fill="#e9d5ff" fontSize="9" fontWeight="bold" textAnchor="middle" style={{ fontFamily: 'Inter, sans-serif' }}>3. HMAC Token</text>
                <text x="320" y="74" fill="#c084fc" fontSize="7" textAnchor="middle" style={{ fontFamily: 'Inter, sans-serif' }}>Interrupts Graph</text>

                {/* Arrow */}
                <path d="M 378 64.5 L 398 64.5" stroke="#475569" strokeWidth="1.5" fill="none" />

                {/* 4. Manual Approval */}
                <rect x="405" y="42" width="95" height="45" rx="6" fill="rgba(16, 185, 129, 0.1)" stroke="#10b981" />
                <text x="452.5" y="62" fill="#a7f3d0" fontSize="9" fontWeight="bold" textAnchor="middle" style={{ fontFamily: 'Inter, sans-serif' }}>4. UI Approval</text>
                <text x="452.5" y="74" fill="#34d399" fontSize="7" textAnchor="middle" style={{ fontFamily: 'Inter, sans-serif' }}>Verify & Resume</text>

                {/* Arrow */}
                <path d="M 508 64.5 L 528 64.5" stroke="#475569" strokeWidth="1.5" fill="none" />

                {/* 5. Execution */}
                <rect x="535" y="42" width="50" height="45" rx="6" fill="rgba(6, 182, 212, 0.1)" stroke="#06b6d4" />
                <text x="560" y="62" fill="#e2e8f0" fontSize="9" fontWeight="bold" textAnchor="middle" style={{ fontFamily: 'Inter, sans-serif' }}>5. Run</text>
                <text x="560" y="74" fill="#22d3ee" fontSize="7" textAnchor="middle" style={{ fontFamily: 'Inter, sans-serif' }}>SMTP/API</text>
              </svg>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { level: 'CONFIRM', color: 'text-(--ui-red)', desc: 'High-risk actions (sending emails, booking events). The gate generates a single-use HMAC token and triggers a LangGraph interrupt, pausing execution until manual approval via the Approvals dashboard.' },
                { level: 'AUTO', color: 'text-green-400', desc: 'Low-risk actions (syncing threads, creating drafts, applying labels). Auto-approved and run without blocking the workflow. No user interruption needed.' },
                { level: 'is_cron', color: 'text-primary', desc: 'Background cron tasks run with is_cron: True. The gate intercepts this flag, creates approval records, pre-approves them, and bypasses user interruptions for autonomous operation.' },
              ].map((p, i) => (
                <div key={i} className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-4">
                  <div className={`text-xs font-bold uppercase mb-2 ${p.color}`}>{p.level}</div>
                  <p className="text-xs leading-relaxed text-(--ui-text-secondary)">{p.desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-4">
              <div className="text-xs font-semibold text-foreground mb-2">Approval Token Flow</div>
              <ol className="text-xs leading-relaxed text-(--ui-text-secondary) list-decimal list-inside space-y-1">
                <li>Agent requests action → policy_gate checks action_type</li>
                <li>If CONFIRM → generate HMAC token (SHA-256, 1h expiry) → insert into approval_queue</li>
                <li>LangGraph interrupt pauses graph execution</li>
                <li>User approves/rejects via Approvals UI → token verified → graph resumed or aborted</li>
                <li>Executor performs the action → audit_log entry created</li>
              </ol>
            </div>
          </section>

          {/* §3 Database */}
          <section id="database" className="border-t border-(--ui-stroke-tertiary) pt-8">
            <h2 className="text-xl font-bold text-foreground mb-4">3. Database Schema</h2>
            <p className="text-sm leading-relaxed text-(--ui-text-secondary) mb-4">
              All state is stored in PostgreSQL. The schema is organized into four table groups.
            </p>
            {[
              {
                group: 'Identity & Auth',
                tables: [
                  { name: 'users', cols: 'id UUID (PK) · email TEXT (UNIQUE) · display_name TEXT · smtp_host TEXT · smtp_port INT · smtp_username TEXT · smtp_password TEXT · groq_api_key TEXT · created_at TIMESTAMPTZ' },
                  { name: 'oauth_credentials', cols: 'id UUID (PK) · user_id UUID (FK→users) · provider TEXT · access_token_encrypted BYTEA · refresh_token_encrypted BYTEA · scopes TEXT[] · expires_at TIMESTAMPTZ' },
                  { name: 'style_profiles', cols: 'id UUID (PK) · user_id UUID (FK→users) · name TEXT · signature_html TEXT · font_family TEXT · font_size INT · accent_color TEXT · tone TEXT · is_default BOOLEAN' },
                ],
              },
              {
                group: 'Email Cache & Summaries',
                tables: [
                  { name: 'email_cache', cols: 'id UUID (PK) · user_id UUID (FK) · provider_message_id TEXT · thread_id TEXT · sender TEXT · subject TEXT · snippet TEXT · category TEXT · category_confidence REAL · received_at TIMESTAMPTZ' },
                  { name: 'thread_summaries', cols: 'thread_id TEXT · user_id UUID (FK) (Composite PK) · summary TEXT · last_message_id TEXT (watermark) · updated_at TIMESTAMPTZ' },
                  { name: 'category_rules', cols: 'id UUID (PK) · user_id UUID (FK) · match_type TEXT · match_value TEXT · category TEXT · is_system_default BOOLEAN' },
                ],
              },
              {
                group: 'Jobs & Audit',
                tables: [
                  { name: 'approval_queue', cols: 'id UUID (PK) · user_id UUID (FK) · conversation_id UUID · action_type TEXT · resource_id TEXT · payload JSONB · agent_reasoning TEXT · status TEXT · confirmation_token TEXT · expires_at TIMESTAMPTZ' },
                  { name: 'cron_jobs', cols: 'id UUID (PK) · user_id UUID (FK) · name TEXT · prompt TEXT · schedule_type TEXT · schedule_value TEXT · enabled BOOLEAN · state TEXT · last_run_at TIMESTAMPTZ · next_run_at TIMESTAMPTZ' },
                  { name: 'audit_log', cols: 'id BIGSERIAL (PK) · user_id UUID (FK) · agent_name TEXT · tool_name TEXT · input_params JSONB · output JSONB · approval_id UUID (FK) · reasoning TEXT · created_at TIMESTAMPTZ' },
                ],
              },
              {
                group: 'Bulk Email',
                tables: [
                  { name: 'bulk_campaigns (in-memory)', cols: 'job_id STRING · campaign_name STRING · started_at ISO8601 · total INT · sent INT · failed INT · stopped BOOL · done BOOL' },
                  { name: 'send_results (per-recipient)', cols: 'email TEXT · name TEXT · subject TEXT · ok BOOL · error TEXT · message_id TEXT (RFC 5322, for reply threading)' },
                ],
              },
            ].map((g, gi) => (
              <div key={gi} className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) overflow-hidden mb-3">
                <div className="bg-(--ui-bg-quinary) border-b border-(--ui-stroke-tertiary) px-4 py-2.5 text-xs font-bold text-foreground">
                  {g.group}
                </div>
                <div className="px-4 py-3 space-y-3">
                  {g.tables.map((t, ti) => (
                    <div key={ti}>
                      {ti > 0 && <div className="h-px bg-(--ui-stroke-tertiary) mb-3" />}
                      <div className="text-xs font-semibold text-primary">{t.name}</div>
                      <div className="text-xs leading-relaxed text-(--ui-text-secondary) mt-0.5">{t.cols}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>

          {/* §4 Cron Loops */}
          <section id="cron" className="border-t border-(--ui-stroke-tertiary) pt-8">
            <h2 className="text-xl font-bold text-foreground mb-4">4. Background Loops & Reconciliation</h2>
            <p className="text-sm leading-relaxed text-(--ui-text-secondary) mb-4">
              Background operations run on a dual-loop engine designed for consistency and self-healing.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-4">
                <div className="text-xs font-bold text-foreground mb-2">Cron Scheduler (30s Tick)</div>
                <p className="text-xs leading-relaxed text-(--ui-text-secondary)">
                  {"Queries due active jobs (next_run_at <= now()), updates status to running, launches async graph execution with is_cron bypass enabled, and computes the next run time boundary."}
                </p>
              </div>
              <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-4">
                <div className="text-xs font-bold text-foreground mb-2">Stuck Sends Reconciliation (10m Grace)</div>
                <p className="text-xs leading-relaxed text-(--ui-text-secondary)">
                  Scans drafts stuck in approved or send_failed status for over 10 minutes. Checks actual delivery status from Gmail/Outlook, marks as sent if delivered, or retries the send operation.
                </p>
              </div>
            </div>
          </section>

          {/* §5 Bulk Emailer */}
          <section id="bulk-emailer" className="border-t border-(--ui-stroke-tertiary) pt-8 space-y-4">
            <h2 className="text-xl font-bold text-foreground mb-4">5. Bulk Emailer</h2>
            <p className="text-sm leading-relaxed text-(--ui-text-secondary) mb-4">
              A campaign-style bulk email system adapted from The Curator Mail project. Supports personalized templates, CSV-driven contact lists, SMTP routing, and reply threading.
            </p>

            <div className="mb-4">
              <BulkEmailerVisual />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              {[
                { name: 'SMTP Management', desc: 'Direct SMTP connections with auto-reconnect. Supports STARTTLS (port 587) and SSL (port 465). Connection health is verified with NOOP before each send.' },
                { name: 'CSV Contact Import', desc: 'Upload CSV files with automatic column detection. Map email, name, company, role, and city columns. All columns become available as $placeholder tokens.' },
                { name: 'Placeholder Substitution', desc: 'Use $name, $email, $company, $role, $city (or any CSV column) in subject and body. Each placeholder is replaced per-recipient from the CSV row data.' },
                { name: 'Reply Threading', desc: 'Stores RFC 5322 Message-IDs from successful sends. Follow-up campaigns set In-Reply-To and References headers so mail clients group messages as threaded conversations.' },
                { name: 'Live SSE Progress', desc: 'Campaign progress streams via Server-Sent Events. Each recipient result (sent/failed) is pushed in real-time to the frontend progress bar.' },
                { name: 'Campaign Controls', desc: 'Start, stop, and monitor campaigns. Configurable delay between sends (0–60s). Send test emails before launching. Full campaign history with per-recipient results.' },
              ].map((f, i) => (
                <div key={i} className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-4">
                  <div className="text-xs font-semibold text-primary mb-1">{f.name}</div>
                  <p className="text-xs leading-relaxed text-(--ui-text-secondary)">{f.desc}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-4">
              <div className="text-xs font-semibold text-foreground mb-2">MIME Message Structure</div>
              <pre className="text-xs text-(--ui-text-secondary) bg-(--ui-bg-quinary) rounded-lg p-3 overflow-x-auto font-mono">
{`multipart/mixed
├── multipart/alternative
│   ├── text/plain  (auto-generated from HTML)
│   └── text/html   (user-composed body + signature)
├── In-Reply-To: <prev-msg-id>  (if reply threading)
└── References: <prev-msg-id>   (if reply threading)`}
              </pre>
            </div>
          </section>

          {/* §6 Webhooks */}
          <section id="webhooks" className="border-t border-(--ui-stroke-tertiary) pt-8">
            <h2 className="text-xl font-bold text-foreground mb-4">6. Webhooks & Notifications</h2>
            <p className="text-sm leading-relaxed text-(--ui-text-secondary) mb-4">
              Configure background cron jobs to push status updates to messaging platforms.
            </p>
            <div className="space-y-3">
              <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-4">
                <div className="text-xs font-bold text-foreground mb-2">Slack / Discord Webhook Integration</div>
                <p className="text-xs leading-relaxed text-(--ui-text-secondary) mb-2">
                  Set <code>NOTIFICATION_WEBHOOK_URL</code> in your environment. The system posts JSON summaries automatically to your Slack channel or Discord webhook after each background cron run completes.
                </p>
                <code className="block text-xs bg-(--ui-bg-quinary) rounded-lg p-2 text-(--ui-text-tertiary) font-mono overflow-x-auto">
                  {'{ "text": "[Cron: 4 emails categorized, 2 drafts created]" }'}
                </code>
              </div>
            </div>
          </section>

          {/* §7 Frontend Architecture */}
          <section id="frontend" className="border-t border-(--ui-stroke-tertiary) pt-8">
            <h2 className="text-xl font-bold text-foreground mb-4">7. Frontend Architecture</h2>
            <p className="text-sm leading-relaxed text-(--ui-text-secondary) mb-4">
              The frontend is a React + Vite SPA with Tailwind CSS v4 and Nanostores for state. It runs as both a web app and an Electron desktop client.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { name: 'Routing', desc: 'HashRouter with three top-level routes: / (Landing), /docs (Documentation), /app (Dashboard shell). The landing and docs pages enable viewport scrolling via a .scrollable-body CSS class toggle.' },
                { name: 'State Management', desc: 'Nanostores atoms for layout state ($activeView, $sidebarOpen), chat state ($conversations, $messages), approvals, and auth ($userId). No Redux or Context overhead.' },
                { name: 'App Shell', desc: 'The /app route mounts a full-height split layout: ChatSidebar (left rail), ChatPanel + InboxView (resizable split), or BulkEmailerView / CronJobsView / ApprovalsView depending on activeView.' },
                { name: 'PWA Support', desc: 'Web App Manifest enables "Install as App" in Chrome/Edge. The landing page captures beforeinstallprompt for a native install button with fallback instructions for Safari/Firefox.' },
              ].map((f, i) => (
                <div key={i} className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-4">
                  <div className="text-xs font-semibold text-primary mb-1">{f.name}</div>
                  <p className="text-xs leading-relaxed text-(--ui-text-secondary)">{f.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* §8 API Reference */}
          <section id="api-reference" className="border-t border-(--ui-stroke-tertiary) pt-8">
            <h2 className="text-xl font-bold text-foreground mb-4">8. API Reference</h2>
            <p className="text-sm leading-relaxed text-(--ui-text-secondary) mb-4">
              All endpoints are served from FastAPI at port 8000.
            </p>
            {[
              {
                group: 'Chat & Orchestration',
                endpoints: [
                  'POST /chat/{id}/message — Send instruction to agent graph',
                  'GET  /chat/conversations?user_id= — List conversations',
                  'POST /chat/conversations — Create new conversation',
                  'GET  /chat/{id}/messages — Fetch message history',
                  'DELETE /chat/{id} — Delete conversation',
                  'GET  /chat/emails?user_id= — Fetch cached inbox emails',
                  'GET  /chat/emails/{id}/body?user_id= — Fetch full email body',
                  'GET  /chat/alerts?user_id= — Fetch calendar alerts',
                ],
              },
              {
                group: 'Approvals',
                endpoints: [
                  'GET  /approvals?user_id=&status= — List pending approvals',
                  'POST /approvals/{id}/approve — Approve action (optional edited payload)',
                  'POST /approvals/{id}/reject — Reject action',
                ],
              },
              {
                group: 'Auth & Settings',
                endpoints: [
                  'GET  /auth/login?user_id=&frontend_url= — Start Google OAuth',
                  'GET  /auth/status?user_id= — Check Google auth status',
                  'GET  /auth/profile?user_id= — Get Google profile info',
                  'GET  /auth/smtp?user_id= — Fetch SMTP settings',
                  'POST /auth/smtp — Save SMTP settings',
                  'GET  /auth/groq?user_id= — Fetch Groq API key status',
                  'POST /auth/groq — Save Groq API key',
                ],
              },
              {
                group: 'Cron Jobs',
                endpoints: [
                  'GET  /cron?user_id= — List cron jobs',
                  'POST /cron — Create cron job',
                  'PATCH /cron/{id} — Update cron job',
                  'POST /cron/{id}/pause — Pause job',
                  'POST /cron/{id}/resume — Resume job',
                  'POST /cron/{id}/trigger — Manual trigger',
                  'DELETE /cron/{id} — Delete job',
                ],
              },
              {
                group: 'Bulk Emailer',
                endpoints: [
                  'POST /api/bulk-email/smtp-test — Test SMTP credentials',
                  'POST /api/bulk-email/upload-csv — Upload CSV, return parsed contacts',
                  'POST /api/bulk-email/send — Start bulk campaign (returns job_id)',
                  'GET  /api/bulk-email/stream/{id} — SSE progress stream',
                  'POST /api/bulk-email/stop/{id} — Stop running campaign',
                  'GET  /api/bulk-email/history — Campaign run history',
                  'POST /api/bulk-email/test-email — Send single test email',
                ],
              },
            ].map((g, gi) => (
              <div key={gi} className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) overflow-hidden mb-3">
                <div className="bg-(--ui-bg-quinary) border-b border-(--ui-stroke-tertiary) px-4 py-2 text-xs font-bold text-foreground">
                  {g.group}
                </div>
                <div className="px-4 py-3 space-y-1">
                  {g.endpoints.map((ep, ei) => (
                    <div key={ei} className="text-xs text-(--ui-text-secondary) font-mono py-0.5">{ep}</div>
                  ))}
                </div>
              </div>
            ))}
          </section>

          {/* §9 Connect & Setup Guide */}
          <section id="setup-guide" className="border-t border-(--ui-stroke-tertiary) pt-8 space-y-6">
            <h2 className="text-xl font-bold text-foreground">9. Connect & Setup Guide</h2>
            <p className="text-sm leading-relaxed text-(--ui-text-secondary)">
              Follow this comprehensive integration guide to retrieve the necessary keys, set up Google OAuth, gather SMTP credentials, and configure secure storage.
            </p>

            <div className="space-y-4">
              {/* Card 1: Google OAuth */}
              <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-5 space-y-3">
                <div className="text-sm font-bold text-primary flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] text-primary">1</span>
                  Google Gmail API & OAuth Setup
                </div>
                <p className="text-xs leading-relaxed text-(--ui-text-secondary)">
                  Required for reading your inbox messages, creating automated response drafts, and executing approved email sends via the official Gmail API.
                </p>
                <div className="text-xs bg-(--ui-bg-quinary) border border-(--ui-stroke-tertiary) rounded-lg p-3 space-y-2 text-(--ui-text-secondary)">
                  <p className="font-semibold text-foreground">Step-by-Step Instructions:</p>
                  <ol className="list-decimal list-inside space-y-1.5 pl-1">
                    <li>Go to the <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-primary hover:underline">Google Cloud Console</a>.</li>
                    <li>Create a new project. Search for <strong>Gmail API</strong> in the API Library and enable it.</li>
                    <li>Go to <strong>OAuth Consent Screen</strong>. Set User Type to <strong>External</strong> or Internal (Workspace).</li>
                    <li>Add the following required scopes:
                      <ul className="list-disc list-inside pl-4 mt-1 space-y-0.5 text-[11px] text-(--ui-text-tertiary)">
                        <li><code>https://www.googleapis.com/auth/gmail.modify</code> (Read/Write/Archive access)</li>
                        <li><code>https://www.googleapis.com/auth/gmail.compose</code> (Create replies)</li>
                        <li><code>openid</code>, <code>email</code>, and <code>profile</code> (User registration)</li>
                      </ul>
                    </li>
                    <li>Navigate to <strong>Credentials</strong> &gt; <strong>Create Credentials</strong> &gt; <strong>OAuth Client ID</strong>. Select <strong>Web Application</strong>.</li>
                    <li>Add the Authorized Redirect URI: <code className="text-foreground bg-black/40 px-1 rounded">http://localhost:8000/auth/callback</code>.</li>
                    <li>Download your Client ID and Client Secret, then add them to your environment variables.</li>
                  </ol>
                </div>
              </div>

              {/* Card 2: Groq API Key */}
              <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-5 space-y-3">
                <div className="text-sm font-bold text-primary flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] text-primary">2</span>
                  Groq API Credentials (LLM Node)
                </div>
                <p className="text-xs leading-relaxed text-(--ui-text-secondary)">
                  Powers the multi-agent routing graph using highly optimized models (specifically <code>llama-3.3-70b-versatile</code>) to draft responses and analyze threads.
                </p>
                <div className="text-xs bg-(--ui-bg-quinary) border border-(--ui-stroke-tertiary) rounded-lg p-3 space-y-2 text-(--ui-text-secondary)">
                  <p className="font-semibold text-foreground">How to Get & Configure Your Key:</p>
                  <ul className="list-disc list-inside space-y-1.5 pl-1">
                    <li>Sign up or log in at the <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="text-primary hover:underline">Groq Console</a>.</li>
                    <li>Go to <strong>API Keys</strong> in the sidebar menu and click <strong>Create API Key</strong>.</li>
                    <li>Copy the key (starts with <code>gsk_</code>).</li>
                    <li>Paste this key into the app under <strong>Settings &gt; Email Connections</strong> or define the <code>GROQ_API_KEY</code> variable in your backend environment variables.</li>
                  </ul>
                </div>
              </div>

              {/* Card 3: SMTP Credentials */}
              <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-5 space-y-3">
                <div className="text-sm font-bold text-primary flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] text-primary">3</span>
                  SMTP Setup & Credentials (Bulk Outreach)
                </div>
                <p className="text-xs leading-relaxed text-(--ui-text-secondary)">
                  Required for executing high-volume campaigns, cold outreach, and reply-threaded campaign workflows using secondary mailing servers.
                </p>
                <div className="text-xs bg-(--ui-bg-quinary) border border-(--ui-stroke-tertiary) rounded-lg p-3 space-y-2 text-(--ui-text-secondary)">
                  <p className="font-semibold text-foreground">Getting Gmail SMTP credentials:</p>
                  <ol className="list-decimal list-inside space-y-1 pl-1">
                    <li>Enable <strong>2-Step Verification</strong> on your Google account.</li>
                    <li>Go to <strong>Google Account Security</strong> &gt; <strong>2-Step Verification</strong> &gt; <strong>App passwords</strong>.</li>
                    <li>Choose <strong>Other (Custom name)</strong>, type <code>MailingAgent</code>, and click <strong>Generate</strong>.</li>
                    <li>Copy the 16-character code (this serves as your SMTP password).</li>
                    <li>Configure the connections settings:
                      <ul className="list-disc list-inside pl-4 mt-1 text-[11px] text-(--ui-text-tertiary)">
                        <li>SMTP Host: <code>smtp.gmail.com</code></li>
                        <li>SMTP Port: <code>587</code> (STARTTLS) or <code>465</code> (SSL)</li>
                        <li>SMTP Username: <code>your-email@gmail.com</code></li>
                        <li>SMTP Password: <code>[16-character app password]</code></li>
                      </ul>
                    </li>
                  </ol>
                  <p className="font-semibold text-foreground pt-1">Test Connection:</p>
                  <p className="text-[11px]">Use the <strong>Test SMTP</strong> option in the Bulk Emailer UI to dispatch a diagnostic email and verify security handshakes prior to running campaigns.</p>
                </div>
              </div>

              {/* Card 4: Encryption Key */}
              <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-5 space-y-3">
                <div className="text-sm font-bold text-primary flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] text-primary">4</span>
                  Token Storage Encryption Key
                </div>
                <p className="text-xs leading-relaxed text-(--ui-text-secondary)">
                  The database stores Google access and refresh tokens. To prevent compromise, all tokens are encrypted symmetrically at rest using Fernet (AES-128 in CBC mode).
                </p>
                <div className="text-xs bg-(--ui-bg-quinary) border border-(--ui-stroke-tertiary) rounded-lg p-3 space-y-1 text-(--ui-text-secondary)">
                  <p className="font-semibold text-foreground">Generate Encryption Key:</p>
                  <p className="mb-2">Run the following Python script to generate a valid base64 key:</p>
                  <code className="block bg-black/40 text-foreground p-2 rounded text-[11px] font-mono overflow-x-auto">
                    {"python -c \"import base64, os; print(base64.urlsafe_b64encode(os.urandom(32)).decode())\""}
                  </code>
                  <p className="text-[11px] text-(--ui-text-tertiary) pt-1">Save this key as <code>TOKEN_ENCRYPTION_KEY</code> in your environment or <code>.env</code> file.</p>
                </div>
              </div>
            </div>
          </section>

          {/* §10 Deployment */}
          <section id="deployment" className="border-t border-(--ui-stroke-tertiary) pt-8">
            <h2 className="text-xl font-bold text-foreground mb-4">10. Deployment</h2>
            <div className="space-y-3">
              <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-4">
                <div className="text-xs font-bold text-foreground mb-2">Environment Variables</div>
                <pre className="text-xs text-(--ui-text-secondary) bg-(--ui-bg-quinary) rounded-lg p-3 overflow-x-auto font-mono">
{`DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/mailagent
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GROQ_API_KEY=gsk_xxx
ENCRYPTION_KEY=<32-byte-base64>
NOTIFICATION_WEBHOOK_URL=https://hooks.slack.com/services/xxx`}
                </pre>
              </div>
              <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-4">
                <div className="text-xs font-bold text-foreground mb-2">Local Development</div>
                <pre className="text-xs text-(--ui-text-secondary) bg-(--ui-bg-quinary) rounded-lg p-3 overflow-x-auto font-mono">
{`# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Frontend
cd frontend
npm install
npm run dev          # Web app at localhost:5173
npm run electron:dev # Desktop app (Electron)`}
                </pre>
              </div>
              <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-4">
                <div className="text-xs font-bold text-foreground mb-2">PWA Installation</div>
                <p className="text-xs leading-relaxed text-(--ui-text-secondary)">
                  After deployment, users can install the web app as a desktop application using the browser's native install prompt (Chrome, Edge) or "Add to Home Screen" (Safari). The manifest.json and service worker enable standalone mode with the app's dark theme.
                </p>
              </div>
            </div>
          </section>

          {/* Footer */}
          <div className="border-t border-(--ui-stroke-tertiary) pt-6 text-center text-xs text-(--ui-text-tertiary)">
            © 2026 Mailing Agent · MIT License · Built with LangGraph
          </div>
        </main>
      </div>
    </div>
  )
}
export default DocsPage
