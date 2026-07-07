/**
 * SettingsView Component — parent settings modal controller.
 * Ported from Hermes Agent settings/index.tsx, using overlay split sidebar layouts.
 */

import { useState } from 'react'
import { Mail, Palette, Shield, FileText, Info } from 'lucide-react'
import { OverlayView } from '../overlays/overlay-view'
import { OverlaySplitLayout, OverlaySidebar, OverlayMain, OverlayNavItem } from '../overlays/overlay-split-layout'
import { AppearanceSettings } from './appearance-settings'
import { ProviderSettings } from './provider-settings'
import { PermissionSettings } from './permission-settings'
import { StyleSettings } from './style-settings'
import { AboutSettings } from './about-settings'

interface SettingsViewProps {
  onClose: () => void
}

type SettingsTab = 'providers' | 'appearance' | 'permissions' | 'style' | 'about'

export function SettingsView({ onClose }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance')

  return (
    <OverlayView onClose={onClose} closeLabel="Close Settings">
      <OverlaySplitLayout>
        {/* Left Sidebar */}
        <OverlaySidebar>
          <div className="space-y-1">
            <div className="px-2 pb-2 text-[10px] uppercase font-bold tracking-wider text-(--ui-text-quaternary) select-none">
              Mailing Settings
            </div>
            
            <OverlayNavItem
              active={activeTab === 'providers'}
              icon={Mail}
              label="Email Connections"
              onClick={() => setActiveTab('providers')}
            />
            <OverlayNavItem
              active={activeTab === 'permissions'}
              icon={Shield}
              label="Permission Rules"
              onClick={() => setActiveTab('permissions')}
            />
            <OverlayNavItem
              active={activeTab === 'style'}
              icon={FileText}
              label="Style Profiles"
              onClick={() => setActiveTab('style')}
            />
            
            {/* Visuals Divider */}
            <div className="my-2 h-px bg-border/20 mx-2" />
            <div className="px-2 pb-2 text-[10px] uppercase font-bold tracking-wider text-(--ui-text-quaternary) select-none">
              System Settings
            </div>

            <OverlayNavItem
              active={activeTab === 'appearance'}
              icon={Palette}
              label="Appearance Themes"
              onClick={() => setActiveTab('appearance')}
            />
            <OverlayNavItem
              active={activeTab === 'about'}
              icon={Info}
              label="About Agent"
              onClick={() => setActiveTab('about')}
            />
          </div>
        </OverlaySidebar>

        {/* Right Main Content */}
        <OverlayMain>
          {activeTab === 'providers' && <ProviderSettings />}
          {activeTab === 'permissions' && <PermissionSettings />}
          {activeTab === 'style' && <StyleSettings />}
          {activeTab === 'appearance' && <AppearanceSettings />}
          {activeTab === 'about' && <AboutSettings />}
        </OverlayMain>
      </OverlaySplitLayout>
    </OverlayView>
  )
}
export default SettingsView
