import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import CreatePanel from '../components/CreatePanel'
import FeedView, { FeedSkeleton } from '../components/FeedView'
import type { ShellContext } from '../components/AppShell'
import { childKinds } from '../features/feed/feed'
import { useSmoothScroll } from '../features/smoothScroll'
import { loadTemplates } from '../features/works/works'
import { useLoad } from '../useLoad'

/** Вкладка «Лента» ребёнка: сначала общая, рядом «Мой класс» (если есть класс) и «Семья» (если есть родитель). */
export default function Feed() {
  const { cls, hasParent, ready } = useOutletContext<ShellContext>()
  useSmoothScroll()
  const [tplData] = useLoad(loadTemplates)
  const [picked, setPicked] = useState<string | null>(null)
  if (!ready) return <FeedSkeleton />
  const templates = tplData?.templates
  const tpl = (templates?.some((x) => x.id === picked) ? picked : null) ?? templates?.[0]?.id ?? null
  const kinds = childKinds(!!cls, hasParent)
  return (
    <>
      {/* child есть и до ответа стилей: иначе лента сначала рисуется другими карточками */}
      <FeedView
        key={kinds.join()}
        kinds={kinds}
        child={{ templates: templates ?? [], onStyle: setPicked }}
      />
      {templates && <CreatePanel floating templates={templates} price={tplData?.price} tpl={tpl} onTpl={setPicked} />}
    </>
  )
}
