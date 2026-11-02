import { describe, expect, it } from 'vitest'
import { byStyle, cardRatio, createdLabel, drawSameKind, toColumns } from './feed'
import type { Post } from './feed'

const post = (id: number, template_id: string | null) => ({ id, template_id }) as Post

describe('feed', () => {
  it('byStyle: пустой стиль — все, иначе только свой template_id', () => {
    const l = [post(1, 'clay'), post(2, 'anime'), post(3, null), post(4, 'clay')]
    expect(byStyle(l, '')).toHaveLength(4)
    expect(byStyle(l, 'clay').map((p) => p.id)).toEqual([1, 4])
    expect(byStyle(l, 'paper')).toEqual([])
  })
  it('toColumns: дозагрузка не двигает показанные, все карточки на месте', () => {
    const items = Array.from({ length: 40 }, (_, i) => post(i + 1, null))
    const before = toColumns(items.slice(0, 20), 6)
    const after = toColumns(items, 6)
    before.forEach((col, c) => expect(after[c].slice(0, col.length)).toEqual(col))
    expect(after.flat().length).toBe(40)
    const lens = after.map((col) => col.length)
    expect(Math.max(...lens) - Math.min(...lens)).toBeLessThanOrEqual(3)
  })
  it('cardRatio: стабилен и даёт разные формы', () => {
    const set = new Set(Array.from({ length: 50 }, (_, i) => cardRatio(i + 1)))
    expect(set.size).toBe(7)
    expect(cardRatio(7)).toBe(cardRatio(7))
  })
  it('createdLabel: сегодня, вчера, иначе дата; наивное UTC читается как UTC', () => {
    const now = new Date(2026, 10, 1, 12, 0)
    const at = (d: Date) => d.toISOString().replace('Z', '')
    expect(createdLabel(at(new Date(2026, 10, 1, 9, 0)), now)).toBe('today')
    expect(createdLabel(at(new Date(2026, 9, 31, 20, 0)), now)).toBe('yesterday')
    expect(createdLabel(at(new Date(2026, 9, 5, 12, 0)), now)).toBe('05.10.2026')
  })
  it('drawSameKind: ремикс, переключатель автору, иначе ссылка на стиль', () => {
    const k = (can_remix: boolean, is_author: boolean, template_id: string | null) => drawSameKind({ can_remix, is_author, template_id })
    expect(k(true, false, 'clay')).toBe('remix')
    expect(k(false, true, 'clay')).toBe('allow')
    expect(k(false, false, 'clay')).toBe('link')
    expect(k(false, false, null)).toBeNull()
    expect(k(false, false, 'remix')).toBeNull()
    expect(k(false, false, 'upload')).toBeNull()
    expect(drawSameKind({ can_remix: true, is_author: false, template_id: 'clay' }, false)).toBeNull()
  })
})
