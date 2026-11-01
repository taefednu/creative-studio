import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api } from '../api'
import CabinetHeader from '../components/CabinetHeader'
import Coin from '../components/Coin'
import ErrorText, { errorKey } from '../components/ErrorText'
import PictureGrid from '../components/PictureGrid'
import QrBox from '../components/QrBox'
import ReviewQueue from '../components/ReviewQueue'
import { PASSWORD_LENGTH } from '../features/auth/pictures'
import { useLoad } from '../useLoad'

type Kid = { id: number; nick: string; age_group: string; lang: string; coins: number | null; locked: boolean }
type Note = { id: number; kind: string; nick: string; created_at: string; read: boolean }

const loadAll = async () => {
  const [kids, notes] = await Promise.all([
    api<Kid[]>('/api/parent/children'),
    api<Note[]>('/api/parent/notifications'),
  ])
  return { kids, notes }
}

const input =
  'w-full rounded-2xl border border-border bg-surface px-4 py-2 font-bold text-heading outline-none focus:border-primary'
const label = 'mb-1 block text-xs font-extrabold uppercase text-primary'
const card = 'rounded-card border border-border bg-surface p-4 shadow-card'

export default function ParentCabinet() {
  const { t } = useTranslation()
  const [data, load] = useLoad(loadAll)
  const kids = data?.kids ?? null
  const notes = data?.notes ?? []
  const [qr, setQr] = useState<{ id: number; nick: string; token: string } | null>(null)
  const [nick, setNick] = useState('')
  const [age, setAge] = useState('5-8')
  const [lang, setLang] = useState('ru')
  const [pics, setPics] = useState<number[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function addKid(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await api('/api/parent/children', 'POST', { nick, age_group: age, lang, pictures: pics })
      setNick('')
      setPics([])
      load()
    } catch (x) {
      setErr(errorKey(x))
    } finally {
      setBusy(false)
    }
  }

  async function showQr(k: Kid) {
    const r = await api<{ token: string }>(`/api/parent/children/${k.id}/qr`, 'POST')
    setQr({ id: k.id, nick: k.nick, token: r.token })
  }

  async function markRead() {
    await api('/api/parent/notifications/read', 'POST')
    load()
  }

  return (
    <div className="min-h-screen bg-bg">
      <CabinetHeader title={t('parent.title')} />
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6 md:grid-cols-2 md:px-8">
        <div className="md:col-span-2">
          <ReviewQueue title={t('review.okTitle')} />
        </div>
        <section className="flex flex-col gap-3" data-testid="kids">
          <h2 className="text-xl font-extrabold text-heading">{t('parent.children')}</h2>
          {kids && kids.length === 0 && <p className="text-muted">{t('parent.noChildren')}</p>}
          {kids?.map((k) => (
            <div key={k.id} className={card} data-testid={`kid-${k.nick}`}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-lg font-extrabold text-heading">{k.nick}</span>
                <span className="text-sm text-muted">{k.age_group}</span>
                <span className="ml-auto flex items-center gap-1 font-extrabold text-heading" data-testid="kid-coins">
                  <Coin />
                  {k.coins ?? '—'}
                </span>
              </div>
              {k.locked && <p className="mt-2 text-sm font-bold text-danger">{t('parent.locked')}</p>}
              <button
                type="button"
                data-testid={`qr-${k.nick}`}
                onClick={() => void showQr(k)}
                className="mt-3 rounded-full bg-primary-soft px-4 py-2 text-sm font-extrabold text-primary"
              >
                {t('parent.qrButton')}
              </button>
              {qr?.id === k.id && <QrBox token={qr.token} nick={qr.nick} />}
            </div>
          ))}

          <Link
            to="/parent/feed"
            data-testid="family-feed-link"
            className="self-start rounded-full bg-primary px-5 py-2 text-sm font-extrabold text-primary-fg"
          >
            {t('feed.familyFeed')}
          </Link>
          <h2 className="mt-4 text-xl font-extrabold text-heading">{t('parent.notifications')}</h2>
          {notes.length === 0 && <p className="text-muted">{t('parent.noNotifications')}</p>}
          {notes.map((n) => (
            <p key={n.id} className={`${card} text-sm ${n.read ? 'text-muted' : 'font-bold text-heading'}`}>
              {t(`parent.notif.${n.kind}`, { nick: n.nick, defaultValue: n.kind })}
            </p>
          ))}
          {notes.some((n) => !n.read) && (
            <button type="button" onClick={() => void markRead()} className="self-start text-sm font-bold text-primary underline">
              {t('parent.markRead')}
            </button>
          )}
        </section>

        <section>
          <form onSubmit={(e) => void addKid(e)} className={`${card} flex flex-col gap-4`} data-testid="add-kid">
            <h2 className="text-xl font-extrabold text-heading">{t('parent.addChild')}</h2>
            <div>
              <label htmlFor="kid-nick" className={label}>
                {t('auth.nick')}
              </label>
              <input
                id="kid-nick"
                data-testid="kid-nick"
                className={input}
                value={nick}
                maxLength={20}
                autoComplete="off"
                onChange={(e) => setNick(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted">{t('parent.nickHint')}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="kid-age" className={label}>
                  {t('parent.age')}
                </label>
                <select id="kid-age" data-testid="kid-age" className={input} value={age} onChange={(e) => setAge(e.target.value)}>
                  <option value="5-8">5–8</option>
                  <option value="9-12">9–12</option>
                </select>
              </div>
              <div>
                <label htmlFor="kid-lang" className={label}>
                  {t('parent.lang')}
                </label>
                <select id="kid-lang" data-testid="kid-lang" className={input} value={lang} onChange={(e) => setLang(e.target.value)}>
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                  <option value="uz">Oʻzbekcha</option>
                </select>
              </div>
            </div>
            <div>
              <span className={label}>{t('auth.picturePassword')}</span>
              <PictureGrid value={pics} onChange={setPics} />
            </div>
            <ErrorText code={err} />
            <button
              type="submit"
              data-testid="kid-submit"
              disabled={busy || nick.trim().length < 2 || pics.length !== PASSWORD_LENGTH}
              className="rounded-full bg-primary px-6 py-3 font-extrabold uppercase text-primary-fg disabled:opacity-50"
            >
              {t('parent.create')}
            </button>
          </form>
        </section>
      </main>
    </div>
  )
}
