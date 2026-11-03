import { api } from '../../api'

/** support: срочная сдача — ребёнок видит такое задание как обычное, без пометок о проверке. */
export type Submitted = { work_id: number; status: string; support?: boolean }

/** Ответ /api/child/assignments. */
export type Assignment = {
  id: number
  title: string
  description: string | null
  due_at: string | null
  cover_url: string | null
  cover_template: string | null
  submissions: Submitted[]
}

/** Кто из класса ещё не сдал: сдачей считается только принятая, задержанная ещё не дошла до учителя. */
export const notHanded = (nicks: string[], subs: { nick: string; status: string }[]) => {
  const done = new Set(subs.filter((s) => s.status === 'accepted').map((s) => s.nick))
  return nicks.filter((n) => !done.has(n))
}

export const loadAssignments = () => api<Assignment[]>('/api/child/assignments')

/** Сдача, которую ребёнок видит: не отклонённая и не срочная (срочную показываем как будто её нет). */
export const visibleSent = (a: Pick<Assignment, 'submissions'>) => a.submissions.filter((s) => s.status !== 'rejected' && !s.support)

/** Задание открыто, пока у ребёнка нет сдачи (принятой или ушедшей к учителю); отклонённую можно переделать. */
export const isOpen = (a: Pick<Assignment, 'submissions'>) => visibleSent(a).length === 0

/** Задание в строке «Создать»: заданный id не подменяем другим, без id — первое открытое. */
export const shownTask = (list: Assignment[] | null | undefined, id: number | null): Assignment | null =>
  (id ? list?.find((x) => x.id === id && isOpen(x)) : list?.find(isOpen)) ?? null

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
export function outcome(r: SubmitResult): 'support' | 'held' | 'accepted' | 'rejected' {
  if (r.support) return 'support'
  if (r.status === 'rejected') return 'rejected'
  return r.status === 'accepted' ? 'accepted' : 'held'
}

/** Ошибка сдачи -> ключ errors.*: 404 здесь про задание, а не про картинку. */
export const submitErrorCode = (code: string) => (code === 'not_found' ? 'task_not_found' : code)

/** Ошибки учителя: «validation» про пароль не годится, «показать в ленте» говорит о сдаче, а не о картинке ребёнка. */
export const taskErrorCode = (code: string) => (code === 'validation' ? 'task_invalid' : code)
export const showErrorCode = (code: string) => `show_${code}`
