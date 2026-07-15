import { Link } from 'react-router-dom'
import { KeyRound, ShieldAlert, MailCheck, Globe2, ArrowRight } from 'lucide-react'

export function SetupOnboardingVisual() {
  const steps = [
    {
      step: '01',
      title: 'Google OAuth Client ID',
      badge: 'Gmail REST API',
      icon: <Globe2 className="size-4.5 text-white/70" />,
      desc: 'Enable Gmail API in Google Cloud Console. Create OAuth Credentials and add redirect: http://localhost:8000/auth/callback. Save Client ID and secret to authorize automated reading and sending.',
      shortKey: 'GOOGLE_CLIENT_ID',
    },
    {
      step: '02',
      title: 'Groq LLM Key Configuration',
      badge: 'Supervisor Model',
      icon: <KeyRound className="size-4.5 text-white/70" />,
      desc: 'Sign up on console.groq.com. Generate a secret API key starting with gsk_ to host the Llama supervisor routing graph. Co-ordinates subtasks dynamically.',
      shortKey: 'GROQ_API_KEY',
    },
    {
      step: '03',
      title: 'SMTP Mail Credentials',
      badge: 'Outbound Sends',
      icon: <MailCheck className="size-4.5 text-white/70" />,
      desc: 'Activate 2-Step Verification in Google Account. Generate a 16-character App Password to route bulk mail campaigns over port 587 with STARTTLS encryption.',
      shortKey: 'smtp.gmail.com:587',
    },
    {
      step: '04',
      title: 'Fernet Symmetrical Encryption Key',
      badge: 'Data Security',
      icon: <ShieldAlert className="size-4.5 text-white/70" />,
      desc: 'Create a 32-byte URL-safe base64 key using python -c. Symmetrically encrypts stored OAuth refresh and access tokens at rest inside the database.',
      shortKey: 'TOKEN_ENCRYPTION_KEY',
    },
  ]

  return (
    <div className="w-full space-y-4 font-sans relative">
      {/* Scrollable Container with Fading Shadow */}
      <div className="relative">
        <div 
          className="space-y-3.5 max-h-[350px] overflow-y-auto pr-1 pb-16 scrollbar-none"
          style={{
            scrollbarWidth: 'none', /* Firefox */
            msOverflowStyle: 'none', /* IE/Edge */
          }}
        >
          {steps.map((step, idx) => (
            <div 
              key={idx} 
              className="rounded-xl p-5 flex items-start gap-4 transition-all relative overflow-hidden group"
              style={{
                background: 'rgba(20, 20, 20, 0.45)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              {/* Index Counter */}
              <div className="text-xs font-mono font-bold text-white/20 shrink-0 mt-0.5 select-none">
                {step.step}
              </div>

              {/* Icon */}
              <div className="p-2.5 rounded bg-white/5 border border-white/5 shrink-0 text-white/60 mt-0.5">
                {step.icon}
              </div>

              {/* Details */}
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs sm:text-sm font-bold text-white/90 truncate">{step.title}</h4>
                  <span className="text-[9px] font-mono bg-white/5 border border-white/5 text-white/40 rounded px-2 py-0.5 shrink-0">
                    {step.badge}
                  </span>
                </div>
                <p className="text-[11px] text-white/40 leading-relaxed">
                  {step.desc}
                </p>
                <div className="flex items-center gap-1.5 text-[9px] text-white/30 pt-1 border-t border-white/5">
                  <span>Parameter:</span>
                  <code className="text-white/60 bg-black/30 px-1.5 py-0.5 rounded font-mono text-[9px]">{step.shortKey}</code>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Fading Shadow Overlay at the bottom */}
        <div 
          className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, transparent 0%, #090909 100%)',
          }}
        />
      </div>

      <div className="pt-2">
        <Link to="/docs#setup-guide" className="w-full block">
          <button 
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg text-white hover:bg-white/5 px-4 py-2.5 text-xs font-semibold border border-white/5 transition-all cursor-pointer"
            style={{
              background: 'rgba(255, 255, 255, 0.02)',
            }}
          >
            Explore the Setup Guide Docs
            <ArrowRight className="size-3.5" />
          </button>
        </Link>
      </div>
    </div>
  )
}
