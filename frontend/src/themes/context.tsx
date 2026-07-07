/**
 * Theme context — applies the active theme as CSS custom properties on :root.
 * Mode (light/dark/system) controls brightness; skin controls accent.
 * Ported from Hermes Agent desktop theme context.
 */

import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from 'react'
import type { DesktopTheme, DesktopThemeColors, ThemeMode } from './types'
import { BUILTIN_THEMES, BUILTIN_THEME_LIST, DEFAULT_SKIN_NAME, DEFAULT_TYPOGRAPHY } from './presets'

const SKIN_KEY = 'mailing-agent-theme-v1'
const MODE_KEY = 'mailing-agent-mode-v1'

// ── Color math ──────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(c => Math.round(c).toString(16).padStart(2, '0')).join('')
}

function mix(base: string, blend: string, amount: number): string {
  const [r1, g1, b1] = hexToRgb(base)
  const [r2, g2, b2] = hexToRgb(blend)
  return rgbToHex(
    r1 + (r2 - r1) * amount,
    g1 + (g2 - g1) * amount,
    b1 + (b2 - b1) * amount,
  )
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function readableOn(bg: string): string {
  return luminance(bg) > 0.179 ? '#161616' : '#fcfcfc'
}

// Synthesize a light palette from a dark-only skin
function synthLightColors(seed: DesktopTheme): DesktopThemeColors {
  const accent = seed.colors.ring || seed.colors.primary
  const soft = mix('#ffffff', accent, 0.1)
  const softer = mix('#ffffff', accent, 0.06)
  const border = mix('#ececef', accent, 0.14)
  const midground = seed.colors.midground ?? accent

  return {
    background: '#ffffff',
    foreground: '#161616',
    card: '#ffffff',
    cardForeground: '#161616',
    muted: softer,
    mutedForeground: mix('#6b6b70', accent, 0.16),
    popover: '#ffffff',
    popoverForeground: '#161616',
    primary: accent,
    primaryForeground: readableOn(accent),
    secondary: soft,
    secondaryForeground: mix('#2a2a2a', accent, 0.34),
    accent: soft,
    accentForeground: mix('#2a2a2a', accent, 0.34),
    border,
    input: mix('#d8d8da', accent, 0.2),
    ring: accent,
    midground,
    composerRing: seed.colors.composerRing ?? midground,
    destructive: '#cf2d56',
    destructiveForeground: '#ffffff',
    sidebarBackground: mix('#f7f7f8', accent, 0.04),
    sidebarBorder: mix('#e4e4e6', accent, 0.1),
    userBubble: softer,
    userBubbleBorder: border,
  }
}

// ── Apply theme to DOM ──────────────────────────────────────────────────────

const INJECTED_FONT_URLS = new Set<string>()

function applyTheme(theme: DesktopTheme, isDark: boolean): void {
  const root = document.documentElement

  // Toggle .dark class
  if (isDark) {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }

  // Resolve color palette
  let palette: DesktopThemeColors
  if (isDark) {
    palette = theme.darkColors ?? theme.colors
  } else {
    palette = theme.darkColors && !theme.colors.background.startsWith('#f')
      ? synthLightColors(theme)
      : theme.colors
  }

  // Write CSS custom properties
  const vars: Record<string, string> = {
    '--theme-foreground': palette.foreground,
    '--theme-primary': palette.primary,
    '--theme-secondary': palette.secondary,
    '--theme-accent-soft': palette.accent,
    '--theme-midground': palette.midground ?? palette.ring,
    '--theme-background-seed': palette.background,
    '--theme-sidebar-seed': palette.sidebarBackground ?? palette.background,
    '--theme-card-seed': palette.card,
    '--theme-elevated-seed': palette.popover,
    '--dt-primary': palette.primary,
    '--dt-primary-foreground': palette.primaryForeground,
    '--dt-destructive': palette.destructive,
    '--dt-destructive-foreground': palette.destructiveForeground,
    '--dt-user-bubble': palette.userBubble ?? palette.card,
    '--dt-user-bubble-border': palette.userBubbleBorder ?? palette.border,
    '--dt-midground': palette.midground ?? palette.ring,
    '--dt-composer-ring': palette.composerRing ?? palette.midground ?? palette.ring,
  }

  if (isDark) {
    vars['--theme-neutral-chrome'] = palette.background
    vars['--theme-neutral-sidebar'] = palette.sidebarBackground ?? palette.background
    vars['--theme-neutral-card'] = palette.card
  }

  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }

  // Apply typography
  const typo = { ...DEFAULT_TYPOGRAPHY, ...theme.typography }
  root.style.setProperty('--dt-font-sans', typo.fontSans)
  root.style.setProperty('--dt-font-mono', typo.fontMono)

  // Inject font stylesheet
  if (typo.fontUrl && !INJECTED_FONT_URLS.has(typo.fontUrl)) {
    INJECTED_FONT_URLS.add(typo.fontUrl)
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = typo.fontUrl
    document.head.appendChild(link)
  }
}

// ── Context ─────────────────────────────────────────────────────────────────

interface ThemeContextValue {
  themeName: string
  mode: ThemeMode
  resolvedMode: 'light' | 'dark'
  availableThemes: DesktopTheme[]
  setTheme: (name: string) => void
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function loadSkin(): string {
  const stored = localStorage.getItem(SKIN_KEY)
  return stored && BUILTIN_THEMES[stored] ? stored : DEFAULT_SKIN_NAME
}

function loadMode(): ThemeMode {
  const stored = localStorage.getItem(MODE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeName, setThemeNameState] = useState(loadSkin)
  const [mode, setModeState] = useState<ThemeMode>(loadMode)
  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  // Listen for system color scheme changes
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  const resolved = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode
  const theme = BUILTIN_THEMES[themeName] ?? BUILTIN_THEMES[DEFAULT_SKIN_NAME]

  // Apply theme to DOM whenever it changes
  useEffect(() => {
    applyTheme(theme, resolved === 'dark')
  }, [theme, resolved])

  const setTheme = useCallback((name: string) => {
    setThemeNameState(name)
    localStorage.setItem(SKIN_KEY, name)
  }, [])

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m)
    localStorage.setItem(MODE_KEY, m)
  }, [])

  const value = useMemo<ThemeContextValue>(() => ({
    themeName,
    mode,
    resolvedMode: resolved,
    availableThemes: BUILTIN_THEME_LIST,
    setTheme,
    setMode,
  }), [themeName, mode, resolved, setTheme, setMode])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
