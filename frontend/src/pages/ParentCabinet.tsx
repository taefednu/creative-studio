import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api } from '../api'
import Avatar from '../components/Avatar'
import CabinetHeader from '../components/CabinetHeader'
import ChipSelect from '../components/ChipSelect'
import ErrorText, { errorKey } from '../components/ErrorText'
import LinkCard from '../components/LinkCard'
import PictureGrid from '../components/PictureGrid'
import QrBox from '../components/QrBox'
import ReviewQueue from '../components/ReviewQueue'
import WeekChart from '../components/WeekChart'
import { notifyCabinet } from '../features/review/review'
import { weekBars } from '../features/review/week'
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
  const latest = sel ? (family?.items ?? []).filter((p) => p.nick === sel.nick).slice(0, 5) : []

  async function showQr(k: Kid) {
    const r = await api<{ token: string }>(`/api/parent/children/${k.id}/qr`, 'POST')
    setQr({ id: k.id, nick: k.nick, token: r.token })
  }

  const tile = (icon: string, name: string, value: number | null | undefined, testid: string) => (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border border-border bg-surface p-2 sm:flex-row sm:items-center sm:gap-3 sm:p-3" data-testid={testid}>
      <img src={icon} alt="" className="h-8 w-8 shrink-0 object-contain sm:h-10 sm:w-10" />
      <div className="min-w-0">
        <p className="truncate text-xs text-muted sm:text-sm">{name}</p>
        <p className="text-3xl font-extrabold text-heading">{dash(value)}</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-bg pb-24 lg:pb-6">
      <CabinetHeader role="parent" />
      <main className="px-4 py-4 md:px-8">
        <h1 data-testid="page-title" className="mb-3 w-fit text-[30px] font-extrabold leading-9 text-heading lg:text-4xl lg:leading-10">
          {t('cab.myKids')}
        </h1>
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[494fr_593fr_500fr]">
          <section className="grid grid-cols-[minmax(0,1fr)] gap-4 s520:grid-cols-[repeat(2,minmax(0,1fr))]" data-testid="kids">
            {kids && kids.length === 0 && <p className="col-span-full text-muted">{t('parent.noChildren')}</p>}
            {kids?.map((k) => {
              const lessons = stats[k.id]?.coins_earned_lessons
              return (
                <div key={k.id} data-testid={`kid-${k.nick}`}>
                  <div
                    data-testid="kid-card"
                    className={`flex h-full flex-col items-center gap-2 rounded-card border bg-surface p-4 shadow-card ${sel?.id === k.id ? 'border-primary' : 'border-border'}`}
                  >
                    <Avatar nick={k.nick} className="h-auto w-full max-w-[170px] aspect-square short:max-w-[84px]" />
                    <p className="text-3xl font-extrabold text-heading short:text-xl">{k.nick}</p>
                    <p className="text-center text-muted">
                      {k.class_name ? t('cab.kid.ageClass', { age: k.age_group, name: k.class_name }) : t('cab.kid.age', { age: k.age_group })}
                    </p>
                    <p className="flex items-center gap-2 rounded-full bg-primary-soft px-6 py-1 text-3xl font-extrabold text-heading short:px-4 short:py-0 short:text-xl" data-testid="kid-coins">
                      <img src="/art/coin.webp" alt="" className="h-10 w-10 short:h-7 short:w-7" />
                      {k.coins ?? '—'}
                    </p>
                    {lessons != null && (
                      <p className="flex w-full items-center justify-between gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted" data-testid="kid-lessons">
                        {t('cab.kid.lessons')}
                        <b className="text-lg text-primary">+{lessons}</b>
                      </p>
                    )}
                    {k.locked && <p className="text-sm font-bold text-danger">{t('parent.locked')}</p>}
                    <div className="mt-auto flex w-full items-center gap-2">
                      <button
                        type="button"
                        data-testid={`kid-open-${k.nick}`}
                        onClick={() => setPick(k.id)}
                        className="h-[55px] short:h-11 flex-1 rounded-full bg-primary px-3 text-lg short:text-base font-extrabold uppercase text-primary-fg"
                      >
                        {t('cab.kid.open')}
                      </button>
                      <button
                        type="button"
                        disabled
                        data-testid={`add-coins-${k.nick}`}
                        className="relative h-[55px] short:h-11 flex-1 rounded-full border border-border bg-surface px-2 text-sm font-bold text-heading opacity-70"
                      >
                        {t('cab.kid.addCoins')}
                        <span className="absolute -top-2 right-1 rounded-full bg-primary-soft px-2 text-[10px] font-extrabold text-primary">{t('auth.soon')}</span>
                      </button>
                    </div>
                    <button type="button" data-testid={`qr-${k.nick}`} onClick={() => void showQr(k)} className="text-sm font-bold text-primary underline">
                      {t('parent.qrButton')}
                    </button>
                    {qr?.id === k.id && <QrBox token={qr.token} nick={qr.nick} />}
                  </div>
                </div>
              )
            })}
            <button
              type="button"
              data-testid="add-child-tile"
              onClick={() => setAdding(true)}
              className="col-span-full flex h-[120px] short:h-14 short:flex-row short:gap-2 flex-col items-center justify-center gap-1 rounded-card border-2 border-dashed border-border bg-surface p-2 text-xl font-extrabold text-primary xl:h-[236px] short:!h-14 short:text-base"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-4xl leading-none xl:h-16 xl:w-16 xl:text-5xl short:!h-8 short:!w-8 short:!text-2xl">+</span>
              {t('cab.kid.addChild')}
            </button>
          </section>

          <section className="flex flex-col gap-4">
            <div data-testid="week" className={`${card} flex flex-col gap-3 p-5 short:gap-2 short:p-4`}>
              {sel ? (
                <>
                  <h2 className="text-3xl font-extrabold text-heading short:text-2xl">{t('cab.week.title', { nick: sel.nick })}</h2>
                  {st && !st.has_data ? (
                    <p data-testid="week-empty" className="rounded-2xl bg-primary-soft p-4 text-heading">
                      {t('cab.week.noData', { nick: sel.nick })}
                    </p>
                  ) : (
                    <>
                      <p className="text-sm font-bold uppercase text-primary">{t('cab.week.perDay')}</p>
                      {st ? <WeekChart readyAt={st.ready_at} /> : <div className="h-[200px]" />}
                      <div className="grid grid-cols-3 gap-2">
                        {tile('/art/tab-create.webp', t('cab.week.pictures'), st && weekBars(st.ready_at, new Date()).reduce((n, b) => n + b.count, 0), 'week-created')}
                        {tile('/art/tab-feed.webp', t('cab.week.shown'), st?.published, 'week-published')}
                        {tile('/art/shield.webp', t('cab.week.held'), st?.held, 'week-held')}
                      </div>
                      <p className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
                        <span>
                          {t('cab.week.received')}: <b data-testid="week-received" className="text-heading">{dash(st?.coins_received)}</b>
                        </span>
                        <span>
                          {t('cab.week.spent')}: <b data-testid="week-spent" className="text-heading">{dash(st?.coins_spent)}</b>
                        </span>
                      </p>
                      {!!st?.coins_uncertain && (
                        <p data-testid="week-uncertain" className="text-sm font-bold text-muted">
                          {t('cab.week.uncertain', { count: st.coins_uncertain })}
                        </p>
                      )}
                    </>
                  )}
                </>
              ) : (
                <p className="text-muted">{t('cab.week.pick')}</p>
              )}
            </div>
            {latest.length > 0 && (
              <div data-testid="latest" className={`${card} flex flex-col gap-3 p-5`}>
                <p className="text-sm font-bold uppercase text-primary">{t('cab.week.latest')}</p>
                <Link to="/parent/feed" data-testid="latest-link" className="grid grid-cols-5 gap-2">
                  {latest.map((p) => (
                    <img key={p.id} src={p.image_url} alt="" className="aspect-[3/4] short:aspect-square w-full rounded-xl object-cover" />
                  ))}
                </Link>
                <Link to="/parent/feed" data-testid="family-feed-link" className="self-start rounded-full bg-primary px-5 py-2 text-sm font-extrabold text-primary-fg">
                  {t('feed.familyFeed')}
                </Link>
              </div>
            )}
            {latest.length === 0 && (
              <Link to="/parent/feed" data-testid="family-feed-link" className="self-start rounded-full bg-primary px-5 py-2 text-sm font-extrabold text-primary-fg">
                {t('feed.familyFeed')}
              </Link>
            )}
          </section>

          <section className="flex flex-col gap-4">
            <div data-testid="ok-card" className={`${card} flex flex-col gap-3 p-5 big:min-h-[408px]`}>
              <h2 className="text-3xl font-extrabold text-heading">{t('review.okTitle')}</h2>
              <div className="min-h-0 overflow-y-auto"><ReviewQueue compact /></div>
            </div>
            
          </section>
        </div>
      </main>
      {adding && <AddKidModal onClose={() => setAdding(false)} onAdded={load} />}
    </div>
  )
}
