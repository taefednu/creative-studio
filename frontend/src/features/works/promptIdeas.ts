/** Варианты конструктора «Помоги придумать». Подписи — i18n ideas.<шаг>.<id>, картинки — public/art/prompt. */
export const IDEA_STEPS = ['who', 'where', 'what'] as const
export type IdeaStep = (typeof IDEA_STEPS)[number]

export const IDEAS: Record<IdeaStep, string[]> = {
  who: ['cat', 'dragon', 'robot', 'puppy', 'bunny', 'penguin', 'dino', 'fox'],
  where: ['moon', 'castle', 'forest', 'sea', 'clouds', 'space', 'candy', 'samarkand'],
  what: ['watermelon', 'fly', 'dance', 'paint', 'bake', 'sing', 'ball', 'swim'],
}

export function ideaArt(step: IdeaStep) {
  return IDEAS[step].map((id) => ({ id, src: `/art/prompt/${step}-${id}.webp` }))
}
