import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import Avatar from '../components/Avatar'
import CabinetHeader from '../components/CabinetHeader'
import ChipSelect from '../components/ChipSelect'
import ErrorText, { errorKey } from '../components/ErrorText'
import FeedView from '../components/FeedView'
import Icon from '../components/Icon'
import LinkCard from '../components/LinkCard'
import PictureGrid from '../components/PictureGrid'
import QrBox from '../components/QrBox'
import OpenLinks from '../components/OpenLinks'
import ParentNotes from '../components/ParentNotes'
import ReviewQueue from '../components/ReviewQueue'
import WeekChart from '../components/WeekChart'
import { ANIMALS } from '../features/avatar/animal'
import { firstKid, notifyCabinet, REVIEW_EVENT, ringAfter, waitingByNick } from '../features/review/review'
import type { ReviewItem } from '../features/review/review'
import { weekBars } from '../features/review/week'
import { BADGES, rankProgress } from '../features/works/works'
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
  achieved: { alive: boolean; story: boolean; shared: boolean; styles: boolean }
  created: number | null
  ready_at: string[]
  published: number | null
  held: number | null
  coins_received: number | null
  coins_earned_lessons: number | null
  coins_uncertain: number
  coins_spent: number | null
}

const loadKids = () => api<Kid[]>('/api/parent/children')
const loadQueue = () => api<ReviewItem[]>('/api/review/queue')

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
  const [animal, setAnimal] = useState<string | null>(null)
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
      await api('/api/parent/children', 'POST', { nick, age_group: age, lang, pictures: pics, avatar: animal })
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
          <span className={label}>{t('parent.avatar')}</span>
          <div className="grid grid-cols-8 gap-1.5" data-testid="kid-avatars">
            {ANIMALS.map((a) => (
              <button key={a} type="button" data-testid={`kid-avatar-${a}`} aria-pressed={animal === a} aria-label={`${t('parent.avatar')}: ${a}`} onClick={() => setAnimal(a)} className={`aspect-square overflow-hidden rounded-full ${animal === a ? 'ring-4 ring-primary' : ''}`}>
                <img src={`/art/avatars/${a}.webp`} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
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

/** Имя для перехода: браузер ведёт элемент со старого места на новое. */
const vt = (name: string) => ({ viewTransitionName: name }) as CSSProperties

/** Кружок на своём месте: браузер перетекает его из круга в большой аватар по общему имени. */
function KidFace({ kid, className }: { kid: Kid; className: string }) {
  return (
    <span className="kid-avatar block rounded-full" style={vt(`kid-${kid.id}`)}>
      <Avatar nick={kid.nick} className={className} />
    </span>
  )
}

/** Остальные дети по кругу от выбранного. Много детей: листается, «+» всегда на виду. */
function KidRing({ kids, sel, counts, onPick, onAdd }: { kids: Kid[]; sel: Kid | null; counts: Record<string, number>; onPick: (k: Kid) => void; onAdd: () => void }) {
  const { t } = useTranslation()
  const box = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)
  const measure = useCallback(() => {
    const b = box.current
    if (b) setMore(b.scrollTop + b.clientHeight < b.scrollHeight - 1 || b.scrollLeft + b.clientWidth < b.scrollWidth - 1)
  }, [])
  useEffect(() => {
    measure()
    const ro = new ResizeObserver(measure)
    if (box.current) ro.observe(box.current)
    return () => ro.disconnect()
  }, [measure, kids.length])
  useEffect(() => {
    box.current?.scrollTo(0, 0) // в скобках: новый Chrome возвращает отсюда обещание, а React принял бы его за очистку и упал
  }, [sel?.id])
  return (
    <div data-testid="kid-ring" className="relative flex items-center gap-2 md:absolute md:inset-y-4 md:right-3 md:w-[92px] md:flex-col">
      <div
        ref={box}
        role="group"
        aria-label={t('cab.myKids')}
        onScroll={measure}
        className={`flex min-h-0 min-w-0 flex-1 gap-1 overflow-auto p-1 [scrollbar-width:none] md:w-full md:flex-col md:items-center md:gap-3 ${more ? '[mask-image:linear-gradient(to_right,black_80%,transparent)] md:[mask-image:linear-gradient(to_bottom,black_80%,transparent)]' : ''}`}
      >
        {(sel ? ringAfter(kids, sel.id) : kids).map((k) => (
          <button key={k.id} type="button" data-testid={`kid-${k.id}`} title={k.nick} onClick={() => onPick(k)} className="flex w-[72px] shrink-0 flex-col items-center gap-1 transition-transform duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97] motion-reduce:transition-none md:w-[84px]">
            <span className="relative">
              <KidFace kid={k} className="h-14 w-14 md:h-16 md:w-16" />
              {!!counts[k.nick] && (
                <span data-testid={`kid-badge-${k.id}`} className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-danger px-1.5 text-xs font-extrabold text-primary-fg">
                  {counts[k.nick]}
                </span>
              )}
            </span>
            <span className="w-full truncate text-center text-sm font-extrabold leading-5 text-heading">{k.nick}</span>
          </button>
        ))}
      </div>
      <button type="button" data-testid="add-child-tile" aria-label={t('cab.kid.addChild')} title={t('cab.kid.addChild')} onClick={onAdd} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-primary md:h-12 md:w-12">
        <Icon name="plus" className="h-6 w-6" />
      </button>
    </div>
  )
}

/** Карточка выбранного ребёнка: те же уровень и награды, что он сам видит в «Моих работах». */
function KidHero({ kid, st }: { kid: Kid; st?: Analytics }) {
  const { t } = useTranslation()
  const path = st ? rankProgress(st.pictures_total, st.achieved) : null
  return (
    <div className="relative flex min-w-0 items-center gap-3 md:gap-6">
      <div className="relative shrink-0 rounded-full bg-primary p-1">
        <KidFace kid={kid} className="h-20 w-20 md:h-[150px] md:w-[150px] xl:h-[180px] xl:w-[180px]" />
        {path && <span data-testid="kid-level" style={vt('kid-level')} className="kid-swap absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-primary text-sm font-black text-primary-fg md:bottom-1 md:right-1 md:h-11 md:w-11 md:border-4 md:text-xl">{path.level}</span>}
      </div>
      <div style={vt('kid-text')} className="kid-swap min-w-0 flex-1 md:max-w-[520px]">
        <h1 data-testid="page-title" className="break-words text-[28px] font-black leading-8 tracking-tight text-heading md:text-5xl md:leading-[56px]">{kid.nick}</h1>
        {path && (
          <>
            <p data-testid="kid-rank" className="truncate text-sm font-extrabold text-primary md:text-xl">{t('mw.level', { n: path.level })} · {t(`mw.rank.${path.rank}`)}</p>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface md:mt-2 md:h-3.5">
              <div data-testid="kid-bar" className="h-full w-full rounded-full bg-primary [transition:transform_0.7s_var(--ease-drawer)] motion-reduce:transition-none" style={{ transform: `translateX(${(path.next ? Math.round(((path.pictures - path.from) / (path.next.need - path.from)) * 100) : 100) - 100}%)` }} />
            </div>
            <p className="mt-1 truncate text-xs font-bold text-heading md:text-sm">{path.next ? t('mw.levelNext', { level: path.level + 1, n: path.pictures, need: path.next.need }) : t('mw.rankTop')}</p>
          </>
        )}
      </div>
    </div>
  )
}

function KidBadges({ st }: { st: Analytics }) {
  const { t } = useTranslation()
  const { earned } = rankProgress(st.pictures_total, st.achieved)
  return (
    <div data-testid="kid-badges" className="flex flex-wrap gap-1.5 md:gap-2">
      {BADGES.map((id) => (
        <img key={id} src={`/art/badges/${id}.webp`} alt={t(`mw.badge.${id}.name`)} title={t(`mw.badge.${id}.name`)} data-testid={`badge-${id}`} data-earned={earned[id]} className={`h-10 w-10 object-contain md:h-14 md:w-14 ${earned[id] ? '' : 'opacity-60 grayscale'}`} />
      ))}
    </div>
  )
}

export default function ParentCabinet() {
  const { t } = useTranslation()
  const [kids, load] = useLoad(loadKids)
  const [queue, reloadQueue, queueFailed] = useLoad(loadQueue)
  const [qr, setQr] = useState<{ id: number; nick: string; token: string } | null>(null)
  const [pick, setPick] = useState<number | null>(null)
  const [stats, setStats] = useState<Record<number, Analytics>>({})
  const [adding, setAdding] = useState(false)
  const [more, setMore] = useState(false)

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
  useEffect(() => {
    window.addEventListener(REVIEW_EVENT, reloadQueue)
    return () => window.removeEventListener(REVIEW_EVENT, reloadQueue)
  }, [reloadQueue])

  const counts = waitingByNick(queue ?? [])
  // Выбор один раз при входе: последнее решение по ребёнку не должно перебрасывать на другого
  if (pick === null && kids?.length && (queue || queueFailed)) setPick(firstKid(kids, counts)?.id ?? null)
  const sel = kids?.find((k) => k.id === pick) ?? null
  const st = sel ? stats[sel.id] : undefined
  const waiting = !!sel && !!queue?.some((x) => !x.urgent && x.nick === sel.nick)

  async function showQr(k: Kid) {
    const r = await api<{ token: string }>(`/api/parent/children/${k.id}/qr`, 'POST')
    setQr({ id: k.id, nick: k.nick, token: r.token })
  }

  function switchKid(k: Kid) {
    const go = () => {
      setPick(k.id)
      setMore(false)
    }
    if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) go()
    else document.startViewTransition(() => flushSync(go))
  }

  const link = 'text-base font-extrabold text-primary underline decoration-2 underline-offset-4'
  return (
    <div className="min-h-screen bg-bg pb-24 lg:pb-6">
      <CabinetHeader role="parent" />
      <main className="overflow-x-clip px-4 py-4 md:px-8">
        <ReviewQueue urgentOnly />
        <section data-testid="kids">
          {kids && kids.length === 0 && (
            <div className="flex flex-wrap items-center gap-4">
              <h1 data-testid="page-title" className="text-[32px] font-black leading-9 tracking-tight text-heading lg:text-5xl lg:leading-[56px]">{t('cab.myKids')}</h1>
              <KidRing kids={[]} sel={null} counts={counts} onPick={switchKid} onAdd={() => setAdding(true)} />
              <p className="w-full text-muted">{t('parent.noChildren')}</p>
            </div>
          )}
          {sel && (
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-8">
              <section data-testid="kid-panel" className="relative flex min-w-0 flex-col justify-center gap-3 overflow-hidden rounded-[28px] bg-primary-soft p-4 shadow-card md:gap-5 md:p-6 md:pr-[116px] lg:min-h-[580px]">
                {/* От баннера только облака: робот справа лёг бы под текст и кружки детей */}
                <img src="/art/level-banner.webp" alt="" className="pointer-events-none absolute inset-y-0 left-0 h-full w-[170%] max-w-none object-cover object-left" />
                <KidHero kid={sel} st={st} />
                {st && <div style={vt('kid-badges')} className="kid-swap relative"><KidBadges st={st} /></div>}
                <div style={vt('kid-meta')} className="kid-swap relative flex flex-wrap items-center gap-x-5 gap-y-2">
                  {sel.coins != null && (
                    <p className="flex items-center gap-2 text-lg font-extrabold text-heading md:text-xl">
                      <img src="/art/coin.webp" alt="" className="h-7 w-7" />
                      <span data-testid="kid-coins">{sel.coins} {t('pl.word', { count: sel.coins })}</span>
                    </p>
                  )}
                  <button type="button" data-testid="more-toggle" aria-expanded={more} onClick={() => setMore(!more)} className={link}>
                    {t(more ? 'cab.kid.less' : 'cab.kid.more')}
                  </button>
                  <button type="button" data-testid={`qr-${sel.nick}`} onClick={() => void showQr(sel)} className={link}>
                    {t('parent.qrButton')}
                  </button>
                </div>
                {sel.locked && <p className="relative text-sm font-bold text-danger">{t('parent.locked')}</p>}
                {qr?.id === sel.id && <div className="relative"><QrBox token={qr.token} nick={qr.nick} /></div>}
                <KidRing kids={kids ?? []} sel={sel} counts={counts} onPick={switchKid} onAdd={() => setAdding(true)} />
              </section>
              {/* Колонка на месте и без работ: при смене ребёнка раскладка не прыгает */}
              <div style={vt('kid-right')} className={`kid-swap min-w-0 ${waiting ? '' : 'hidden lg:flex'} flex-col items-center justify-center gap-3 text-center`}>
                {waiting ? (
                  <ReviewQueue stackOf={sel.nick} title={t('review.okTitle')} />
                ) : (
                  <>
                    <img src="/art/robot-happy.webp" alt="" className="h-40 w-40 object-contain" />
                    <p data-testid="kid-clear" className="text-xl font-extrabold text-heading">{t('review.empty')}</p>
                  </>
                )}
              </div>
            </div>
          )}
          {sel && more && (
            <div data-testid="kid-more" className="mt-5 min-w-0">
              {st && !st.has_data ? (
                <p data-testid="week-empty" className="font-bold text-muted">{t('cab.week.noData', { nick: sel.nick })}</p>
              ) : (
                <p data-testid="week-summary" className="flex flex-wrap items-center gap-x-1.5 text-base font-extrabold leading-6 text-heading">
                  <span data-testid="week-created">{t('cab.week.pictures')}: {dash(st && weekBars(st.ready_at, new Date()).reduce((n, b) => n + b.count, 0))} ·</span>
                  <span data-testid="week-published">{t('cab.week.shown')}: {dash(st?.published)} ·</span>
                  <span data-testid="week-held">{t('cab.week.held')}: {dash(st?.held)}</span>
                </p>
              )}
              {st?.has_data && (
                <>
                  <p className="mt-3 text-sm font-bold text-muted">{t('cab.week.chart')}</p>
                  <div className="mt-1 max-h-[180px] overflow-hidden"><WeekChart readyAt={st.ready_at} /></div>
                  <p className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
                    <span>{t('cab.week.received')}: <b data-testid="week-received" className="text-heading">{dash(st.coins_received)}</b></span>
                    <span>{t('cab.week.spent')}: <b data-testid="week-spent" className="text-heading">{dash(st.coins_spent)}</b></span>
                    {st.coins_earned_lessons != null && <span data-testid="kid-lessons">{t('cab.kid.lessons')}: <b className="text-primary">+{st.coins_earned_lessons}</b></span>}
                  </p>
                  {!!st.coins_uncertain && <p data-testid="week-uncertain" className="mt-1 text-sm font-bold text-muted">{t('cab.week.uncertain', { count: st.coins_uncertain })}</p>}
                </>
              )}
              <OpenLinks role="parent" />
            </div>
          )}
        </section>
        {/* Уведомление о замке или срочном нельзя прятать за «Подробнее» */}
        <ParentNotes />
        {sel && (
          <div style={vt('kid-works')} className="kid-swap mt-6">
            <h2 data-testid="kid-works-title" className="mb-3 text-[28px] font-black leading-9 tracking-tight text-heading lg:text-4xl lg:leading-[44px]">{t('cab.kid.works', { nick: sel.nick, interpolation: { escapeValue: false } })}</h2>
            <FeedView key={sel.nick} kinds={['family']} nick={sel.nick} />
          </div>
        )}
      </main>
      {adding && <AddKidModal onClose={() => setAdding(false)} onAdded={load} />}
    </div>
  )
}
