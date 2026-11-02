import { useTranslation } from 'react-i18next'
import { api } from '../api'
import Avatar from '../components/Avatar'
import CabinetHeader from '../components/CabinetHeader'
import ReviewQueue from '../components/ReviewQueue'
import { useLoad } from '../useLoad'

type Note = { id: number; kind: string; nick: string; created_at: string; read: boolean }

const loadNotes = () => api<Note[]>('/api/parent/notifications')

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
      <main className="flex flex-col gap-4 px-4 py-4 md:px-9">
        <h1 data-testid="page-title" className="w-fit text-[30px] font-extrabold leading-9 text-heading lg:text-[54px] lg:leading-[50px]">
          {t('review.okTitle')}
        </h1>
        <ReviewQueue />
        <section data-testid="notifications" className="mt-4 rounded-card border border-border bg-surface p-4 shadow-card md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-2xl font-extrabold text-heading 2xl:text-[34px]">{t('parent.notifications')}</h2>
            {notes?.some((n) => !n.read) && (
              <button type="button" data-testid="mark-read" onClick={() => void markRead()} className="h-10 rounded-full border border-border bg-surface px-5 text-sm font-extrabold text-primary">
                {t('parent.markRead')}
              </button>
            )}
          </div>
          {notes && notes.length === 0 && <p className="mt-3 text-muted">{t('parent.noNotifications')}</p>}
          <ul className="mt-3 flex flex-col gap-2">
            {notes?.map((n) => (
              <li
                key={n.id}
                data-testid="notification"
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-base ${n.read ? 'bg-bg text-muted' : 'bg-primary-soft font-bold text-heading'}`}
              >
                <Avatar nick={n.nick} className="h-10 w-10" />
                <span className="min-w-0 flex-1">{t(`parent.notif.${n.kind}`, { nick: n.nick, defaultValue: n.kind })}</span>
                {!n.read && <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full bg-primary" />}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  )
}
