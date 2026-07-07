import { clsx, type ClassValue } from 'clsx'

/** Merge class names — Tailwind-safe. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs)
}
