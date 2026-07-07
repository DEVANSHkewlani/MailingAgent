/**
 * LandingPage Page — product marketing landing website.
 * Replicates the vivid blue backdrop, serif headings, download buttons,
 * and woodcut line illustration from photo 4.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Copy, Check, ExternalLink } from 'lucide-react'
import { Button } from '../components/ui/button'

export function LandingPage() {
  const [copied, setCopied] = useState(false)
  const installCmd = 'curl -fsSL https://mailing-agent.com/install.sh | bash'

  const copyToClipboard = () => {
    navigator.clipboard.writeText(installCmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#004ef0] via-[#002ca8] to-[#01083c] text-white flex flex-col justify-between font-sans select-none overflow-x-hidden">
      {/* Navigation Header */}
      <header className="flex items-center justify-between px-6 sm:px-12 py-6 border-b border-white/5 select-none">
        <div className="flex items-center gap-1.5 font-serif text-lg font-bold tracking-wider select-none">
          <span>✉ MAILING AGENT</span>
        </div>
        <nav className="flex items-center gap-6 sm:gap-10 text-[10px] tracking-wider uppercase font-bold text-white/70">
          <a href="#features" className="hover:text-white transition-colors">Features</a>
          <a href="#docs" className="hover:text-white transition-colors">Docs</a>
          <Link to="/app" className="hover:text-white transition-colors">Dashboard</Link>
          <a href="#install" className="hover:text-white transition-colors flex items-center gap-1">
            Install <ExternalLink className="size-3" />
          </a>
        </nav>
      </header>

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl mx-auto px-6 sm:px-12 py-16 grid grid-cols-1 lg:grid-cols-2 items-center gap-12">
        {/* Left Column Description */}
        <div className="space-y-8 max-w-xl text-left">
          <div className="space-y-1">
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/50 block">
              Open Source • MIT License
            </span>
            <h2 className="font-serif text-5xl sm:text-6xl font-extrabold leading-[1.1] tracking-tight">
              THE INBOX<br />THAT WORKS<br />FOR YOU
            </h2>
          </div>
          
          <p className="text-xs leading-6 text-white/80 max-w-md font-mono">
            A self-learning email assistant and calendar synchronizer powered by LangGraph. It categorizes threads, drafts stylistic replies, checks scheduling conflicts, and prompts for your permission before executing sends.
          </p>

          {/* Action Buttons */}
          <div className="space-y-5 pt-2">
            <div>
              <label className="text-[9px] uppercase font-bold tracking-wider text-white/40 block mb-2 select-none">
                Install Desktop Client
              </label>
              <div className="flex flex-wrap gap-3">
                <Link to="/app">
                  <Button className="bg-white hover:bg-white/95 text-[#002ca8] hover:-translate-y-0.5 active:translate-y-0 font-bold px-6 py-5 rounded-lg text-xs uppercase shadow-md transition-all duration-200 flex items-center gap-2">
                    <Download className="size-4" />
                    Open Web App
                  </Button>
                </Link>
                <Button className="border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 hover:-translate-y-0.5 active:translate-y-0 font-bold px-6 py-5 rounded-lg text-xs uppercase shadow-sm transition-all duration-200 flex items-center gap-2">
                  <Download className="size-4" />
                  Download for Mac OS
                </Button>
              </div>
            </div>

            {/* Install code box */}
            <div className="max-w-md select-text" id="install">
              <label className="text-[9px] uppercase font-bold tracking-wider text-white/40 block mb-2 select-none">
                Install via Terminal
              </label>
              <div className="flex items-center justify-between bg-black/25 border border-white/5 rounded-lg px-4 py-2.5 font-mono text-[10px] leading-none text-white/80">
                <span className="truncate">{installCmd}</span>
                <button
                  onClick={copyToClipboard}
                  className="text-white/60 hover:text-white transition-colors ml-4 focus:outline-none select-none"
                >
                  {copied ? <Check className="size-4 text-[var(--ui-green)]" /> : <Copy className="size-4" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column Woodcut Illustration (SVG Etching representation like photo 4) */}
        <div className="flex justify-center select-none lg:justify-end">
          <svg
            className="w-[22rem] sm:w-[32rem] h-auto text-white/90 drop-shadow-2xl"
            viewBox="0 0 500 500"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* Sun rays center background */}
            <circle cx="250" cy="250" r="10" fill="currentColor" opacity="0.4" />
            <circle cx="250" cy="250" r="160" strokeDasharray="3 6" opacity="0.15" />
            <circle cx="250" cy="250" r="220" opacity="0.1" />

            {/* Line extensions radiating out */}
            {Array.from({ length: 48 }).map((_, i) => {
              const angle = (i * 360) / 48
              const rad = (angle * Math.PI) / 180
              const x1 = 250 + Math.cos(rad) * 40
              const y1 = 250 + Math.sin(rad) * 40
              const x2 = 250 + Math.cos(rad) * 240
              const y2 = 250 + Math.sin(rad) * 240
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  opacity={i % 4 === 0 ? '0.2' : '0.08'}
                />
              )
            })}

            {/* Fine etchings / woodcut outline grid overlays */}
            <path
              d="M 120,250 C 120,120 380,120 380,250 C 380,380 120,380 120,250"
              strokeDasharray="2 4"
              opacity="0.15"
            />
            
            {/* Graphic vector representation of multiple-armed winged envelope/messenger */}
            {/* Central envelope / shield */}
            <rect x="200" y="210" width="100" height="70" rx="6" strokeWidth="1.5" />
            <path d="M 200,212 L 250,250 L 300,212" strokeWidth="1.5" />
            <path d="M 200,278 L 240,248" />
            <path d="M 300,278 L 260,248" />

            {/* Multiple wings (Mercury wings representation) */}
            {/* Wing 1 Left */}
            <path d="M 200,220 C 150,200 120,230 90,260 C 130,265 170,255 200,245" strokeWidth="1.2" />
            <path d="M 180,230 C 140,215 120,235 100,255" opacity="0.6" />
            <path d="M 160,238 C 130,225 110,242 105,250" opacity="0.4" />
            
            {/* Wing 1 Right */}
            <path d="M 300,220 C 350,200 380,230 410,260 C 370,265 330,255 300,245" strokeWidth="1.2" />
            <path d="M 320,230 C 360,215 380,235 400,255" opacity="0.6" />
            <path d="M 340,238 C 370,225 390,242 395,250" opacity="0.4" />

            {/* Additional lower arms/wings for high-detail woodcut feel */}
            <path d="M 200,255 C 140,260 110,290 80,330 C 120,320 160,295 200,270" strokeWidth="1.2" />
            <path d="M 300,255 C 360,260 390,290 420,330 C 380,320 340,295 300,270" strokeWidth="1.2" />

            {/* Upper rays and halo circles */}
            <circle cx="250" cy="180" r="30" strokeDasharray="1 3" opacity="0.3" />
            <path d="M 230,180 L 270,180 M 250,160 L 250,200" opacity="0.4" />
          </svg>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-8 text-xs text-white/50 border-t border-white/10 select-none">
        <span>© 2026 Mailing Agent. Built by Nous Research guidelines. MIT License.</span>
      </footer>
    </div>
  )
}
export default LandingPage
