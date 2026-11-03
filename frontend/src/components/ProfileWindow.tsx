import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { ANIMALS } from '../features/avatar/animal'
import { useLoad } from '../useLoad'
import Avatar, { bumpAvatar } from './Avatar'
import ErrorText, { errorKey } from './ErrorText'
import Icon from './Icon'
import PlatformLink from './PlatformLink'

type Profile = { nick_pending: string | null; avatar_pending: number | null; avatar_work_id: number | null; works: { id: number; image_url: string }[] }
const loadProfile = () => api<Profile>('/api/child/profile')

/** Профиль ребёнка: ник, зверёк или своя работа на аватарке, привязка Mentorium. Сверх проверки здесь ничего не решается. */
export default function ProfileWindow({ nick, needsAdult, onChanged, onClose }: { nick: string; needsAdult: boolean; onChanged: () => void; onClose: () => void }) {
  const { t } = useTranslation()
  const [data, reload] = useLoad(loadProfile)
  const [value, setValue] = useState(nick)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  async function saveNick(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    setSaved(null)
    try {
      const r = await api<{ status: 'ok' | 'held'; nick: string }>('/api/child/nick', 'POST', { nick: value })
      if (r.status === 'ok') setSaved(r.nick)
      reload()
      onChanged()
    } catch (x) {
      setErr(errorKey(x))
    } finally {
      setBusy(false)
    }
  }

  async function pick(path: string, body: object) {
    setErr(null)
    try {
      await api(path, 'POST', body)
      bumpAvatar()
      setTick((n) => n + 1)
      reload()
      onChanged()
    } catch (x) {
      setErr(errorKey(x))
    }
  }

  const heldNick = data?.nick_pending
  return createPortal(
    <div className="modal-bg fixed inset-0 z-50 flex items-end justify-center bg-scrim p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={t('profile.title')} data-testid="profile-window" className="modal-in max-h-[92dvh] w-full max-w-[480px] overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-pop sm:rounded-3xl">
        <div className="flex items-center gap-3">
          <Avatar nick={nick} className="h-14 w-14" />
          <h2 className="min-w-0 flex-1 truncate text-2xl font-black tracking-tight text-heading">{t('profile.title')}</h2>
          <button type="button" data-testid="profile-close" aria-label={t('ideas.close')} onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-primary-soft hover:text-heading">
            <Icon name="close" />
          </button>
        </div>

        <form onSubmit={(e) => void saveNick(e)} className="mt-4">
          <label htmlFor="profile-nick" className="text-sm font-extrabold text-heading">{t('profile.nick')}</label>
          <div className="mt-1 flex gap-2">
            <input id="profile-nick" data-testid="profile-nick" value={value} maxLength={20} autoComplete="off" onChange={(e) => setValue(e.target.value)} className="h-11 w-full min-w-0 rounded-full border border-border bg-surface px-4 font-extrabold text-heading outline-none focus:border-primary" />
            <button type="submit" data-testid="profile-nick-save" disabled={busy || !value.trim() || value.trim() === nick} className="h-11 shrink-0 rounded-full bg-primary px-5 text-sm font-extrabold text-primary-fg disabled:opacity-50">
              {t('profile.save')}
            </button>
          </div>
          {saved && <p data-testid="profile-nick-ok" className="mt-2 text-sm font-bold text-success">{t('profile.nickSaved', { nick: saved })}</p>}
          {heldNick && <p data-testid="profile-nick-held" className="mt-2 text-sm font-bold text-muted">{t('profile.nickHeld', { nick: heldNick })}</p>}
        </form>
        {err && <div className="mt-2"><ErrorText code={err} /></div>}

        <p className="mt-4 text-sm font-extrabold text-heading">{t('profile.animals')}</p>
        <div data-testid="avatar-picker" className="mt-2 flex gap-2 overflow-x-auto p-0.5 pb-1 [scrollbar-width:none]">
          {ANIMALS.map((a) => (
            <button key={a} type="button" data-testid={`avatar-${a}`} aria-label={`${t('mw.avatarPick')}: ${a}`} onClick={() => void pick('/api/child/avatar', { avatar: a })} className="h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-surface">
              <img src={`/art/avatars/${a}.webp`} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>

        {!needsAdult && (
          <>
            <p className="mt-4 text-sm font-extrabold text-heading">{t('profile.own')}</p>
            <p className="text-xs font-bold text-muted">{t('profile.ownHint')}</p>
            {data && data.works.length === 0 && <p data-testid="profile-no-works" className="mt-2 text-sm font-bold text-text">{t('profile.noWorks')}</p>}
            <div data-testid="profile-works" className="mt-2 flex gap-2 overflow-x-auto p-1 [scrollbar-width:none]">
              {data?.works.map((w) => {
                const waiting = data.avatar_pending === w.id
                const current = data.avatar_work_id === w.id
                return (
                  <button key={w.id} type="button" data-testid={`profile-work-${w.id}`} disabled={data.avatar_pending !== null || current} aria-pressed={current} onClick={() => void pick('/api/child/avatar-work', { work_id: w.id })} className={`h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 disabled:cursor-default ${waiting || current ? 'border-primary' : 'border-surface'} ${data.avatar_pending !== null && !waiting ? 'opacity-50' : ''}`}>
                    <img src={w.image_url} alt="" className="h-full w-full object-cover" />
                  </button>
                )
              })}
            </div>
            {data?.avatar_pending != null && <p data-testid="profile-avatar-held" className="mt-1 text-sm font-bold text-muted">{t('profile.ownWaiting')}</p>}
            <Link to="/create" data-testid="profile-draw" onClick={onClose} className="mt-2 inline-flex h-10 items-center rounded-full border border-border bg-surface px-4 text-sm font-extrabold text-heading">
              {t('profile.draw')}
            </Link>
          </>
        )}

        <div className="mt-4 empty:hidden"><PlatformLink note="childNote" /></div>
      </div>
    </div>,
    document.body,
  )
}
