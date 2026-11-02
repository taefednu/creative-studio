export const ANIMALS = ['fox', 'bunny', 'kitten', 'panda', 'lion', 'dino', 'owl', 'cat'] as const

type Animal = (typeof ANIMALS)[number]
const WORDS: [string, Animal][] = [['fox', 'fox'], ['bunny', 'bunny'], ['rabbit', 'bunny'], ['kitten', 'kitten'], ['kit', 'kitten'], ['panda', 'panda'], ['lion', 'lion'], ['dino', 'dino'], ['owl', 'owl'], ['cat', 'cat']]

/** Зверь по нику: слово из ника (StarFox — лиса), иначе хэш. Один ник — один зверь на всех экранах. */
export function animalFor(nick: string): Animal {
  const low = nick.toLowerCase()
  let best: [number, Animal] | null = null
  for (const [w, a] of WORDS) {
    const i = low.indexOf(w)
    if (i >= 0 && (!best || i < best[0])) best = [i, a]
  }
  if (best) return best[1]
  let h = 0
  for (let i = 0; i < nick.length; i++) h = (Math.imul(h, 31) + nick.charCodeAt(i)) >>> 0
  return ANIMALS[h % ANIMALS.length]
}
