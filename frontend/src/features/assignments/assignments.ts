import { api } from '../../api'

export type Submitted = { work_id: number; status: string }

/** Ответ /api/child/assignments. */
export type Assignment = {
  id: number
  title: string
  description: string | null
  due_at: string | null
  submissions: Submitted[]
}

export const loadAssignments = () => api<Assignment[]>('/api/child/assignments')

/** Задание открыто, пока у ребёнка нет сдачи (принятой или ушедшей к учителю); отклонённую можно переделать. */
export const isOpen = (a: Pick<Assignment, 'submissions'>) => !a.submissions.some((s) => s.status !== 'rejected')

/** Для какого задания показывать «Сдать»: id из ссылки должен быть среди открытых заданий, иначе кнопки нет. */
export function submitTarget(list: Assignment[] | null, id: number | null): Assignment | null {
  if (!list || !id) return null
  const a = list.find((x) => x.id === id)
  return a && isOpen(a) ? a : null
}

/** Срок «до конца дня» по местному времени -> ISO UTC для API. Пусто или не дата — null (срока нет). */
export function dueIso(day: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 0)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export type SubmitResult = { id: number; status: string; support: boolean }

/** Что показать после сдачи. support — только тёплый ответ, раньше остального. */
export function outcome(r: SubmitResult): 'support' | 'held' | 'accepted' {
  if (r.support) return 'support'
  return r.status === 'accepted' ? 'accepted' : 'held'
}

/** Ошибка сдачи -> ключ errors.*: 404 здесь про задание, а не про картинку. */
export const submitErrorCode = (code: string) => (code === 'not_found' ? 'task_not_found' : code)

/** Ошибки учителя: «validation» про пароль не годится, «показать в ленте» говорит о сдаче, а не о картинке ребёнка. */
export const taskErrorCode = (code: string) => (code === 'validation' ? 'task_invalid' : code)
export const showErrorCode = (code: string) => `show_${code}`
