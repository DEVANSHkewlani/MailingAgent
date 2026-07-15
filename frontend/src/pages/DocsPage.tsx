import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

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
                className={`text-left text-sm py-2 px-3 rounded-sm transition-colors cursor-pointer focus:outline-none ${
                  activeSection === s.id
                    ? 'bg-(--ui-bg-tertiary) text-foreground font-semibold'
                    : 'text-(--ui-text-secondary) hover:bg-(--ui-bg-quaternary) hover:text-foreground'
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
                {['Python 3.11+', 'FastAPI', 'LangGraph', 'PostgreSQL', 'Google Gmail API', 'React + Vite', 'Tailwind CSS', 'Nanostores', 'Electron (optional)', 'Twilio (WhatsApp)'].map(t => (
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { name: 'Reader Worker', desc: 'Fetches emails from Gmail via the Google API. Extracts headers, body, attachments, timestamps, and thread IDs. Supports pagination and label filtering.' },
                { name: 'Categorizer Worker', desc: 'Classifies emails into categories (urgent, action_needed, newsletter, personal, etc.) using user-seeded rules with LLM fallback for ambiguous cases.' },
                { name: 'Drafter Worker', desc: 'Generates context-aware reply drafts matching the user\'s writing style profile — font, tone, signature, and HTML formatting are preserved.' },
                { name: 'Summarizer Worker', desc: 'Condenses multi-reply threads into key-point summaries. Maintains a watermark so re-summarizing only processes new messages.' },
                { name: 'Executor Worker', desc: 'Performs approved actions: sending emails via Gmail API or SMTP, creating calendar events, applying labels, and archiving threads.' },
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
          <section id="bulk-emailer" className="border-t border-(--ui-stroke-tertiary) pt-8">
            <h2 className="text-xl font-bold text-foreground mb-4">5. Bulk Emailer</h2>
            <p className="text-sm leading-relaxed text-(--ui-text-secondary) mb-4">
              A campaign-style bulk email system adapted from The Curator Mail project. Supports personalized templates, CSV-driven contact lists, SMTP routing, and reply threading.
            </p>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-4">
                <div className="text-xs font-bold text-foreground mb-2">WhatsApp (Twilio)</div>
                <p className="text-xs leading-relaxed text-(--ui-text-secondary) mb-2">
                  Create a Twilio sandbox. POST to the Messages API with From, To (whatsapp:+number), and Body parameters.
                </p>
                <code className="block text-xs bg-(--ui-bg-quinary) rounded-lg p-2 text-(--ui-text-tertiary) font-mono overflow-x-auto">
                  POST /2010-04-01/Accounts/[SID]/Messages.json
                </code>
              </div>
              <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-4">
                <div className="text-xs font-bold text-foreground mb-2">Slack / Discord Webhook</div>
                <p className="text-xs leading-relaxed text-(--ui-text-secondary) mb-2">
                  Set NOTIFICATION_WEBHOOK_URL in your environment. The system posts JSON summaries automatically after each cron run.
                </p>
                <code className="block text-xs bg-(--ui-bg-quinary) rounded-lg p-2 text-(--ui-text-tertiary) font-mono overflow-x-auto">
                  {'{ "text": "[Cron: 4 emails categorized]" }'}
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

          {/* §9 Deployment */}
          <section id="deployment" className="border-t border-(--ui-stroke-tertiary) pt-8">
            <h2 className="text-xl font-bold text-foreground mb-4">9. Deployment</h2>
            <div className="space-y-3">
              <div className="rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-bg-editor) p-4">
                <div className="text-xs font-bold text-foreground mb-2">Environment Variables</div>
                <pre className="text-xs text-(--ui-text-secondary) bg-(--ui-bg-quinary) rounded-lg p-3 overflow-x-auto font-mono">
{`DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/mailagent
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
GROQ_API_KEY=gsk_xxx
ENCRYPTION_KEY=<32-byte-base64>
NOTIFICATION_WEBHOOK_URL=https://hooks.slack.com/services/xxx
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_WHATSAPP_TO=whatsapp:+1xxxxxxxxxx`}
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
