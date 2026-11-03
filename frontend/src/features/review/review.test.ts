import { describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { agoText, effectKey, filterByClass, firstKid, nothingBlurred, parseUtc, reasonKey, reasonKeys, stackOrder, waitingByNick } from './review'

describe('review', () => {
  it('effectKey: размытая загрузка уже у ребёнка, задержанная ещё нет; у каждого ключа есть текст', () => {
    expect(effectKey({ item_type: 'upload', reason_codes: ['blurred_face', 'blurred_written_word'] })).toBe('review.effect.blurred')
    expect(effectKey({ item_type: 'upload', reason_codes: ['check_failed'] })).toBe('review.effect.upload')
    expect(effectKey({ item_type: 'upload', reason_codes: ['drawn_face'] })).toBe('review.effect.drawn_face')
    expect(effectKey({ item_type: 'upload', reason_codes: ['cleared_word'] })).toBe('review.effect.cleared_word')
    expect(effectKey({ item_type: 'post', reason_codes: ['blurred_face'] })).toBe('review.effect.post')
    for (const lang of ['ru', 'en', 'uz']) expect(i18n.exists('review.effect.blurred', { lng: lang, fallbackLng: [] })).toBe(true)
  })
  it('waitingByNick считает всё, что ждёт, по детям', () => {
    expect(waitingByNick([{ nick: 'A' }, { nick: 'B' }, { nick: 'A' }])).toEqual({ A: 2, B: 1 })
  })
  it('firstKid: первый, у кого есть что решить, иначе первый; пустой список не падает', () => {
    const kids = [{ nick: 'A' }, { nick: 'B' }, { nick: 'C' }]
    expect(firstKid(kids, { C: 1, B: 2 })?.nick).toBe('B')
    expect(firstKid(kids, {})?.nick).toBe('A')
    expect(firstKid([], { A: 1 })).toBeUndefined()
  })
  it('stackOrder: пропуск уводит верхнюю вниз по кругу, ни одна работа не теряется', () => {
    expect(stackOrder([1, 2, 3], 0)).toEqual([1, 2, 3])
    expect(stackOrder([1, 2, 3], 1)).toEqual([2, 3, 1])
    expect(stackOrder([1, 2, 3], 4)).toEqual([2, 3, 1])
    expect(stackOrder([], 3)).toEqual([])
  })
  it('unknown reason code becomes the generic text, never a raw key', () => {
    expect(reasonKey('some_new_code')).toBe('review.reasons.unknown')
    expect(reasonKey('personal_info')).toBe('review.reasons.personal_info')
    expect(reasonKeys([])).toEqual(['review.reasons.unknown'])
    expect(reasonKeys(['low_confidence', 'bullying'])).toEqual(['review.reasons.bullying'])
  })
  it('upload blur and SAM codes have their own text', () => {
    for (const c of ['blurred_face', 'blurred_house_number', 'sam_failed', 'blurred_written_word', 'drawn_face', 'cleared_word']) {
      expect(reasonKey(c)).toBe(`review.reasons.${c}`)
    }
  })
  it('one picture only when nothing was blurred', () => {
    expect(nothingBlurred(['drawn_face'])).toBe(true)
    expect(nothingBlurred(['cleared_word'])).toBe(true)
    expect(nothingBlurred(['drawn_face', 'cleared_word'])).toBe(true)
    expect(nothingBlurred(['drawn_face', 'blurred_written_word'])).toBe(false)
    expect(nothingBlurred(['blurred_face'])).toBe(false)
    expect(nothingBlurred([])).toBe(false)
  })
  it('class filter keeps only the chosen class, null keeps all', () => {
    const a = [{ class_name: '4B' }, { class_name: '5A' }, { class_name: null }]
    expect(filterByClass(a, '4B')).toEqual([{ class_name: '4B' }, { class_name: null }])
    expect(filterByClass(a, null)).toHaveLength(3)
  })
  it('urgent and class-less items survive a class filter (self-harm card must not vanish)', () => {
    const a = [
      { class_name: '4B', urgent: false },
      { class_name: null, urgent: true },
      { class_name: '5A', urgent: true },
      { class_name: '5A', urgent: false },
    ]
    expect(filterByClass(a, '4B')).toEqual([a[0], a[1], a[2]])
  })
  it('agoText speaks uz, ru plural and en without Intl (Chromium has no uz relative format)', () => {
    const now = Date.parse('2026-11-01T12:00:00Z')
    const at = (s: string) => agoText(s, i18n.getFixedT('uz'), now)
    expect(at('2026-11-01T11:55:00')).toBe('5 daqiqa oldin')
    expect(at('2026-11-01T09:00:00')).toBe('3 soat oldin')
    expect(at('2026-10-30T12:00:00')).toBe('2 kun oldin')
    expect(agoText('2026-10-30T12:00:00', i18n.getFixedT('ru'), now)).toBe('2 дня назад')
    expect(agoText('2026-10-27T12:00:00', i18n.getFixedT('ru'), now)).toBe('5 дней назад')
    expect(agoText('2026-11-01T11:59:50', i18n.getFixedT('en'), now)).toBe('just now')
  })
  it('naive server time is read as UTC', () => {
    expect(parseUtc('2026-11-01T10:00:00').toISOString()).toBe('2026-11-01T10:00:00.000Z')
  })
})
