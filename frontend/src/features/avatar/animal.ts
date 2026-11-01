export const ANIMALS = ['fox', 'bunny', 'kitten', 'panda', 'lion', 'dino', 'owl', 'cat'] as const

/** Зверь по нику: один ник — один зверь на всех экранах. */
export function animalFor(nick: string): (typeof ANIMALS)[number] {
  let h = 0
  for (let i = 0; i < nick.length; i++) h = (Math.imul(h, 31) + nick.charCodeAt(i)) >>> 0
  return ANIMALS[h % ANIMALS.length]
}
