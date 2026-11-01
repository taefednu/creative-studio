import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import CabinetHeader from '../components/CabinetHeader'
import FeedView from '../components/FeedView'

/** Лента для взрослых: учитель — «Лента класса» (:classId), родитель — «Семейная лента». */
export default function AdultFeed({ who }: { who: 'teacher' | 'parent' }) {
  const { t } = useTranslation()
  const { classId } = useParams()
  return (
    <div className="min-h-screen bg-bg pb-24 lg:pb-6">
      <CabinetHeader role={who} />
      <main className="mx-auto max-w-[1672px] px-4 py-4 md:px-8">
        <Link to={`/${who}`} data-testid="back" className="mb-3 inline-block text-sm font-bold text-primary underline">
          {t('feed.back')}
        </Link>
        {who === 'teacher' ? (
          <FeedView kinds={['class']} classId={Number(classId)} />
        ) : (
          <FeedView kinds={['family']} title={t('feed.title.family')} />
        )}
      </main>
    </div>
  )
}
