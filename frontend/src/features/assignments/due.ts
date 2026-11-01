import { parseUtc } from '../review/review'

const dayStart = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())

/** Остаток до срока по местным календарным суткам: null — срока нет, 'overdue' — срок прошёл, 0 — сегодня. */
export function remaining(dueAt: string | null, now: Date = new Date()): number | 'overdue' | null {
  if (!dueAt) return null
  const due = parseUtc(dueAt)
  if (Number.isNaN(due.getTime())) return null
  if (due.getTime() < now.getTime()) return 'overdue'
  return Math.round((dayStart(due) - dayStart(now)) / 86_400_000)
}
