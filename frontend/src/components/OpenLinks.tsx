import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import { useLoad } from '../useLoad'

type OpenLink = { work_id: number; nick: string; path: string; image_url: string }

/** Работы, открытые всем: взрослый видит их и может выключить. Пока таких нет, блока нет. */
export default function OpenLinks({ role }: { role: 'parent' | 'teacher' }) {
  const { t } = useTranslation()
  const load = useCallback(() => api<OpenLink[]>(`/api/${role}/shares`), [role])
  const [links, reload] = useLoad(load)
  if (!links?.length) return null
  return (
    <section data-testid="open-links" className="mt-8">
      <h2 className="text-2xl font-black tracking-tight text-heading md:text-3xl">{t('cab.links.title')}</h2>
      <p className="mt-1 text-sm font-bold text-muted">{t('cab.links.note')}</p>
      <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-3">
        {links.map((l) => (
          <li key={l.work_id} data-testid="open-link" className="flex items-center gap-3 rounded-2xl bg-surface p-2 pr-3 shadow-card">
            <a href={l.path} target="_blank" rel="noreferrer" className="shrink-0">
              <img src={l.image_url} alt="" className="h-16 w-16 rounded-xl object-cover" />
            </a>
            <span className="min-w-0 flex-1 truncate font-extrabold text-heading">{l.nick}</span>
            <button
              type="button"
              data-testid="open-link-stop"
              onClick={() => void api(`/api/works/${l.work_id}/share`, 'DELETE').then(reload)}
              className="h-10 shrink-0 rounded-full border border-border bg-surface px-4 text-sm font-extrabold text-heading"
            >
              {t('publish.share.stop')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
