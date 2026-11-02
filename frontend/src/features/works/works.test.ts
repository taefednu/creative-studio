import { describe, expect, it } from 'vitest'
import en from '../../i18n/en.json'
import ru from '../../i18n/ru.json'
import uz from '../../i18n/uz.json'
import { BLURRED, filterWorks, galleryOrder, styleAlbum } from './works'
import type { Work } from './works'

const w = (id: number, shared?: Work['shared']): Work => ({ id, template_id: 'clay', status: 'ready', reason_codes: [], rewrite_text: null, image_url: '/x', shared })
const list = [w(1, [{ audience: 'class', status: 'published' }]), w(2, [{ audience: 'family', status: 'waiting' }]), w(3, []), w(4)]

describe('filterWorks', () => {
  it('все, показанные, ждущие; без поля shared — нигде не показана', () => {
    expect(filterWorks(list, 'all').map((x) => x.id)).toEqual([1, 2, 3, 4])
    expect(filterWorks(list, 'shared').map((x) => x.id)).toEqual([1])
    expect(filterWorks(list, 'waiting').map((x) => x.id)).toEqual([2])
  })
})

describe('filterWorks: работа на проверке', () => {
  it('held попадает в «Ждут» даже без постов', () => {
    const held = { ...w(5), status: 'held' as const }
    expect(filterWorks([...list, held], 'waiting').map((x) => x.id)).toEqual([2, 5])
    expect(filterWorks([...list, held], 'shared').map((x) => x.id)).toEqual([1])
  })
})

describe('размытое на загрузке', () => {
  // коды из backend/app/works/upload/sam.py ENTITIES: без ключа ребёнок увидел бы «create.blurred.<код>»
  it('у каждого кода есть текст на ru, en, uz', () => {
    expect(BLURRED).toHaveLength(5)
    for (const [name, d] of Object.entries({ ru, en, uz })) {
      for (const c of BLURRED) expect((d.create.blurred as Record<string, string>)[c], `${name} ${c}`).toBeTruthy()
    }
  })
})

describe('галерея', () => {
  const work = (id: number, template_id: string, image_url: string | null) => ({ id, template_id, image_url }) as Work
  it('готовые картинки впереди, порядок внутри групп сохраняется', () => {
    const order = galleryOrder([work(3, 'a', null), work(2, 'a', '/2'), work(1, 'a', '/1')])
    expect(order.map((x) => x.id)).toEqual([2, 1, 3])
  })
  it('альбом: новейшая готовая работа стиля; без готовой работы стиль пуст', () => {
    const album = styleAlbum(
      [{ id: 'a', image_url: '/a' }, { id: 'b', image_url: '/b' }],
      [work(3, 'a', null), work(2, 'a', '/2'), work(1, 'a', '/1'), work(4, 'b', null)],
    )
    expect(album[0].work?.id).toBe(2)
    expect(album[1].work).toBeNull()
  })
})
