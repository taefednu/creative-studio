import { describe, expect, it } from 'vitest'
import { ANIMALS, animalFor } from './animal'

describe('animalFor', () => {
  it('стабилен для одного ника и всегда из набора', () => {
    for (const n of ['SkyFox1', 'MoonCat', 'Лиса', '', 'x'.repeat(500)]) {
      expect(animalFor(n)).toBe(animalFor(n))
      expect(ANIMALS).toContain(animalFor(n))
    }
  })
  it('разные ники дают не одного и того же зверя', () => {
    const seen = new Set(Array.from({ length: 200 }, (_, i) => animalFor(`kid${i}`)))
    expect(seen.size).toBe(ANIMALS.length)
  })
  it('слово в нике решает: зверь по смыслу', () => {
    const want = { StarFox: 'fox', PixelPanda: 'panda', MoonCat: 'cat', DinoDash: 'dino', LimeLion: 'lion', Bunny: 'bunny', MiloOwl: 'owl', ARABBIT: 'bunny', kit7: 'kitten' }
    for (const [n, a] of Object.entries(want)) expect(animalFor(n), n).toBe(a)
  })
  it('без слова — хэш, тот же что раньше', () => {
    expect(animalFor('Zed')).toBe(animalFor('Zed'))
    expect(animalFor('Zed')).toBeTruthy()
  })
})
