/**
 * AppearanceSettings Component — theme preset selection.
 * Ported from Hermes Agent appearance-settings.tsx (photo 3).
 */

import { useStore } from '@nanostores/react'
import { Palette, Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '../../themes/context'
import { $translucency, setTranslucency } from '../../store/translucency'
import { SegmentedControl } from '../ui/segmented-control'
import { ListRow, SectionHeading } from './primitives'
import { cn } from '../../lib/utils'

export function AppearanceSettings() {
  const { themeName, mode, availableThemes, setTheme, setMode } = useTheme()
  const translucency = useStore($translucency)

  const modeOptions = [
    { id: 'light', label: 'Light', icon: <Sun className="size-3.5" /> },
    { id: 'dark', label: 'Dark', icon: <Moon className="size-3.5" /> },
    { id: 'system', label: 'System', icon: <Monitor className="size-3.5" /> },
  ] as const

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <SectionHeading icon={Palette} title="Appearance Settings" />
        <p className="text-xs text-(--ui-text-tertiary) mt-1">
          Customize the visual style, accent colors, theme presets, and transparency depth of the dashboard.
        </p>
      </div>

      <div className="mt-4 divide-y divide-(--ui-stroke-tertiary)">
        {/* Color Mode / Theme Grid */}
        <ListRow
          title={
            <div className="flex items-center justify-between gap-3 select-none">
              <span>Theme Mode</span>
              <SegmentedControl
                options={modeOptions}
                value={mode}
                onChange={id => setMode(id)}
              />
            </div>
          }
          description="Choose between light and dark modes or let your operating system control the theme."
          wide
          below={
            /* Theme Grid Layout */
            <div className="grid gap-3 mt-4 sm:grid-cols-2 lg:grid-cols-3 select-none">
              {availableThemes.map(theme => {
                const active = themeName === theme.name

                return (
                  <button
                    key={theme.name}
                    type="button"
                    onClick={() => setTheme(theme.name)}
                    className={cn(
                      'rounded-xl border p-3 text-left transition-all relative flex flex-col',
                      active
                        ? 'border-primary bg-(--ui-bg-tertiary) shadow-sm'
                        : 'border-(--ui-stroke-secondary) bg-(--ui-bg-editor) hover:border-(--ui-stroke-primary)'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {/* Accent color dot indicator */}
                      <span
                        className="size-3.5 rounded-full border border-black/10 shrink-0"
                        style={{ backgroundColor: theme.colors.primary }}
                      />
                      <span className="text-xs font-bold text-foreground truncate">
                        {theme.label}
                      </span>
                    </div>
                    <span className="text-[0.6875rem] text-(--ui-text-tertiary) mt-1 leading-4 line-clamp-2">
                      {theme.description}
                    </span>
                  </button>
                )
              })}
            </div>
          }
        />

        {/* Translucency Slider Control */}
        <ListRow
          title="Window Translucency"
          description="Make the dashboard window translucent, letting your desktop background reveal through behind panels (supported on macOS & Windows native builds)."
          action={
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={translucency}
                onChange={e => setTranslucency(Number(e.target.value))}
                className="h-1 w-40 cursor-pointer appearance-none rounded-full bg-(--ui-stroke-tertiary) outline-none"
                style={{ accentColor: 'var(--theme-primary)' }}
              />
              <span className="w-9 text-right text-xs font-mono text-(--ui-text-tertiary)">
                {translucency}%
              </span>
            </div>
          }
        />
      </div>
    </div>
  )
}
export default AppearanceSettings
