import { useOutletContext } from 'react-router-dom'
import FeedView from '../components/FeedView'
import type { ShellContext } from '../components/AppShell'
import type { FeedKind } from '../features/feed/feed'

/** Вкладка «Лента» ребёнка: «Мой класс» (если есть класс), «Семья» (если есть родитель), «Лучшее». */
export default function Feed() {
  const { cls, hasParent, ready } = useOutletContext<ShellContext>()
  if (!ready) return null
  const kinds: FeedKind[] = [...(cls ? (['class'] as const) : []), ...(hasParent ? (['family'] as const) : []), 'best']
  return <FeedView key={kinds.join()} kinds={kinds} />
}
