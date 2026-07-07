/**
 * Desktop theme type definitions.
 * Ported from Hermes Agent — defines the shape of color tokens and typography.
 */

export interface DesktopThemeColors {
  background: string
  foreground: string
  card: string
  cardForeground: string
  muted: string
  mutedForeground: string
  popover: string
  popoverForeground: string
  primary: string
  primaryForeground: string
  secondary: string
  secondaryForeground: string
  accent: string
  accentForeground: string
  border: string
  input: string
  ring: string
  midground?: string
  composerRing?: string
  destructive: string
  destructiveForeground: string
  sidebarBackground?: string
  sidebarBorder?: string
  userBubble?: string
  userBubbleBorder?: string
}

export interface DesktopThemeTypography {
  fontSans: string
  fontMono: string
  fontUrl?: string
}

export interface DesktopTheme {
  name: string
  label: string
  description: string
  colors: DesktopThemeColors
  darkColors?: DesktopThemeColors
  typography?: Partial<DesktopThemeTypography>
}

export type ThemeMode = 'light' | 'dark' | 'system'
