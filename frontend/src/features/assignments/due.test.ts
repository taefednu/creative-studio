import { describe, expect, it, vi } from 'vitest'
import { dueLabel, remaining } from './due'

// пояс не UTC: иначе чтение наивной строки как местного времени не отличить от UTC
vi.stubEnv('TZ', 'Asia/Tashkent')
process.env.TZ = 'Asia/Tashkent'

const now = new Date(2026, 10, 1, 10, 0) // местное 1 ноября 10:00

describe('remaining', () => {
  it('сегодня позже, завтра, просрочено, нет срока', () => {
    expect(remaining(new Date(2026, 10, 1, 18, 0).toISOString(), now)).toBe(0)
    expect(remaining(new Date(2026, 10, 2, 9, 0).toISOString(), now)).toBe(1)
    expect(remaining(new Date(2026, 10, 1, 9, 0).toISOString(), now)).toBe('overdue')
    expect(remaining(null, now)).toBeNull()
    // два часа до срока, но через полночь: календарно это завтра
    expect(remaining(new Date(2026, 10, 2, 1, 0).toISOString(), new Date(2026, 10, 1, 23, 0))).toBe(1)
  })
  it('наивная строка сервера читается как UTC, а не как местное время', () => {
    const naive = '2026-11-03T12:00:00'
    const at = new Date('2026-11-01T12:00:00Z')
    expect(remaining(naive, at)).toBe(remaining(`${naive}Z`, at))
    expect(remaining('2026-11-01T13:00:00', at)).toBe(0)
  })
})

describe('dueLabel', () => {
  it('те же ключи, что у строки задания', () => {
    expect(dueLabel(null, now)).toBeNull()
    expect(dueLabel(new Date(2026, 10, 1, 9, 0).toISOString(), now)).toEqual({ key: 'task.overdue' })
    expect(dueLabel(new Date(2026, 10, 1, 18, 0).toISOString(), now)).toEqual({ key: 'task.today' })
    expect(dueLabel(new Date(2026, 10, 4, 9, 0).toISOString(), now)).toEqual({ key: 'task.left', count: 3 })
  })
})
