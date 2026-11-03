import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { api } from '../api'
import { taskTitle } from '../features/assignments/assignments'
import type { TaskI18n } from '../features/assignments/assignments'
import { agoText } from '../features/review/review'
import Icon from './Icon'
import { useLoad } from '../useLoad'

type Note = {
  kind: 'task' | 'refused' | 'approved' | 'reaction' | 'comment' | 'nickapproved' | 'nickrefused' | 'avatarapproved' | 'avatarrefused'
  at: string
  unread: boolean
  link: string
  keys: string[]
  count?: number
  image_url?: string | null
  title?: string
  text_i18n?: TaskI18n
}

const loadNotes = () => api<{ items: Note[]; unread: number }>('/api/child/notifications')
const MANY = { refused: 'notes.refusedMany', approved: 'notes.approvedMany' } as const
const ICON: Partial<Record<Note['kind'], string>> = {
  refused: '/art/shield.webp',
  approved: '/art/robot-happy.webp',
  nickrefused: '/art/shield.webp',
  avatarrefused: '/art/shield.webp',
  nickapproved: '/art/robot-happy.webp',
  avatarapproved: '/art/robot-happy.webp',
}

/** Колокольчик ребёнка: что нового о его работах и заданиях. Открыл — прочитано; новое событие зажжёт снова. */
export default function NotifBell() {
  const { t, i18n } = useTranslation()
  const [data, reload] = useLoad(loadNotes)
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [readOf, setReadOf] = useState<typeof data>(null) // какой ответ сервера уже отмечен прочитанным
  const [gone, setGone] = useState<string[]>([]) // убрано тут же, не дожидаясь сервера
  const [all, setAll] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(reload, [pathname, reload])
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  useEffect(() => {
    // Закрыли: отметки прочитанного сервер уже знает, новый ответ сам зажжёт счётчик, если есть новое
    if (!open && data && readOf === data) reload()
  }, [open, data, readOf, reload])

  function clear(keys: string[]) {
    const everything = keys[0] === '*'
    if (everything) setAll(true)
    else setGone((g) => [...g, ...keys])
    void api('/api/child/notifications/clear', 'POST', { keys })
      .catch(() => {})
      .then(() => {
        reload()
        if (everything) setAll(false)
      })
  }

  function toggle() {
    if (!open && data?.unread) {
      setReadOf(data)
      void api('/api/child/notifications/read', 'POST').catch(() => {})
    }
    setOpen(!open)
  }

  const items = all ? [] : (data?.items ?? []).filter((n) => !n.keys.every((k) => gone.includes(k)))
  // Отметки в открытом списке видны, пока он открыт; счётчик гаснет сразу
  const unread = (data && readOf === data) || all ? 0 : items.filter((n) => n.unread).length
  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        data-testid="bell"
        aria-label={t('notes.title')}
        aria-expanded={open}
        onClick={toggle}
        className="relative flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-primary lg:h-11 lg:w-11"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 lg:h-6 lg:w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9a6 6 0 0 1 12 0c0 6 2.500 7 2.500 7h-17S6 15 6 9zM10 20a2.200 2.200 0 0 0 4 0" />
        </svg>
        {unread > 0 && (
          <span data-testid="bell-badge" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs font-extrabold text-primary-fg">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div data-testid="bell-list" className="modal-in fixed inset-x-2 top-[64px] z-40 max-h-[70dvh] overflow-y-auto rounded-3xl border border-border bg-surface p-2 shadow-pop md:absolute md:inset-x-auto md:right-0 md:top-full md:mt-2 md:w-[400px]">
          <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-2">
            <h2 className="min-w-0 text-lg font-black tracking-tight text-heading">{t('notes.title')}</h2>
            {items.length > 1 && (
              <button type="button" data-testid="bell-clear-all" onClick={() => clear(['*'])} className="shrink-0 rounded-full px-3 py-1 text-sm font-extrabold text-muted hover:bg-primary-soft hover:text-heading">
                {t('notes.clearAll')}
              </button>
            )}
          </div>
          {data && items.length === 0 && (
            <div data-testid="bell-empty" className="flex items-center gap-3 p-3">
              <img src="/art/robot-happy.webp" alt="" className="h-14 w-14 shrink-0 object-contain" />
              <p className="font-bold text-text">{t('notes.empty')}</p>
            </div>
          )}
          {items.map((n) => {
            const picture = n.image_url ?? ICON[n.kind]
            const many = (n.count ?? 1) > 1 && (n.kind === 'refused' || n.kind === 'approved') ? MANY[n.kind] : `notes.${n.kind}`
            return (
              <div key={n.keys[0]} className={`mt-1 flex items-center rounded-2xl pr-1 hover:bg-primary-soft ${n.unread ? 'bg-primary-soft' : ''}`}>
                <Link to={n.link} data-testid={`note-${n.kind}`} onClick={() => setOpen(false)} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-2">
                  {picture && <img src={picture} alt="" className={`h-12 w-12 shrink-0 rounded-xl ${n.image_url ? 'object-cover' : 'object-contain'}`} />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold leading-5 text-heading">
                      {t(many, { count: n.count, title: n.title ? taskTitle({ title: n.title, text_i18n: n.text_i18n }, i18n.language) : '' })}
                    </span>
                    <span className="block text-xs font-bold text-muted">{agoText(n.at, t)}</span>
                  </span>
                </Link>
                <button type="button" data-testid="note-clear" aria-label={t('notes.clear')} onClick={() => clear(n.keys)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-heading">
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
