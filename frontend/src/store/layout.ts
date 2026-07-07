/**
 * Layout store — sidebar open state, active view.
 */

import { atom } from 'nanostores'

export type AppView = 'chat' | 'approvals' | 'calendar'

export const $sidebarOpen = atom<boolean>(true)
export const $activeView = atom<AppView>('chat')
export const $settingsOpen = atom<boolean>(false)

export function setSidebarOpen(open: boolean) { $sidebarOpen.set(open) }
export function setActiveView(view: AppView) { $activeView.set(view) }
export function toggleSettings() { $settingsOpen.set(!$settingsOpen.get()) }
export function closeSettings() { $settingsOpen.set(false) }
export function openSettings() { $settingsOpen.set(true) }
