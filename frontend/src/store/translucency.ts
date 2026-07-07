/**
 * Window translucency (see-through window).
 * Ported from Hermes Agent's translucency.ts.
 * 0 = off (fully opaque). Higher = more desktop shows through.
 */

import { atom } from 'nanostores'

const KEY = 'mailing-agent.translucency.v1'

const clamp = (n: number): number => Math.min(100, Math.max(0, Math.round(n)))

const read = (): number => {
  const n = Number(localStorage.getItem(KEY))
  return Number.isFinite(n) ? clamp(n) : 0
}

export const $translucency = atom<number>(typeof window === 'undefined' ? 0 : read())

export function setTranslucency(intensity: number): void {
  $translucency.set(clamp(intensity))
}

if (typeof window !== 'undefined') {
  $translucency.subscribe(intensity => {
    localStorage.setItem(KEY, String(intensity))
    // IPC bridge for Electron — sets native window opacity
    ;(window as any).mailingDesktop?.setTranslucency?.({ intensity })
  })
}
