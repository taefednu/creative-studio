import { describe, expect, it } from 'vitest'
import en from '../../i18n/en.json'
import ru from '../../i18n/ru.json'
import uz from '../../i18n/uz.json'
import { BLURRED, filterWorks } from './works'
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
