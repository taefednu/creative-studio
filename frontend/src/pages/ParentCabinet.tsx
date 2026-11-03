import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import Avatar from '../components/Avatar'
import CabinetHeader from '../components/CabinetHeader'
import ChipSelect from '../components/ChipSelect'
import ErrorText, { errorKey } from '../components/ErrorText'
import PostModal from '../components/PostModal'
import Icon from '../components/Icon'
import LinkCard from '../components/LinkCard'
import PictureGrid from '../components/PictureGrid'
import QrBox from '../components/QrBox'
import OpenLinks from '../components/OpenLinks'
import ParentNotes from '../components/ParentNotes'
import ReviewQueue from '../components/ReviewQueue'
import WeekChart from '../components/WeekChart'
import { ANIMALS } from '../features/avatar/animal'
import { firstKid, notifyCabinet, REVIEW_EVENT, waitingByNick } from '../features/review/review'
import type { ReviewItem } from '../features/review/review'
import { weekBars } from '../features/review/week'
import { BADGES, rankProgress, withoutHeroSources } from '../features/works/works'
import type { Work } from '../features/works/works'
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

/** Остальные дети: нажал, и он становится выбранным. На телефоне строкой, на компьютере списком; много детей листаются, «+» на виду. */
function KidList({ kids, sel, counts, onPick, onAdd }: { kids: Kid[]; sel: Kid | null; counts: Record<string, number>; onPick: (k: Kid) => void; onAdd: () => void }) {
  const { t } = useTranslation()
  return (
    <div data-testid="kid-list" className="flex items-center gap-2 lg:flex-col lg:items-stretch">
      <div role="group" aria-label={t('cab.myKids')} className="flex min-w-0 flex-1 gap-1 overflow-auto p-1 [scrollbar-width:none] lg:max-h-[300px] lg:flex-col lg:gap-0 lg:divide-y lg:divide-border">
        {kids.filter((k) => k.id !== sel?.id).map((k) => (
          <button key={k.id} type="button" data-testid={`kid-${k.id}`} title={k.nick} onClick={() => onPick(k)} className="flex w-[72px] shrink-0 flex-col items-center gap-1 rounded-2xl transition-colors duration-150 lg:w-full lg:flex-row lg:gap-3 lg:px-1 lg:py-2 lg:text-left lg:hover:bg-primary-soft">
            <span className="relative shrink-0">
              <KidFace kid={k} className="h-14 w-14" />
              {!!counts[k.nick] && (
                <span data-testid={`kid-badge-${k.id}`} className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-danger px-1.5 text-xs font-extrabold text-primary-fg">
                  {counts[k.nick]}
                </span>
              )}
            </span>
            <span className="w-full min-w-0 truncate text-center text-sm font-extrabold leading-5 text-heading lg:flex-1 lg:text-left lg:text-lg">{k.nick}</span>
            <svg viewBox="0 0 24 24" className="hidden h-5 w-5 shrink-0 text-muted lg:block" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 5 7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>
      <button type="button" data-testid="add-child-tile" onClick={onAdd} aria-label={t('cab.kid.addChild')} className="flex h-12 w-12 shrink-0 items-center justify-center gap-3 rounded-full bg-primary-soft font-extrabold text-primary transition-colors duration-150 hover:bg-primary-light lg:h-14 lg:w-full lg:justify-start lg:rounded-2xl lg:px-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface"><Icon name="plus" className="h-5 w-5" /></span>
        <span className="hidden lg:inline">{t('cab.kid.addChild')}</span>
      </button>
    </div>
  )
}

/** Выбранный ребёнок: те же уровень и награды, что он сам видит в «Моих работах». */
function KidHero({ kid, st }: { kid: Kid; st?: Analytics }) {
  const { t } = useTranslation()
  const path = st ? rankProgress(st.pictures_total, st.achieved) : null
  return (
    <div className="flex min-w-0 items-center gap-3 lg:gap-4">
      <div className="relative shrink-0 rounded-full bg-primary p-0.5">
        <KidFace kid={kid} className="h-20 w-20 lg:h-24 lg:w-24" />
        {path && <span data-testid="kid-level" style={vt('kid-level')} className="kid-swap absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-primary text-sm font-black text-primary-fg">{path.level}</span>}
      </div>
      <div style={vt('kid-text')} className="kid-swap min-w-0 flex-1">
        <h1 data-testid="page-title" className="break-words text-[28px] font-black leading-8 tracking-tight text-heading lg:text-[32px] lg:leading-9">{kid.nick}</h1>
        {path && (
          <>
            <p data-testid="kid-rank" className="text-sm font-extrabold leading-5 text-primary">{t('mw.level', { n: path.level })} · {t(`mw.rank.${path.rank}`)}</p>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-primary-soft">
              <div data-testid="kid-bar" className="h-full w-full rounded-full bg-primary [transition:transform_0.7s_var(--ease-drawer)] motion-reduce:transition-none" style={{ transform: `translateX(${(path.next ? Math.round(((path.pictures - path.from) / (path.next.need - path.from)) * 100) : 100) - 100}%)` }} />
            </div>
            <p className="mt-1 truncate text-xs font-bold text-heading">{path.next ? t('mw.levelNext', { level: path.level + 1, n: path.pictures, need: path.next.need }) : t('mw.rankTop')}</p>
          </>
        )}
      </div>
    </div>
  )
}

type KidWork = Pick<Work, 'id' | 'kind' | 'hero_of_work_id'> & { image_url: string; post_id: number | null }

/** Все готовые работы ребёнка. Показанная семье открывается окном поста, там её можно скрыть; остальные просто крупно. */
function KidWorks({ kid }: { kid: Kid }) {
  const { t } = useTranslation()
  const fetchWorks = useCallback(() => api<KidWork[]>(`/api/parent/children/${kid.id}/works`), [kid.id])
  const [list, reload] = useLoad(fetchWorks)
  const [post, setPost] = useState<number | null>(null)
  const [zoom, setZoom] = useState<string | null>(null)
  useEffect(() => {
    if (!zoom) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setZoom(null)
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [zoom])
  if (!list) return null
  const works = withoutHeroSources(list as unknown as Work[]) as unknown as KidWork[]
  if (!works.length) {
    return (
      <div data-testid="kid-works-empty" className="flex items-center gap-4 py-6">
        <img src="/art/robot-wave.webp" alt="" className="h-24 w-24 shrink-0 object-contain" />
        <p className="text-lg font-extrabold text-heading">{t('cab.kid.noWorks', { nick: kid.nick, interpolation: { escapeValue: false } })}</p>
      </div>
    )
  }
  return (
    <>
      <div data-testid="kid-works" className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:gap-3 lg:grid-cols-4 xl:grid-cols-5">
        {works.map((w) => (
          <button key={w.id} type="button" data-testid="kid-work" aria-label={t('review.zoom')} onClick={() => (w.post_id ? setPost(w.post_id) : setZoom(w.image_url))} className="feed-card group relative block aspect-square overflow-hidden rounded-[22px] bg-primary-soft shadow-card">
            <img src={`${w.image_url}?thumb=1`} alt="" loading="lazy" decoding="async" onLoad={(e) => e.currentTarget.classList.add('feed-img-on')} className="feed-img h-full w-full object-cover group-hover:scale-105" />
            {w.post_id && <span data-testid="kid-work-family" className="absolute left-2 top-2 rounded-full bg-success-soft px-2 py-0.5 text-xs font-extrabold text-success shadow-card">{t('mw.inFamily')}</span>}
          </button>
        ))}
      </div>
      {post !== null && <PostModal postId={post} isChild={false} onClose={() => setPost(null)} onChanged={reload} />}
      {zoom && (
        <button type="button" data-testid="kid-work-zoom" aria-label={t('review.close')} onClick={() => setZoom(null)} className="modal-bg fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-sm">
          <img src={zoom} alt="" className="modal-in max-h-full max-w-full rounded-2xl object-contain shadow-pop" />
        </button>
      )}
    </>
  )
}

function KidBadges({ st }: { st: Analytics }) {
  const { t } = useTranslation()
  const { earned } = rankProgress(st.pictures_total, st.achieved)
  return (
    <div data-testid="kid-badges" className="grid grid-cols-6 justify-items-center gap-1.5 lg:grid-cols-3 lg:gap-3">
      {BADGES.map((id) => (
        <img key={id} src={`/art/badges/${id}.webp`} alt={t(`mw.badge.${id}.name`)} title={t(`mw.badge.${id}.name`)} data-testid={`badge-${id}`} data-earned={earned[id]} className={`aspect-square w-full max-w-[72px] object-contain ${earned[id] ? '' : 'opacity-60 grayscale'}`} />
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
    if (!qr) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setQr(null)
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [qr])
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
        {kids && kids.length === 0 && (
          <section data-testid="kids" className="flex flex-col items-start gap-4">
            <h1 data-testid="page-title" className="text-[32px] font-black leading-9 tracking-tight text-heading lg:text-5xl lg:leading-[56px]">{t('cab.myKids')}</h1>
            <p className="text-muted">{t('parent.noChildren')}</p>
            <div className="w-full max-w-[340px]"><KidList kids={[]} sel={null} counts={counts} onPick={switchKid} onAdd={() => setAdding(true)} /></div>
          </section>
        )}
        {sel && (
          <section data-testid="kids" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
            <aside data-testid="kid-panel" className="flex min-w-0 flex-col gap-4 lg:order-2 lg:self-start lg:border-l lg:border-border lg:pl-8">
              <KidHero kid={sel} st={st} />
              {st && <div style={vt('kid-badges')} className="kid-swap"><KidBadges st={st} /></div>}
              <div style={vt('kid-meta')} className="kid-swap flex flex-wrap items-center gap-x-4 gap-y-2">
                {sel.coins != null && (
                  <p className="flex w-full items-center gap-2 text-lg font-extrabold text-heading">
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
              {sel.locked && <p className="text-sm font-bold text-danger">{t('parent.locked')}</p>}
              {more && (
                <div data-testid="kid-more" className="nav-in flex min-w-0 flex-col gap-3 rounded-2xl bg-primary-soft p-3">
                  {st && !st.has_data ? (
                    <p data-testid="week-empty" className="font-bold text-text">{t('cab.week.noData', { nick: sel.nick })}</p>
                  ) : (
                    <>
                      <WeekChart readyAt={st?.ready_at ?? []} />
                      <p data-testid="week-summary" className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm font-bold text-text">
                        <span data-testid="week-created">{t('cab.week.pictures')}: <b className="text-heading">{dash(st && weekBars(st.ready_at, new Date()).reduce((n, b) => n + b.count, 0))}</b></span>
                        <span data-testid="week-published">{t('cab.week.shown')}: <b className="text-heading">{dash(st?.published)}</b></span>
                        <span data-testid="week-held">{t('cab.week.held')}: <b className="text-heading">{dash(st?.held)}</b></span>
                        <span>{t('cab.week.received')}: <b data-testid="week-received" className="text-heading">{dash(st?.coins_received)}</b></span>
                        <span>{t('cab.week.spent')}: <b data-testid="week-spent" className="text-heading">{dash(st?.coins_spent)}</b></span>
                        {st?.coins_earned_lessons != null && <span data-testid="kid-lessons">{t('cab.kid.lessons')}: <b className="text-primary">+{st.coins_earned_lessons}</b></span>}
                      </p>
                      {!!st?.coins_uncertain && <p data-testid="week-uncertain" className="text-sm font-bold text-text">{t('cab.week.uncertain', { count: st.coins_uncertain })}</p>}
                    </>
                  )}
                </div>
              )}
              <div className="border-t border-border pt-3">
                <KidList kids={kids ?? []} sel={sel} counts={counts} onPick={switchKid} onAdd={() => setAdding(true)} />
              </div>
            </aside>
            <div className="flex min-w-0 flex-col gap-6 lg:order-1">
              {waiting && (
                <div style={vt('kid-right')} className="kid-swap">
                  <ReviewQueue stackOf={sel.nick} title={t('review.okTitle')} />
                </div>
              )}
              {/* Только когда точно пусто: очередь загрузилась и по ребёнку нет ничего, срочного тоже */}
              {queue && !counts[sel.nick] && (
                <div data-testid="kid-clear" style={vt('kid-right')} className="kid-swap flex items-center gap-3 rounded-[28px] bg-success-soft p-3 pr-5 md:gap-5 md:p-4 md:pr-8">
                  <img src="/art/robot-happy.webp" alt="" className="h-20 w-20 shrink-0 object-contain md:h-28 md:w-28" />
                  <div className="min-w-0">
                    <h2 className="text-[28px] font-black leading-8 tracking-tight text-heading md:text-4xl md:leading-[44px]">{t('cab.kid.clearTitle')}</h2>
                    <p className="mt-1 text-base font-semibold leading-6 text-text">{t('cab.kid.clearText', { nick: sel.nick, interpolation: { escapeValue: false } })}</p>
                  </div>
                </div>
              )}
              {more && <OpenLinks role="parent" />}
              {/* Уведомление о замке или срочном нельзя прятать за «Подробнее» */}
              <ParentNotes />
              <div style={vt('kid-works')} className="kid-swap">
                <h2 data-testid="kid-works-title" className="text-[28px] font-black leading-9 tracking-tight text-heading lg:text-4xl lg:leading-[44px]">{t('cab.kid.works', { nick: sel.nick, interpolation: { escapeValue: false } })}</h2>
                <div className="mt-3"><KidWorks key={sel.id} kid={sel} /></div>
              </div>
            </div>
          </section>
        )}
      </main>
      {adding && <AddKidModal onClose={() => setAdding(false)} onAdded={load} />}
      {qr && (
        <div role="presentation" onClick={() => setQr(null)} className="modal-bg fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" data-testid="qr-modal" onClick={(e) => e.stopPropagation()} className="modal-in flex w-full max-w-sm flex-col gap-3 rounded-card bg-surface p-4 shadow-pop">
            <QrBox token={qr.token} nick={qr.nick} />
            <button type="button" data-testid="qr-close" onClick={() => setQr(null)} className="h-12 rounded-full border border-border bg-surface font-extrabold text-heading">
              {t('review.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
