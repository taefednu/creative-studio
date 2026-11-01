import { describe, expect, it } from 'vitest'
import { parseUtc, reasonKey, reasonKeys } from './review'

describe('review', () => {
  it('unknown reason code becomes the generic text, never a raw key', () => {
    expect(reasonKey('some_new_code')).toBe('review.reasons.unknown')
    expect(reasonKey('personal_info')).toBe('review.reasons.personal_info')
    expect(reasonKeys([])).toEqual(['review.reasons.unknown'])
    expect(reasonKeys(['low_confidence', 'bullying'])).toEqual(['review.reasons.bullying'])
  })
  it('naive server time is read as UTC', () => {
    expect(parseUtc('2026-11-01T10:00:00').toISOString()).toBe('2026-11-01T10:00:00.000Z')
  })
})
