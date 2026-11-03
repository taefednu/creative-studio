import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import CreatePanel from '../components/CreatePanel'
import FeedView from '../components/FeedView'
import type { ShellContext } from '../components/AppShell'
import type { FeedKind } from '../features/feed/feed'
import { loadTemplates } from '../features/works/works'
import { useLoad } from '../useLoad'

/** Вкладка «Лента» ребёнка: «Мой класс» (если есть класс), «Семья» (если есть родитель), «Лучшее». */
export default function Feed() {
  const { cls, hasParent, ready } = useOutletContext<ShellContext>()
  const [tplData] = useLoad(loadTemplates)
  const [picked, setPicked] = useState<string | null>(null)
  if (!ready) return null
  const templates = tplData?.templates
  const tpl = (templates?.some((x) => x.id === picked) ? picked : null) ?? templates?.[0]?.id ?? null
  const kinds: FeedKind[] = [...(cls ? (['class'] as const) : []), ...(hasParent ? (['family'] as const) : []), 'best']
  return (
    <>
      <FeedView
        key={kinds.join()}
        kinds={kinds}
        child={templates ? { templates, onStyle: setPicked } : undefined}
      />
      {templates && <CreatePanel floating templates={templates} price={tplData?.price} tpl={tpl} onTpl={setPicked} />}
    </>
  )
}
