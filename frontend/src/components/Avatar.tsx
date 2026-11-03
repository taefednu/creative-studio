import { animalFor } from '../features/avatar/animal'

/** Кружок со зверем; зверь зависит только от ника. Размер задаёт вызывающий через className. */
/** Меняется, когда ребёнок выбрал другого зверька: браузер не показывает старого из кэша. */
export let avatarVersion = 0
export const bumpAvatar = () => {
  avatarVersion += 1
}

export default function Avatar({ nick, className = 'h-9 w-9' }: { nick: string; className?: string }) {
  const fallback = `/art/avatars/${animalFor(nick)}.webp`
  return (
    <img
      src={nick ? `/api/avatars/${encodeURIComponent(nick)}?v=${avatarVersion}` : fallback}
      alt=""
      onError={(e) => {
        if (e.currentTarget.getAttribute('src') !== fallback) e.currentTarget.src = fallback
      }}
      className={`shrink-0 rounded-full border-2 border-surface bg-surface object-cover ${className}`}
    />
  )
}
