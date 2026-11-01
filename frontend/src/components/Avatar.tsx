import { animalFor } from '../features/avatar/animal'

/** Кружок со зверем; зверь зависит только от ника. Размер задаёт вызывающий через className. */
export default function Avatar({ nick, className = 'h-9 w-9' }: { nick: string; className?: string }) {
  return (
    <img
      src={`/art/avatars/${animalFor(nick)}.webp`}
      alt=""
      className={`shrink-0 rounded-full border-2 border-surface bg-surface object-cover ${className}`}
    />
  )
}
