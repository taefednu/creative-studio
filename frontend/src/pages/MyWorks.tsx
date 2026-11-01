import { useTranslation } from 'react-i18next'
import { api } from '../api'
import type { Work } from '../features/works/works'
import { useLoad } from '../useLoad'

const loadWorks = () => api<Work[]>('/api/works/mine')

export default function MyWorks() {
  const { t } = useTranslation()
  const [works] = useLoad(loadWorks)
  return (
    <div>
      <h1 className="text-3xl font-extrabold text-heading">{t('myWorks.title')}</h1>
      {works && works.length === 0 && (
        <p data-testid="works-empty" className="mt-4 text-text">
          {t('myWorks.empty')}
        </p>
      )}
      <div data-testid="works-grid" className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
        {works?.map((w) => (
          <div
            key={w.id}
            data-testid="work-card"
            className="overflow-hidden rounded-card border border-border bg-surface shadow-card"
          >
            {w.image_url ? (
              <img src={w.image_url} alt={t(`templates.${w.template_id}`)} className="aspect-square w-full object-cover" />
            ) : (
              <div className="flex aspect-square items-center justify-center bg-primary-soft p-3 text-center font-extrabold text-heading">
                {t(`myWorks.status.${w.status}`)}
              </div>
            )}
            <p className="px-3 py-2 text-sm font-extrabold text-heading">{t(`templates.${w.template_id}`)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
