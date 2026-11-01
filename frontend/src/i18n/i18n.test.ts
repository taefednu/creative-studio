import { describe, expect, it } from 'vitest'
import en from './en.json'
import ru from './ru.json'
import uz from './uz.json'

type Tree = { [k: string]: string | Tree }
function flat(o: Tree, p = ''): Record<string, string> {
  return Object.entries(o).reduce<Record<string, string>>((acc, [k, v]) => {
    if (typeof v === 'string') acc[p + k] = v
    else Object.assign(acc, flat(v, `${p}${k}.`))
    return acc
  }, {})
}

describe('i18n', () => {
  const langs = { ru: flat(ru), en: flat(en), uz: flat(uz) }
  const all = new Set(Object.values(langs).flatMap((l) => Object.keys(l)))

  for (const [name, dict] of Object.entries(langs)) {
    it(`${name}: every key present and non-empty`, () => {
      for (const key of all) {
        expect(dict[key], `${name} missing ${key}`).toBeTruthy()
        expect(dict[key].trim(), `${name} empty ${key}`).not.toBe('')
      }
    })
  }
})
