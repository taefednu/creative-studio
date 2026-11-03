import { describe, expect, it } from 'vitest'
import { allRow, postRow } from './publish'

describe('Кому показать', () => {
  it('строка аудитории помнит, что уже показано и что ждёт взрослого', () => {
    const posts = [{ audience: 'class', status: 'published' as const }, { audience: 'family', status: 'waiting' as const }]
    expect(postRow(posts, 'class')).toBe('done')
    expect(postRow(posts, 'family')).toBe('waiting')
    expect(postRow([], 'class')).toBe('free')
  })
  it('«Всем»: отказ взрослого не обойти, выключенную ссылку можно попросить снова', () => {
    expect(allRow('none')).toBe('free')
    expect(allRow('off')).toBe('free')
    expect(allRow('waiting')).toBe('waiting')
    expect(allRow('live')).toBe('done')
    expect(allRow('refused')).toBe('refused')
  })
})
