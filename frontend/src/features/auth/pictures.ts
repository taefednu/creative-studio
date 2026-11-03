/** 12 картинок-паролей: id = индекс 0..11. Единственное место, где они описаны. */
export const PICTURES = ['🐱', '🚀', '⭐', '🍎', '🦖', '🐠', '🌙', '🌸', '🚗', '⚽', '🏠', '🌈'] as const
export const PICTURE_COUNT = PICTURES.length
export const PASSWORD_LENGTH = 3

/** Порядок картинок на экране, каждый раз другой: пароль нельзя подсмотреть по месту нажатия. Сервер получает номера картинок, а не места. */
export function shuffledPictures(random: () => number = Math.random): number[] {
  const order = PICTURES.map((_, id) => id)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}
