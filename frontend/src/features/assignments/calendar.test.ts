import { describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { dateLabel, duePresets, sampleFor } from './calendar'
import { dueIso } from './assignments'

const now = new Date(2026, 10, 1, 10, 0) // воскресенье, 1 ноября

describe('подписи срока на трёх языках', () => {
  it('uz, ru, en: день недели и месяц из словаря, не из Intl', () => {
    const d = new Date(2026, 10, 8)
    expect(dateLabel(d, i18n.getFixedT('uz'))).toBe('Yak, 8 noy')
    expect(dateLabel(d, i18n.getFixedT('ru'))).toBe('Вс, 8 ноя')
    expect(dateLabel(d, i18n.getFixedT('en'))).toBe('Sun, 8 Nov')
  })
  it('пять пресетов с настоящими датами; «Без срока» уходит как null', () => {
    const p = duePresets(now, i18n.getFixedT('uz'))
    expect(p.map((x) => x.value)).toEqual(['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-08', ''])
    expect(p[1].label).toBe('Ertaga · Dush, 2 noy')
    expect(dueIso(p[4].value)).toBeNull()
    expect(dueIso(p[2].value)).toBe(new Date(2026, 10, 4, 23, 59, 59).toISOString())
  })
  it('через границу месяца', () => {
    expect(duePresets(new Date(2026, 11, 30), i18n.getFixedT('en')).map((x) => x.value)[3]).toBe('2027-01-06')
  })
})

describe('sampleFor', () => {
  const l = [{ image_url: 'a' }, { image_url: 'b' }]
  it('один id — одна картинка, пусто — null', () => {
    expect(sampleFor(3, l)).toBe('b')
    expect(sampleFor(3, l)).toBe(sampleFor(3, l))
    expect(sampleFor(4, l)).toBe('a')
    expect(sampleFor(1, [])).toBeNull()
  })
})
