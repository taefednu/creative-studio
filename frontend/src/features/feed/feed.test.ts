import { describe, expect, it } from 'vitest'
import { byStyle, cardRatio } from './feed'
import type { Post } from './feed'

const post = (id: number, template_id: string | null) => ({ id, template_id }) as Post

describe('feed', () => {
  it('byStyle: пустой стиль — все, иначе только свой template_id', () => {
    const l = [post(1, 'clay'), post(2, 'anime'), post(3, null), post(4, 'clay')]
    expect(byStyle(l, '')).toHaveLength(4)
    expect(byStyle(l, 'clay').map((p) => p.id)).toEqual([1, 4])
    expect(byStyle(l, 'paper')).toEqual([])
  })
  it('cardRatio: стабилен и даёт разные формы', () => {
    const set = new Set(Array.from({ length: 50 }, (_, i) => cardRatio(i + 1)))
    expect(set.size).toBe(5)
    expect(cardRatio(7)).toBe(cardRatio(7))
  })
})
