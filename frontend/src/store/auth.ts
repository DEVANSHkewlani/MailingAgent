/**
 * Auth Store — holds the active user ID and manages OAuth provider states.
 */

import { atom } from 'nanostores'

// Stable default user ID for this environment
const getInitialUserId = (): string => {
  const cached = localStorage.getItem('mailing_agent_user_id')
  // Ensure the cached value is a valid-length UUID
  if (cached && cached.length >= 32) return cached
  
  // Generate a unique random UUID for this session
  let newId: string
  try {
    newId = crypto.randomUUID()
  } catch (e) {
    newId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }
  localStorage.setItem('mailing_agent_user_id', newId)
  return newId
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
