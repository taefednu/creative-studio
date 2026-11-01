import { useTranslation } from 'react-i18next'
import { api } from '../api'
import CabinetHeader from '../components/CabinetHeader'
import ReviewQueue from '../components/ReviewQueue'
import { useLoad } from '../useLoad'

type Note = { id: number; kind: string; nick: string; created_at: string; read: boolean }

const loadNotes = () => api<Note[]>('/api/parent/notifications')
const card = 'rounded-card border border-border bg-surface p-4 shadow-card'

export default function ParentReview() {
  const { t } = useTranslation()
  const [notes, load] = useLoad(loadNotes)

  async function markRead() {
    await api('/api/parent/notifications/read', 'POST')
    load()
  }

  return (
    <div className="min-h-screen bg-bg pb-24 lg:pb-6">
      <CabinetHeader role="parent" />
      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4 md:px-7">
        <h1 data-testid="page-title" className="w-fit text-[30px] font-extrabold leading-9 text-heading lg:text-[54px] lg:leading-[50px]">
          {t('review.okTitle')}
        </h1>
        <ReviewQueue />
        <h2 className="mt-4 text-xl font-extrabold text-heading">{t('parent.notifications')}</h2>
        {notes && notes.length === 0 && <p className="text-muted">{t('parent.noNotifications')}</p>}
        {notes?.map((n) => (
          <p key={n.id} className={`${card} text-sm ${n.read ? 'text-muted' : 'font-bold text-heading'}`}>
            {t(`parent.notif.${n.kind}`, { nick: n.nick, defaultValue: n.kind })}
          </p>
        ))}
        {notes?.some((n) => !n.read) && (
          <button type="button" onClick={() => void markRead()} className="self-start text-sm font-bold text-primary underline">
            {t('parent.markRead')}
          </button>
        )}
      </main>
    </div>
  )
}
