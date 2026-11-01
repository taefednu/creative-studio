import { describe, expect, it, vi } from 'vitest'
import { dueIso, isOpen, outcome, submitTarget } from './assignments'
import type { Assignment } from './assignments'

vi.stubEnv('TZ', 'Asia/Tashkent')
process.env.TZ = 'Asia/Tashkent'

const a = (id: number, subs: { work_id: number; status: string }[] = []): Assignment => ({
  id,
  title: 't',
  description: null,
  due_at: null,
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
