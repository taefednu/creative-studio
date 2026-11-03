import { useTranslation } from 'react-i18next'
import { api } from '../api'
import { useLoad } from '../useLoad'
import Avatar from './Avatar'

type Note = { id: number; kind: string; nick: string; created_at: string; read: boolean }

const loadNotes = () => api<Note[]>('/api/parent/notifications')

/** Уведомления родителя внизу кабинета; пока их нет, блока тоже нет. */
export default function ParentNotes() {
  const { t } = useTranslation()
  const [notes, load] = useLoad(loadNotes)
  if (!notes?.length) return null
  async function markRead() {
    await api('/api/parent/notifications/read', 'POST')
    load()
  }
  return (
    <section data-testid="notifications" className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-black tracking-tight text-heading md:text-3xl">{t('parent.notifications')}</h2>
        {notes.some((n) => !n.read) && (
          <button type="button" data-testid="mark-read" onClick={() => void markRead()} className="h-10 rounded-full border border-border bg-surface px-5 text-sm font-extrabold text-primary">
            {t('parent.markRead')}
          </button>
        )}
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {notes.map((n) => (
          <li
            key={n.id}
            data-testid="notification"
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-base ${n.read ? 'bg-surface text-muted' : 'bg-primary-soft font-bold text-heading'}`}
          >
            <Avatar nick={n.nick} className="h-10 w-10" />
            <span className="min-w-0 flex-1">{t(`parent.notif.${n.kind}`, { nick: n.nick, defaultValue: n.kind })}</span>
            {!n.read && <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full bg-primary" />}
          </li>
        ))}
      </ul>
    </section>
  )
}
