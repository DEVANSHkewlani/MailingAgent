import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Download, ArrowRight, Zap, Shield, Cpu, GitBranch, Clock, Mail } from 'lucide-react'

/**
 * LandingPage — Framer dark-canvas marketing page.
 * Design tokens: DESIGN.md (canvas #090909, surface-1 #141414, ink #ffffff,
 * ink-muted #999999, accent-blue #0099ff, gradient spotlight cards).
 * Typography: Inter Variable body, display headlines with tight negative tracking.
 * CTAs: White pill primary, charcoal pill secondary.
 */

export function LandingPage() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [installable, setInstallable] = useState(false)

  useEffect(() => {
    document.body.classList.add('scrollable-body')
    document.documentElement.classList.add('scrollable-body')

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setInstallable(true)
    }
    window.addEventListener('beforeinstallprompt', handler as any)

    return () => {
      document.body.classList.remove('scrollable-body')
      document.documentElement.classList.remove('scrollable-body')
      window.removeEventListener('beforeinstallprompt', handler as any)
    }
  }, [])

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const result = await deferredPrompt.userChoice
      if (result.outcome === 'accepted') {
        setInstallable(false)
        setDeferredPrompt(null)
      }
    } else {
      // Fallback for browsers without beforeinstallprompt (Safari, Firefox)
      alert(
        'To install as a desktop app:\n\n' +
        '• Chrome/Edge: Click the install icon in the address bar\n' +
        '• Safari: Share → Add to Home Screen\n' +
        '• Firefox: Not yet supported — bookmark this page instead'
      )
    }
  }

  return (
    <div
      className="min-h-screen overflow-x-hidden relative"
      style={{
        background: '#090909',
        color: '#ffffff',
        fontFamily: "'Inter', sans-serif",
        fontFeatureSettings: "'cv11', 'ss03', 'ss07'",
      }}
    >
      {/* ─── Top Nav ─── */}
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-6 sm:px-12"
        style={{
          height: 56,
          background: 'rgba(9,9,9,0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid #1a1a1a',
        }}
      >
        <span
          className="font-semibold tracking-tight select-none"
          style={{ fontSize: 14, letterSpacing: '-0.14px' }}
        >
          ✉ Mailing Agent
        </span>
        <nav className="flex items-center gap-8">
          <button
            onClick={() => scrollTo('features')}
            className="cursor-pointer focus:outline-none"
            style={{ fontSize: 14, fontWeight: 500, color: '#999999', letterSpacing: '-0.14px' }}
          >
            Features
          </button>
          <Link
            to="/docs"
            style={{ fontSize: 14, fontWeight: 500, color: '#999999', letterSpacing: '-0.14px' }}
          >
            Docs
          </Link>
          <Link to="/app">
            <button
              style={{
                background: '#ffffff',
                color: '#000000',
                fontSize: 14,
                fontWeight: 500,
                letterSpacing: '-0.14px',
                borderRadius: 100,
                padding: '10px 15px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Launch App
            </button>
          </Link>
        </nav>
      </header>

      {/* ─── Hero ─── */}
      <section className="max-w-7xl mx-auto px-6 sm:px-12 pt-24 pb-20 text-center">
        <h1
          className="mx-auto"
          style={{
            fontSize: 'clamp(42px, 7vw, 85px)',
            fontWeight: 500,
            lineHeight: 0.95,
            letterSpacing: '-4.25px',
            maxWidth: 900,
          }}
        >
          The inbox that works for you
        </h1>
        <p
          className="mx-auto mt-6"
          style={{
            fontSize: 18,
            fontWeight: 400,
            lineHeight: 1.3,
            letterSpacing: '-0.18px',
            color: '#999999',
            maxWidth: 560,
          }}
        >
          A self-learning email assistant powered by LangGraph. It categorizes,
          drafts, summarizes, and waits for your approval before sending.
        </p>

        {/* CTA Pills */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-10">
          <Link to="/app">
            <button
              style={{
                background: '#ffffff',
                color: '#000000',
                fontSize: 14,
                fontWeight: 500,
                letterSpacing: '-0.14px',
                borderRadius: 100,
                padding: '12px 24px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Launch Web App
              <ArrowRight className="inline-block ml-2 size-4" style={{ verticalAlign: 'middle' }} />
            </button>
          </Link>
          <button
            onClick={handleInstall}
            style={{
              background: '#141414',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 500,
              letterSpacing: '-0.14px',
              borderRadius: 100,
              padding: '12px 24px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <Download className="inline-block mr-2 size-4" style={{ verticalAlign: 'middle' }} />
            {installable ? 'Install as Desktop App' : 'Install App'}
          </button>
        </div>

        <p
          className="mt-4"
          style={{ fontSize: 12, color: '#999999', letterSpacing: '-0.12px' }}
        >
          Open Source · MIT License
        </p>
      </section>

      {/* ─── Features Grid ─── */}
      <section id="features" className="max-w-7xl mx-auto px-6 sm:px-12 py-24">
        <h2
          className="text-center mb-16"
          style={{
            fontSize: 'clamp(32px, 5vw, 62px)',
            fontWeight: 500,
            lineHeight: 1.0,
            letterSpacing: '-3.1px',
          }}
        >
          Built to think, not just reply
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Feature Cards — charcoal surface */}
          {[
            {
              icon: <Cpu className="size-5" />,
              title: 'Multi-Agent System',
              desc: 'A LangGraph-powered graph of specialized workers — reader, categorizer, drafter, summarizer, executor — coordinated by a supervisor router.',
            },
            {
              icon: <Shield className="size-5" />,
              title: 'Human-in-the-Loop Safety',
              desc: 'Every risky action requires HMAC-signed approval. Low-risk operations auto-execute. Cron tasks bypass with cryptographic is_cron tokens.',
            },
            {
              icon: <Mail className="size-5" />,
              title: 'Smart Categorization',
              desc: 'Emails are classified into urgent, action_needed, newsletter, personal, and more — then labeled directly in your Gmail inbox.',
            },
            {
              icon: <GitBranch className="size-5" />,
              title: 'Style-Aware Drafting',
              desc: 'Reply drafts match your writing style using stored profiles — font, tone, signature, and HTML formatting preserved.',
            },
            {
              icon: <Clock className="size-5" />,
              title: 'Background Cron Engine',
              desc: 'Schedule any instruction to run periodically. The dual-loop engine ticks every 30s and self-heals stuck sends every 10 minutes.',
            },
            {
              icon: <Zap className="size-5" />,
              title: 'Webhook Notifications',
              desc: 'Push cron summaries to WhatsApp (via Twilio), Slack, Discord, or any custom webhook endpoint in real time.',
            },
          ].map((f, i) => (
            <div
              key={i}
              style={{
                background: '#141414',
                border: '1px solid #262626',
                borderRadius: 20,
                padding: 24,
              }}
            >
              <div style={{ color: '#999999', marginBottom: 12 }}>{f.icon}</div>
              <h3
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  lineHeight: 1.2,
                  letterSpacing: '-0.8px',
                  marginBottom: 8,
                }}
              >
                {f.title}
              </h3>
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 400,
                  lineHeight: 1.3,
                  letterSpacing: '-0.15px',
                  color: '#999999',
                }}
              >
                {f.desc}
              </p>
            </div>
          ))}
        </div>

        {/* Gradient Spotlight Card — signature atmospheric panel */}
        <div
          className="mt-5 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #6a4cf5 0%, #d44df0 50%, #ff7a3d 100%)',
            borderRadius: 30,
            padding: 32,
          }}
        >
          <div
            className="absolute top-0 right-0 rounded-full pointer-events-none"
            style={{
              width: 300,
              height: 300,
              background: 'rgba(255,255,255,0.08)',
              filter: 'blur(80px)',
            }}
          />
          <h3
            style={{
              fontSize: 24,
              fontWeight: 400,
              lineHeight: 1.3,
              letterSpacing: '-0.01px',
              maxWidth: 500,
              position: 'relative',
            }}
          >
            Deploy once, run anywhere — as a hosted web app or a native
            desktop client with Electron.
          </h3>
          <div className="flex gap-3 mt-6 relative">
            <Link to="/app">
              <button
                style={{
                  background: '#ffffff',
                  color: '#000000',
                  fontSize: 14,
                  fontWeight: 500,
                  letterSpacing: '-0.14px',
                  borderRadius: 100,
                  padding: '10px 15px',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Try it now
              </button>
            </Link>
            <Link to="/docs">
              <button
                style={{
                  background: '#1c1c1c',
                  color: '#ffffff',
                  fontSize: 14,
                  fontWeight: 500,
                  letterSpacing: '-0.14px',
                  borderRadius: 30,
                  padding: '10px 15px',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Read the docs
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer
        className="text-center px-6 sm:px-12"
        style={{
          padding: '64px 32px',
          borderTop: '1px solid #1a1a1a',
          fontSize: 13,
          fontWeight: 500,
          lineHeight: 1.2,
          letterSpacing: '-0.13px',
          color: '#999999',
        }}
      >
        © 2026 Mailing Agent · MIT License · Built with LangGraph
      </footer>
    </div>
  )
}
export default LandingPage
