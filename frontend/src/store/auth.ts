/**
 * Auth Store — holds the active user ID, JWT token, and manages OAuth provider states.
 */

import { atom } from 'nanostores'

// Stable default user ID for this environment
const getInitialUserId = (): string => {
  const cached = localStorage.getItem('mailing_agent_user_id')
  // Ensure the cached value is a valid-length UUID
  if (cached && cached.length >= 32) return cached
  
  return ''
}

export const $userId = atom<string>(getInitialUserId())
export const $authToken = atom<string>(localStorage.getItem('mailing_agent_auth_token') || '')
export const $googleAuthenticated = atom<boolean>(false)

export function setUserId(id: string) {
  $userId.set(id)
  localStorage.setItem('mailing_agent_user_id', id)
}

export function setAuthToken(token: string) {
  $authToken.set(token)
  localStorage.setItem('mailing_agent_auth_token', token)
  try {
    // Decode JWT to extract user_id
    const payload = JSON.parse(atob(token.split('.')[1]))
    if (payload.user_id) {
      setUserId(payload.user_id)
    }
  } catch (e) {
    console.error("Failed to decode auth token:", e)
  }
}

export function getAuthToken(): string {
  return $authToken.get() || localStorage.getItem('mailing_agent_auth_token') || ''
}

export function setGoogleAuthStatus(auth: boolean) {
  $googleAuthenticated.set(auth)
}

export function logout() {
  $authToken.set('')
  $userId.set('')
  $googleAuthenticated.set(false)
  localStorage.removeItem('mailing_agent_auth_token')
  localStorage.removeItem('mailing_agent_user_id')
}
