import { describe, expect, it } from 'vitest'
import { weekBars } from './week'

describe('weekBars', () => {
  const now = new Date('2026-11-01T10:00:00Z')
  it('7 days ending today, empty days are 0', () => {
    const b = weekBars([], now, 'Asia/Tashkent')
    expect(b).toHaveLength(7)
    expect(b.map((x) => x.count)).toEqual([0, 0, 0, 0, 0, 0, 0])
    expect(b[6].key).toBe('2026-11-01')
  })
  it('a work made at 20:00 UTC counts for the next day in Tashkent (UTC+5)', () => {
    const b = weekBars(['2026-10-31T20:00:00', '2026-10-31T18:59:59'], now, 'Asia/Tashkent')
    expect(b.find((x) => x.key === '2026-11-01')?.count).toBe(1)
    expect(b.find((x) => x.key === '2026-10-31')?.count).toBe(1)
  })
  it('days are calendar days in New York around the DST end (Nov 1 2026)', () => {
    const b = weekBars([], new Date('2026-11-05T04:30:00Z'), 'America/New_York') // 04.11 23:30 local
    expect(b.map((x) => x.key)).toEqual(['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'])
    expect(b[6].weekday).toBe(3)
  })
  it('spring DST jump does not merge or skip days', () => {
    const b = weekBars([], new Date('2026-03-09T04:30:00Z'), 'America/New_York') // 09.03 00:30 local
    expect(b.map((x) => x.key)).toEqual(['2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09'])
  })
})
