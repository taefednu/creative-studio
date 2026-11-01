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

/** Ключ i18n и число для подписи остатка: одни и те же слова в строке задания, карточке ребёнка и списке учителя. */
export function dueLabel(dueAt: string | null, now: Date = new Date()): { key: string; count?: number } | null {
  const left = remaining(dueAt, now)
  if (left === null) return null
  if (left === 'overdue') return { key: 'task.overdue' }
  return left === 0 ? { key: 'task.today' } : { key: 'task.left', count: left }
}
