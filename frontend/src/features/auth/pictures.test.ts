import { describe, expect, it } from 'vitest'
import { PASSWORD_LENGTH, PICTURES, PICTURE_COUNT } from './pictures'

describe('pictures', () => {
  it('12 distinct pictures, password of 3 (1728 combinations)', () => {
    expect(PICTURE_COUNT).toBe(12)
    expect(new Set(PICTURES).size).toBe(12)
    expect(PICTURE_COUNT ** PASSWORD_LENGTH).toBe(1728)
  })
})
