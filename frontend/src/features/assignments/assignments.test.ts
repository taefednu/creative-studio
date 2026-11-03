import { describe, expect, it, vi } from 'vitest'
import { dueIso, isOpen, outcome, shownTask, submitTarget, visibleSent, notHanded, taskDescription, taskTitle } from './assignments'
import type { Assignment } from './assignments'

vi.stubEnv('TZ', 'Asia/Tashkent')
process.env.TZ = 'Asia/Tashkent'

const a = (id: number, subs: Assignment['submissions'] = []): Assignment => ({
  id,
  title: 't',
  description: null,
  due_at: null, cover_url: null, cover_template: null,
  submissions: subs,
})

describe('dueIso', () => {
  it('конец местного дня -> UTC (Ташкент UTC+5)', () => {
    expect(dueIso('2026-11-05')).toBe('2026-11-05T18:59:59.000Z')
  })
  it('пусто и мусор — срока нет', () => {
    expect(dueIso('')).toBeNull()
    expect(dueIso('05.11.2026')).toBeNull()
  })
})

describe('кнопка «Сдать»', () => {
  const list = [a(1), a(2, [{ work_id: 9, status: 'accepted' }]), a(3, [{ work_id: 8, status: 'rejected' }])]
  it('есть только для открытого задания из ссылки', () => {
    expect(submitTarget(list, 1)?.id).toBe(1)
    expect(submitTarget(list, 3)?.id).toBe(3)
    expect(submitTarget(list, 2)).toBeNull()
    expect(submitTarget(list, 99)).toBeNull()
    expect(submitTarget(list, null)).toBeNull()
    expect(submitTarget(null, 1)).toBeNull()
  })
  it('сдача на проверке тоже закрывает задание', () => {
    expect(isOpen(a(4, [{ work_id: 1, status: 'held' }]))).toBe(false)
  })
})

describe('outcome', () => {
  it('support важнее статуса', () => {
    expect(outcome({ id: 1, status: 'held', support: true })).toBe('support')
    expect(outcome({ id: 1, status: 'held', support: false })).toBe('held')
    expect(outcome({ id: 1, status: 'accepted', support: false })).toBe('accepted')
  })
})

describe('срочная и отклонённая сдача', () => {
  const urgent = a(7, [{ work_id: 1, status: 'held', support: true }])
  it('срочная сдача не видна и не закрывает задание', () => {
    expect(visibleSent(urgent)).toEqual([])
    expect(isOpen(urgent)).toBe(true)
  })
  it('обычная сдача на проверке по-прежнему видна', () => {
    expect(visibleSent(a(8, [{ work_id: 1, status: 'held', support: false }]))).toHaveLength(1)
  })
  it('rejected в ответе сдачи — отдельный исход', () => {
    expect(outcome({ id: 1, status: 'rejected', support: false })).toBe('rejected')
  })
})

describe('строка задания', () => {
  const list = [a(1, [{ work_id: 9, status: 'accepted' }]), a(2), a(3)]
  it('без id — первое открытое; с id — именно оно, без подмены', () => {
    expect(shownTask(list, null)?.id).toBe(2)
    expect(shownTask(list, 3)?.id).toBe(3)
    expect(shownTask(list, 1)).toBeNull()
    expect(shownTask(null, null)).toBeNull()
  })
})

describe('notHanded', () => {
  it('сдачей считается только принятая работа, порядок класса сохраняется', () => {
    const subs = [{ nick: 'Bo', status: 'accepted' }, { nick: 'Cy', status: 'held' }]
    expect(notHanded(['Al', 'Bo', 'Cy'], subs)).toEqual(['Al', 'Cy'])
    expect(notHanded([], subs)).toEqual([])
  })
})

describe('текст задания', () => {
  const task = { title: 'Кот', description: 'Нарисуй', text_i18n: { en: { title: 'Cat', description: 'Draw' } } }
  it('на языке интерфейса, без перевода как написал учитель', () => {
    expect(taskTitle(task, 'en')).toBe('Cat')
    expect(taskDescription(task, 'en')).toBe('Draw')
    expect(taskTitle(task, 'uz')).toBe('Кот')
    expect(taskTitle({ title: 'Кот', text_i18n: null }, 'en')).toBe('Кот')
  })
})
