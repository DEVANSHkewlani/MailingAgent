/**
 * Auth Store — holds the active user ID and manages OAuth provider states.
 */

import { atom } from 'nanostores'

// Stable default user ID for this environment
const DEFAULT_USER_ID = 'eb7033ad-9229-435a-b7e0-226dc910c0b8'

const getInitialUserId = (): string => {
  const cached = localStorage.getItem('mailing_agent_user_id')
  // Ensure the cached value is a valid-length UUID
  if (cached && cached.length >= 32) return cached
  return DEFAULT_USER_ID
}

export const $userId = atom<string>(getInitialUserId())
export const $googleAuthenticated = atom<boolean>(false)

export function setUserId(id: string) {
  $userId.set(id)
  localStorage.setItem('mailing_agent_user_id', id)
}

export function setGoogleAuthStatus(auth: boolean) {
  $googleAuthenticated.set(auth)
}
