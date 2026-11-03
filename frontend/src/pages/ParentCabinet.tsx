import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api } from '../api'
import Avatar from '../components/Avatar'
import CabinetHeader from '../components/CabinetHeader'
import ChipSelect from '../components/ChipSelect'
import ErrorText, { errorKey } from '../components/ErrorText'
import Icon from '../components/Icon'
import LinkCard from '../components/LinkCard'
import PictureGrid from '../components/PictureGrid'
import QrBox from '../components/QrBox'
import OpenLinks from '../components/OpenLinks'
import ParentNotes from '../components/ParentNotes'
import ReviewQueue from '../components/ReviewQueue'
import WeekChart from '../components/WeekChart'
import { notifyCabinet } from '../features/review/review'
import { weekBars } from '../features/review/week'
import { levelOf } from '../features/works/works'
import { PASSWORD_LENGTH } from '../features/auth/pictures'
import { useLoad } from '../useLoad'

type Kid = {
  id: number
  nick: string
  age_group: string
  class_name: string | null
  lang: string
  coins: number | null
  locked: boolean
}
type Analytics = {
  has_data: boolean
  pictures_total: number
  created: number | null
  ready_at: string[]
  published: number | null
  held: number | null
  coins_received: number | null
  coins_earned_lessons: number | null
  coins_uncertain: number
  coins_spent: number | null
}
type FamilyPost = { id: number; nick: string; image_url: string }

const loadKids = () => api<Kid[]>('/api/parent/children')
const loadFamily = () => api<{ items: FamilyPost[] }>('/api/feed/family?limit=40')

const input =
  'w-full rounded-2xl border border-border bg-surface px-4 py-2 font-bold text-heading outline-none focus:border-primary'
const label = 'mb-1 block text-xs font-extrabold uppercase text-primary'
const card = 'rounded-card border border-border bg-surface p-4 shadow-card'
const dash = (v: number | null | undefined) => v ?? '—'

/** Форма добавления ребёнка в окне поверх кабинета (затемнение — токен scrim). */
function AddKidModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const { t } = useTranslation()
  const [nick, setNick] = useState('')
  const [age, setAge] = useState('5-8')
  const [lang, setLang] = useState('ru')
  const [pics, setPics] = useState<number[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [busy, onClose])

  async function addKid(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await api('/api/parent/children', 'POST', { nick, age_group: age, lang, pictures: pics })
      onAdded()
      notifyCabinet()
      onClose()
    } catch (x) {
      setErr(errorKey(x))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-scrim p-4 backdrop-blur-sm" data-testid="add-kid-modal">
      <div className="my-auto flex w-full max-w-lg flex-col gap-3">
      <form onSubmit={(e) => void addKid(e)} className={`${card} flex flex-col gap-4`} data-testid="add-kid" role="dialog" aria-modal="true">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-heading">{t('parent.addChild')}</h2>
          <button type="button" data-testid="add-kid-close" onClick={onClose} className="text-sm font-bold text-muted underline">
            {t('cab.kid.closeForm')}
          </button>
        </div>
        <div>
          <label htmlFor="kid-nick" className={label}>
            {t('auth.nick')}
          </label>
          <input id="kid-nick" data-testid="kid-nick" className={input} value={nick} maxLength={20} autoComplete="off" onChange={(e) => setNick(e.target.value)} />
          <p className="mt-1 text-xs text-muted">{t('parent.nickHint')}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className={label}>{t('parent.age')}</span>
            <ChipSelect
              testid="kid-age"
              label={t('parent.age')}
              value={age}
              onChange={setAge}
              options={[
                { value: '5-8', label: '5–8' },
                { value: '9-12', label: '9–12' },
              ]}
              className="h-12 w-full"
            />
          </div>
          <div>
            <span className={label}>{t('parent.lang')}</span>
            <ChipSelect
              testid="kid-lang"
              label={t('parent.lang')}
              value={lang}
              onChange={setLang}
              options={[
                { value: 'ru', label: 'Русский' },
                { value: 'en', label: 'English' },
                { value: 'uz', label: 'Oʻzbekcha' },
              ]}
              className="h-12 w-full"
            />
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
      <LinkCard onLinked={onAdded} />
      </div>
    </div>
  )
}

export default function ParentCabinet() {
  const { t } = useTranslation()
  const [kids, load] = useLoad(loadKids)
  const [family] = useLoad(loadFamily)
  const [qr, setQr] = useState<{ id: number; nick: string; token: string } | null>(null)
  const [pick, setPick] = useState<number | null>(null)
  const [stats, setStats] = useState<Record<number, Analytics>>({})
  const [adding, setAdding] = useState(false)
  // Решений мало: они слева, дети рядом, чтобы экран не пустовал. Решений много: сетка на всю ширину
  const [waiting, setWaiting] = useState(0)
  const few = waiting <= 1

  const ids = kids?.map((k) => k.id).join(',') ?? ''
  useEffect(() => {
    let alive = true
    for (const k of kids ?? []) {
      api<Analytics>(`/api/parent/children/${k.id}/analytics`)
        .then((a) => alive && setStats((s) => ({ ...s, [k.id]: a })))
        .catch(() => {})
    }
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids])

  const sel = kids?.find((k) => k.id === pick) ?? kids?.[0] ?? null
  const st = sel ? stats[sel.id] : undefined
  const latest = sel ? (family?.items ?? []).filter((p) => p.nick === sel.nick).slice(0, 6) : []

  async function showQr(k: Kid) {
    const r = await api<{ token: string }>(`/api/parent/children/${k.id}/qr`, 'POST')
    setQr({ id: k.id, nick: k.nick, token: r.token })
  }

  const h2 = 'text-2xl font-black tracking-tight text-heading md:text-3xl'
  return (
    <div className="min-h-screen bg-bg pb-24 lg:pb-6">
      <CabinetHeader role="parent" />
      <main className="px-4 py-4 md:px-8">
        <h1 data-testid="page-title" className="mb-3 text-[32px] font-black leading-9 tracking-tight text-heading lg:text-5xl lg:leading-[56px]">
          {t('review.okTitle')}
        </h1>
        <div className={few ? 'lg:grid lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start lg:gap-8' : ''}>
        <ReviewQueue single={few} onCount={setWaiting} />
        <div className="min-w-0">
        <section data-testid="kids" className={`mt-8 ${few ? 'lg:mt-0' : ''}`}>
          <h2 className={h2}>{t('cab.myKids')}</h2>
          {kids && kids.length === 0 && <p className="mt-2 text-muted">{t('parent.noChildren')}</p>}
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {kids?.map((k) => {
              const total = stats[k.id]?.pictures_total
              return (
                <button
                  key={k.id}
                  type="button"
                  data-testid={`kid-${k.nick}`}
                  aria-pressed={sel?.id === k.id}
                  onClick={() => setPick(k.id)}
                  className={`flex h-[76px] shrink-0 items-center gap-3 rounded-full border-2 pl-2 pr-5 text-left ${sel?.id === k.id ? 'border-primary bg-primary-soft' : 'border-transparent bg-surface'}`}
                >
                  <Avatar nick={k.nick} className="h-[60px] w-[60px]" />
                  <span className="min-w-0">
                    <span className="block truncate text-lg font-black leading-6 text-heading">{k.nick}</span>
                    <span className="flex items-center gap-1 text-sm font-bold text-muted">
                      {total != null && <span data-testid="kid-level">{t('mw.level', { n: levelOf(total) })} ·</span>}
                      <img src="/art/coin.webp" alt="" className="h-4 w-4" />
                      <span data-testid="kid-coins">{k.coins ?? '—'}</span>
                    </span>
                  </span>
                </button>
              )
            })}
            <button
              type="button"
              data-testid="add-child-tile"
              aria-label={t('cab.kid.addChild')}
              title={t('cab.kid.addChild')}
              onClick={() => setAdding(true)}
              className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-full border border-border bg-surface text-primary"
            >
              <Icon name="plus" className="h-8 w-8" />
            </button>
          </div>
          {sel?.locked && <p className="mt-2 text-sm font-bold text-danger">{t('parent.locked')}</p>}
          {sel && (
            <div data-testid="week" className="mt-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                {st && !st.has_data ? (
                  <p data-testid="week-empty" className="font-bold text-muted">{t('cab.week.noData', { nick: sel.nick })}</p>
                ) : (
                  <p data-testid="week-summary" className="text-lg font-extrabold leading-7 text-heading">
                    <span data-testid="week-created">{t('cab.week.pictures')}: {dash(st && weekBars(st.ready_at, new Date()).reduce((n, b) => n + b.count, 0))}</span>
                    {' · '}
                    <span data-testid="week-published">{t('cab.week.shown')}: {dash(st?.published)}</span>
                    {' · '}
                    <span data-testid="week-held">{t('cab.week.held')}: {dash(st?.held)}</span>
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Link to="/parent/feed" data-testid="family-feed-link" className="flex h-11 items-center rounded-full border border-border bg-surface px-5 text-sm font-extrabold text-heading">
                    {t('feed.familyFeed')}
                  </Link>
                  <button type="button" data-testid={`qr-${sel.nick}`} onClick={() => void showQr(sel)} className="flex h-11 items-center rounded-full border border-border bg-surface px-5 text-sm font-extrabold text-heading">
                    {t('parent.qrButton')}
                  </button>
                </div>
              </div>
              {qr?.id === sel.id && <QrBox token={qr.token} nick={qr.nick} />}
              {latest.length > 0 && (
                <Link to="/parent/feed" data-testid="latest-link" className="grid grid-cols-3 gap-2 md:grid-cols-6 md:gap-3">
                  {latest.map((p) => (
                    <img key={p.id} src={p.image_url} alt="" className="aspect-square w-full rounded-2xl object-cover" />
                  ))}
                </Link>
              )}
              {st?.has_data && (
                <div className="min-w-0">
                  <p className="text-sm font-bold text-muted">{t('cab.week.chart')}</p>
                  <div className="mt-1 max-h-[180px] overflow-hidden"><WeekChart readyAt={st.ready_at} /></div>
                  <p className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
                    <span>{t('cab.week.received')}: <b data-testid="week-received" className="text-heading">{dash(st.coins_received)}</b></span>
                    <span>{t('cab.week.spent')}: <b data-testid="week-spent" className="text-heading">{dash(st.coins_spent)}</b></span>
                    {st.coins_earned_lessons != null && <span data-testid="kid-lessons">{t('cab.kid.lessons')}: <b className="text-primary">+{st.coins_earned_lessons}</b></span>}
                  </p>
                  {!!st.coins_uncertain && <p data-testid="week-uncertain" className="mt-1 text-sm font-bold text-muted">{t('cab.week.uncertain', { count: st.coins_uncertain })}</p>}
                </div>
              )}
            </div>
          )}
        </section>

        <OpenLinks role="parent" />
        <ParentNotes />
        </div>
        </div>
      </main>
      {adding && <AddKidModal onClose={() => setAdding(false)} onAdded={load} />}
    </div>
  )
}
