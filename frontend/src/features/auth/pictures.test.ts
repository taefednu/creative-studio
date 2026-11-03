import { describe, expect, it } from 'vitest'
import { PASSWORD_LENGTH, PICTURES, PICTURE_COUNT, shuffledPictures } from './pictures'

describe('pictures', () => {
  it('12 distinct pictures, password of 3 (1728 combinations)', () => {
    expect(PICTURE_COUNT).toBe(12)
    expect(new Set(PICTURES).size).toBe(12)
    expect(PICTURE_COUNT ** PASSWORD_LENGTH).toBe(1728)
  })
})


describe('shuffledPictures', () => {
  it('все картинки по одному разу, порядок меняется', () => {
    const a = shuffledPictures()
    expect([...a].sort((x, y) => x - y)).toEqual(Array.from({ length: PICTURE_COUNT }, (_, i) => i))
    const seen = new Set(Array.from({ length: 20 }, () => shuffledPictures().join()))
    expect(seen.size).toBeGreaterThan(1)
  })
})
