import { describe, expect, it } from 'vitest'
import { filterWorks } from './works'
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
