import { describe, expect, it } from 'vitest'
import en from '../../i18n/en.json'
import ru from '../../i18n/ru.json'
import uz from '../../i18n/uz.json'
import { IDEA_STEPS, IDEAS, ideaArt } from './promptIdeas'
import { existsSync } from 'node:fs'

describe('конструктор промпта', () => {
  it.each([['ru', ru], ['en', en], ['uz', uz]] as const)('%s: у каждого варианта есть своя подпись', (_, dict) => {
    for (const step of IDEA_STEPS) {
      for (const id of IDEAS[step]) expect((dict.ideas[step] as Record<string, string>)[id]).toBeTruthy()
    }
    expect(dict.ideas.phrase).toContain('{{who}}')
    expect(dict.ideas.phrase).toContain('{{where}}')
    expect(dict.ideas.phrase).toContain('{{what}}')
  })
  it('узбекский отличается от русского, а порядок слов в нём свой: сказуемое в конце, место в начале', () => {
    expect(uz.ideas.who.cat).not.toBe(ru.ideas.who.cat)
    expect(uz.ideas.phrase.startsWith('{{where}}')).toBe(true)
  })
  it('у каждого варианта есть картинка', () => {
    for (const step of IDEA_STEPS) {
      for (const { src } of ideaArt(step)) expect(existsSync(`public${src}`), src).toBe(true)
    }
  })
})
