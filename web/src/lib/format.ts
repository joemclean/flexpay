import { format, formatDistanceToNowStrict, isToday, isYesterday, parseISO } from 'date-fns'
import type { Category, Frequency, Recurrence, TransactionKind } from './types'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export function money(cents: number, opts: { signed?: boolean; whole?: boolean } = {}): string {
  const f = opts.whole && cents % 100 === 0 ? usdWhole : usd
  const formatted = f.format(Math.abs(cents) / 100)
  if (cents < 0) return `−${formatted}`
  if (opts.signed && cents > 0) return `+${formatted}`
  return formatted
}

/** "12.50" → 1250; returns null for invalid input. */
export function parseDollars(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, '')
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null
  return Math.round(Number.parseFloat(cleaned) * 100)
}

export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ''
  return (cents / 100).toFixed(2).replace(/\.00$/, '')
}

export function relativeDay(iso: string): string {
  const d = parseISO(iso)
  if (isToday(d)) return `Today, ${format(d, 'h:mm a')}`
  if (isYesterday(d)) return `Yesterday, ${format(d, 'h:mm a')}`
  return format(d, 'MMM d, h:mm a')
}

export function shortDate(iso: string): string {
  return format(parseISO(iso), 'MMM d, yyyy')
}

export function dateTime(iso: string): string {
  return format(parseISO(iso), 'EEE, MMM d · h:mm a')
}

export function fromNow(iso: string): string {
  const d = parseISO(iso)
  if (Math.abs(Date.now() - d.getTime()) < 45_000) return 'just now'
  return formatDistanceToNowStrict(d, { addSuffix: true })
}

export const KIND_LABELS: Record<TransactionKind, string> = {
  allowance: 'Allowance',
  reward: 'Chore reward',
  lesson_reward: 'Lesson reward',
  deposit: 'Deposit',
  transfer: 'Transfer',
  card_purchase: 'Card purchase',
  fee: 'Fee',
  p2p_sent: 'Sent',
  p2p_received: 'Received',
}

export const CATEGORY_LABELS: Record<Category, string> = {
  food: 'Food & drink',
  transport: 'Transport',
  entertainment: 'Entertainment',
  shopping: 'Shopping',
  games: 'Games',
  education: 'Education',
  gifts: 'Gifts & sharing',
  fees: 'Fees',
  income: 'Income',
  savings: 'Savings',
  other: 'Other',
}

export const CATEGORY_EMOJI: Record<Category, string> = {
  food: '🍕',
  transport: '🚌',
  entertainment: '🎬',
  shopping: '🛍️',
  games: '🎮',
  education: '📚',
  gifts: '🎁',
  fees: '🧾',
  income: '💵',
  savings: '🐷',
  other: '✨',
}

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  once: 'One-off',
  daily: 'Daily',
  weekly: 'Weekly',
}

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const DECLINE_LABELS: Record<string, string> = {
  card_frozen: 'Card frozen',
  insufficient_funds: 'Not enough money',
  daily_limit: 'Over daily limit',
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

export function hourLabel(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${h}:00 ${hour < 12 ? 'AM' : 'PM'}`
}

export function scheduleSummary(s: { frequency: Frequency; weekday: number | null; dayOfMonth: number | null; runHour: number }): string {
  const time = hourLabel(s.runHour)
  switch (s.frequency) {
    case 'daily':
      return `Every day at ${time}`
    case 'weekly':
      return `Every ${WEEKDAYS[s.weekday ?? 0]} at ${time}`
    case 'biweekly':
      return `Every other ${WEEKDAYS[s.weekday ?? 0]} at ${time}`
    case 'monthly':
      return `On the ${ordinal(s.dayOfMonth ?? 1)} of each month at ${time}`
  }
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
