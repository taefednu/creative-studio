import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import { agoText, effectKey, notifyReview, nothingBlurred, reasonKeys, stackOrder } from '../features/review/review'
import { loadStory } from '../features/story/story'
import type { Story } from '../features/story/story'
import type { ReviewItem } from '../features/review/review'
import Avatar from './Avatar'

const btnMain =
  'rounded-full bg-primary px-5 py-2 text-sm font-extrabold uppercase text-primary-fg disabled:opacity-50'
const btnApprove = 'rounded-full bg-success-soft px-3 py-2 text-sm font-extrabold text-success transition-colors duration-150 hover:bg-success hover:text-primary-fg disabled:opacity-50'
const btnReject = 'rounded-full bg-danger-soft px-3 py-2 text-sm font-extrabold text-danger transition-colors duration-150 hover:bg-danger hover:text-primary-fg disabled:opacity-50'
const btnSide =
  'rounded-full border border-border bg-surface px-5 py-2 text-sm font-extrabold text-heading disabled:opacity-50'

/**
 * «Задержано» (учитель) и «Ждёт вашего OK» (родитель): один компонент, фильтр по роли на сервере.
 * classFilter — фильтр учителя по имени класса.
 */
export default function ReviewQueue({
  title,
  hideEmpty = false,
  urgentOnly = false,
  stackOf,
  withWho = false,
}: {
  title?: string
  /** Решений нет: секции нет вовсе. */
  hideEmpty?: boolean
  /** Над лентой: только срочное, обычные решения ждут на своей вкладке. */
  urgentOnly?: boolean
  /** Стопка одного ребёнка: по одной работе за раз. Срочное она не показывает, его держит urgentOnly над экраном. */
  stackOf?: (it: ReviewItem) => boolean
  /** Детей много: на работе показать, чья она. */
  withWho?: boolean
}) {
  const { t } = useTranslation()
  const [all, setItems] = useState<ReviewItem[] | null>(null)
  const items = urgentOnly ? all && all.filter((x) => x.urgent) : all
  const [open, setOpen] = useState<ReviewItem | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const [zoom, setZoom] = useState<string | null>(null)
  const [skipped, setSkipped] = useState(0)
  const [leaving, setLeaving] = useState<{ id: number; to: 'left' | 'right' } | null>(null)
  const pile = stackOrder(stackOf ? items?.filter((x) => !x.urgent && stackOf(x)) ?? [] : [], skipped)
  useEffect(() => {
    if (!zoom) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setZoom(null)
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [zoom])

  const load = useCallback(() => {
    api<ReviewItem[]>('/api/review/queue')
      .then(setItems)
      .catch(() => setLeaving(null)) // список не обновился: решённая карточка не должна остаться невидимой
  }, [])
  useEffect(() => {
    load()
  }, [load])

  async function act(it: ReviewItem, what: 'approve' | 'reject' | 'seen') {
    setBusy(it.id)
    setFailed(false)
    try {
      await api(`/api/review/items/${it.id}/${what}`, 'POST')
      setOpen(null)
      if (stackOf && what !== 'seen') {
        setLeaving({ id: it.id, to: what === 'approve' ? 'right' : 'left' })
        await new Promise((done) => setTimeout(done, 180))
      }
    } catch {
      setFailed(true)
    } finally {
      setBusy(null)
      load()
      notifyReview()
    }
  }

  const where = (it: ReviewItem) =>
    it.where === 'class'
      ? it.class_name
        ? t('review.where.class', { name: it.class_name })
        : t('review.where.classNoName')
      : t(`review.where.${it.where}`)

  const kind = (it: ReviewItem) => t(`review.types.${it.item_type}`)

  if ((hideEmpty || urgentOnly) && !items?.length && !open) return null
  if (stackOf && !pile.length) return null

  return (
    <section id="review" data-testid="review" className={`flex flex-col ${stackOf ? 'gap-4' : 'gap-3'} ${urgentOnly ? 'mb-3' : ''}`}>
      {title && (
        <div className="flex items-center justify-between gap-3">
        <h2 className={`flex items-center gap-2 text-heading ${stackOf ? 'text-[28px] font-black leading-9 tracking-tight lg:text-4xl lg:leading-[44px]' : 'text-2xl font-extrabold'}`}>
          {title}
          {!stackOf && items !== null && items.length > 0 && (
            <span data-testid="review-count" className="rounded-full bg-primary px-3 py-0.5 text-sm text-primary-fg">
              {items.length}
            </span>
          )}
        </h2>
        {stackOf && pile.length > 1 && (
          <button type="button" data-testid="review-skip" onClick={() => setSkipped(skipped + 1)} className="shrink-0 whitespace-nowrap text-base font-extrabold text-primary underline decoration-2 underline-offset-4">
            {t('review.moreLeft', { count: pile.length - 1 })}
          </button>
        )}
        </div>
      )}
      {failed && !open && (
        <p role="alert" data-testid="review-error" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-bold text-danger">
          {t('review.failed')}
        </p>
      )}
      {items && items.length === 0 && (
        <div className="flex items-center gap-4">
          <img src="/art/robot-happy.webp" alt="" className="h-20 w-20 shrink-0 object-contain" />
          <p data-testid="review-empty" className="text-lg font-extrabold text-heading">
            {t('review.empty')}
          </p>
        </div>
      )}
      {stackOf && pile[0] && (
        <div data-testid="review-stack" className="flex w-full flex-col gap-4">
          <div key={pile[0].id} className={leaving?.id === pile[0].id ? `stack-${leaving.to}` : 'stack-in'}>
            <ReviewCard big withWho={withWho} it={pile[0]} kind={kind(pile[0])} where={where(pile[0])} busy={busy === pile[0].id} onOpen={() => setOpen(pile[0])} onZoom={setZoom} onAct={(w) => void act(pile[0], w)} />
          </div>
        </div>
      )}
      {!stackOf && items && items.length > 0 && (
        <div data-testid="review-grid" className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {items.map((it) => (
            <ReviewCard key={it.id} it={it} kind={kind(it)} where={where(it)} busy={busy === it.id} onOpen={() => setOpen(it)} onZoom={setZoom} onAct={(w) => void act(it, w)} />
          ))}
        </div>
      )}
      {/* Окна в body: блок может лежать в своём слое (плавная смена ребёнка), и окно осталось бы под шапкой и соседями */}
      {zoom && createPortal(
        <button
          type="button"
          data-testid="review-zoom"
          aria-label={t('review.close')}
          onClick={() => setZoom(null)}
          className="modal-bg fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-sm"
        >
          <img src={zoom} alt="" className="modal-in max-h-full max-w-full rounded-2xl object-contain shadow-pop" />
        </button>,
        document.body,
      )}
      {open && createPortal(<UrgentModal item={open} busy={busy === open.id} failed={failed} onClose={() => setOpen(null)} onSeen={() => void act(open, 'seen')} />, document.body)}
    </section>
  )
}

type RowProps = { it: ReviewItem; kind: string; busy: boolean; onOpen: () => void; onAct: (w: 'approve' | 'reject') => void }

/**
 * Карточка решения: сверху то, о чём решаем, крупно и целиком; причина поверх него; ниже кто и где; внизу равные кнопки.
 * Кнопки одного веса: одобрение не должно быть действием по умолчанию, особенно на «Обидных словах».
 */
function ReviewCard({ it, kind, where, busy, big = false, withWho = false, onOpen, onZoom, onAct }: RowProps & { where: string; big?: boolean; withWho?: boolean; onZoom: (url: string) => void }) {
  const { t } = useTranslation()
  const ago = agoText(it.created_at, t)
  const [reading, setReading] = useState<number | null>(null)
  const who = (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar nick={it.nick} className="h-9 w-9 shrink-0" />
      <p className="min-w-0 text-sm text-muted">
        <span data-testid="review-nick" className="block truncate text-base font-extrabold text-heading">{it.nick}</span>
        <span className="block truncate">{kind}, {where}, {ago}</span>
      </p>
    </div>
  )
  if (it.urgent) {
    return (
      <article data-testid="review-urgent" className="col-span-full flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[22px] border border-urgent-border bg-urgent-soft px-4 py-3">
        {who}
        <p data-testid="review-urgent-note" className="min-w-[200px] flex-1 text-base font-extrabold text-urgent">{t('review.urgentNote')}</p>
        <button type="button" data-testid="review-open" onClick={onOpen} className="h-11 w-full rounded-full bg-urgent px-6 text-sm font-extrabold text-primary-fg sm:w-auto">
          {t('review.open')}
        </button>
      </article>
    )
  }
  const picture = (url: string, testid?: string) => (
    <button type="button" aria-label={t('review.zoom')} onClick={() => onZoom(url)} className="h-full min-w-0 flex-1 cursor-zoom-in bg-surface">
      <img src={url} alt="" data-testid={testid} className="h-full w-full object-contain" />
    </button>
  )
  // Размытой версии нет, пока до неё не дошло, и незачем, если лицо нарисовано: одна картинка
  const blurred = nothingBlurred(it.reason_codes) ? null : it.blurred_url
  const version = (k: string, url: string, cap: string) => (
    <figure className="relative flex h-full min-w-0 flex-1 bg-surface">
      {picture(url, `review-${k}`)}
      <figcaption className="pointer-events-none absolute bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-surface px-2 py-0.5 text-xs font-bold text-heading">{cap}</figcaption>
    </figure>
  )
  return (
    <article data-testid="review-item" className={big ? 'grid gap-2 md:gap-3 lg:grid-cols-4 xl:grid-cols-5' /* сетка галереи работ под блоком: края совпадают с плитками */ : 'feed-card flex flex-col overflow-hidden rounded-[22px] border border-border bg-surface shadow-card'}>
      {reading !== null && createPortal(<StoryReview id={reading} onClose={() => setReading(null)} />, document.body)}
      <div className={`relative flex bg-primary-soft ${big ? 'h-[34dvh] min-h-[220px] overflow-hidden rounded-[22px] border border-border shadow-card lg:col-span-2 lg:aspect-square lg:h-auto xl:col-span-3 xl:aspect-[3/2]' : 'h-44'}`}>
        {big && it.original_url && blurred ? (
          <CompareSlider original={it.original_url} blurred={blurred} onZoom={onZoom} />
        ) : it.original_url ? (
          <div data-testid="review-pair" className="flex h-full w-full gap-0.5">
            {blurred ? (
              <>
                {version('original', it.original_url, t('cab.upload.original'))}
                {version('blurred', blurred, t('cab.upload.blurred'))}
              </>
            ) : (
              picture(it.original_url, 'review-original')
            )}
          </div>
        ) : it.image_url ? (
          picture(it.image_url)
        ) : it.story_id ? (
          <button type="button" data-testid="review-story-open" onClick={() => setReading(it.story_id ?? null)} className="m-auto flex flex-col items-center gap-2 px-4 text-center font-extrabold text-primary">
            <img src="/art/tab-tasks.webp" alt="" className="h-14 w-14 object-contain" />
            {t('review.readStory')}
          </button>
        ) : (
          <p data-testid="review-text" className="m-auto line-clamp-5 break-words px-5 text-center text-lg font-bold leading-6 text-heading">
            «{it.preview_text}»
          </p>
        )}
      </div>
      {big ? (
        <div className="mt-2 flex min-w-0 flex-col gap-1 lg:col-span-2 lg:mt-0">
          <p data-testid="review-reason" className="text-2xl font-black leading-7 tracking-tight text-heading">{reasonKeys(it.reason_codes).map((k) => t(k)).join(', ')}</p>
          {it.image_url && it.preview_text && <p className="line-clamp-2 break-words text-sm text-text">«{it.preview_text}»</p>}
          {withWho ? <div className="mt-1">{who}</div> : <p className="text-sm font-semibold text-muted">{kind}, {where}, {ago}</p>}
          {/* Что значат кнопки: без этой строки взрослый не знает, что решает */}
          <p data-testid="review-effect" className="mt-2 text-base font-semibold leading-6 text-text">{t(effectKey(it))}</p>
          {/* Кнопки одного веса внизу колонки, по нижнему краю картинки: одобрение не должно быть действием по умолчанию */}
          <div className="mt-4 grid grid-cols-2 gap-2 md:gap-3 lg:mt-auto lg:pt-4">
            <button type="button" data-testid="review-reject" disabled={busy} className={`${btnReject} h-14 text-base md:text-lg`} onClick={() => onAct('reject')}>{t('review.reject')}</button>
            <button type="button" data-testid="review-approve" disabled={busy} className={`${btnApprove} h-14 text-base md:text-lg`} onClick={() => onAct('approve')}>{t('review.approve')}</button>
          </div>
        </div>
      ) : (
      <div className="flex flex-1 flex-col gap-2.5 p-3">
        <p className="flex flex-wrap gap-1.5">
          {reasonKeys(it.reason_codes).map((k) => (
            <span key={k} data-testid="review-reason" className="rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-extrabold text-danger">{t(k)}</span>
          ))}
        </p>
        {it.image_url && it.preview_text && <p className="line-clamp-2 break-words text-sm text-text">«{it.preview_text}»</p>}
        {who}
        <p data-testid="review-effect" className="mt-auto text-xs text-muted">{t(effectKey(it))}</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" data-testid="review-reject" disabled={busy} className={`${btnReject} h-11`} onClick={() => onAct('reject')}>{t('review.reject')}</button>
          <button type="button" data-testid="review-approve" disabled={busy} className={`${btnApprove} h-11`} onClick={() => onAct('approve')}>{t('review.approve')}</button>
        </div>
      </div>
      )}
    </article>
  )
}

/** Сравнение одной картинкой: двигаешь ползунок и видишь, что скрыто. Ползунок настоящий: работает пальцем и с клавиатуры. */
function CompareSlider({ original, blurred, onZoom }: { original: string; blurred: string; onZoom: (url: string) => void }) {
  const { t } = useTranslation()
  const [at, setAt] = useState(50)
  const tag = 'pointer-events-none absolute top-2 z-10 rounded-full bg-surface px-3 py-1 text-sm font-extrabold text-heading shadow-card'
  return (
    <div data-testid="review-pair" className="relative h-full w-full bg-surface">
      <img src={blurred} alt="" data-testid="review-blurred" className="absolute inset-0 h-full w-full object-contain" />
      <img src={original} alt="" data-testid="review-original" style={{ clipPath: `inset(0 ${100 - at}% 0 0)` }} className="absolute inset-0 h-full w-full bg-surface object-contain" />
      <span className={`${tag} left-2`}>{t('cab.upload.original')}</span>
      <span className={`${tag} right-2`}>{t('cab.upload.blurred')}</span>
      <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-primary" style={{ left: `${at}%` }}>
        <span className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-fg shadow-pop">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 7-5 5 5 5M15 7l5 5-5 5" />
          </svg>
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={at}
        data-testid="review-slider"
        aria-label={`${t('cab.upload.original')} / ${t('cab.upload.blurred')}`}
        onChange={(e) => setAt(Number(e.target.value))}
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
      <button type="button" data-testid="review-zoom-open" aria-label={t('review.zoom')} title={t('review.zoom')} onClick={() => onZoom(original)} className="absolute bottom-2 right-2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-heading shadow-card">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5M11 8.5v5M8.5 11h5" />
        </svg>
      </button>
    </div>
  )
}

/** Сказка целиком для взрослого: всё, что написано, и всё, что уже нарисовано, чтобы решать не вслепую. */
function StoryReview({ id, onClose }: { id: number; onClose: () => void }) {
  const { t } = useTranslation()
  const [story, setStory] = useState<Story | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    loadStory(id).then((s) => alive && setStory(s)).catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [id])
  return (
    <div data-testid="review-story" role="dialog" aria-modal="true" className="modal-bg fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-scrim p-4 backdrop-blur-sm">
      <div className="modal-in my-auto flex w-full max-w-3xl flex-col gap-3 rounded-card bg-surface p-5 shadow-pop">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold text-heading">{story?.title ?? t('review.readStory')}</h2>
          <button type="button" data-testid="review-story-close" onClick={onClose} className={btnSide}>{t('review.close')}</button>
        </div>
        {failed && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-bold text-danger">{t('review.modalFailed')}</p>}
        {story?.idea && <p className="text-sm text-muted">{t('review.storyIdea', { text: story.idea })}</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {story?.pages.map((p) => (
            <div key={p.n} data-testid="review-story-page" className="flex flex-col gap-2 rounded-2xl bg-primary-soft p-2">
              {p.image_url ? <img src={p.image_url} alt="" className="aspect-square w-full rounded-xl object-cover" /> : <div className="flex aspect-square items-center justify-center rounded-xl bg-surface p-3 text-center text-sm font-bold text-muted">{t('review.storyNoImage')}</div>}
              <p className="px-1 pb-1 text-sm font-bold text-heading">{p.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function UrgentModal({
  item,
  busy,
  failed,
  onClose,
  onSeen,
}: {
  item: ReviewItem
  busy: boolean
  failed: boolean
  onClose: () => void
  onSeen: () => void
}) {
  const { t } = useTranslation()
  const [full, setFull] = useState<ReviewItem | null>(null)
  const [error, setError] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    api<ReviewItem>(`/api/review/items/${item.id}`)
      .then((r) => alive && setFull(r))
      .catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [item.id, tick])
  return (
    <div className="modal-bg fixed inset-0 z-50 flex items-center justify-center bg-scrim backdrop-blur-sm p-4" role="dialog" aria-modal="true" data-testid="review-modal">
      <div className="modal-in flex max-h-full w-full max-w-md flex-col gap-3 overflow-y-auto rounded-card border border-urgent-border bg-surface p-5 shadow-card">
        <p className="font-extrabold text-urgent">{t('review.urgentNote')}</p>
        <p className="text-sm font-extrabold text-heading">
          {item.nick} · {t(`review.types.${item.item_type}`)}
        </p>
        {error ? (
          <div role="alert" data-testid="review-modal-error" className="flex flex-col items-start gap-2 rounded-2xl bg-danger-soft p-3 text-sm font-bold text-danger">
            {t('review.modalFailed')}
            <button type="button" data-testid="review-modal-retry" className={btnSide} onClick={() => {
                setError(false)
                setTick((n) => n + 1)
              }}>
              {t('review.retry')}
            </button>
          </div>
        ) : (
          <>
            {full?.image_url && <img data-testid="review-modal-image" src={full.image_url} alt="" className="max-h-64 w-full rounded-2xl object-contain" />}
            <p data-testid="review-modal-text" className="break-words rounded-2xl bg-urgent-soft p-3 text-text">
              {full ? (full.preview_text ?? '') : t('review.loading')}
            </p>
          </>
        )}
        {failed && (
          <p role="alert" data-testid="review-modal-failed" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-bold text-danger">
            {t('review.failed')}
          </p>
        )}
        <p className="text-sm text-muted">{t('review.urgentHint')}</p>
        <div className="flex gap-2">
          <button type="button" data-testid="review-seen" disabled={busy || !full || error} className={btnMain} onClick={onSeen}>
            {t('review.seen')}
          </button>
          <button type="button" className={btnSide} onClick={onClose}>
            {t('review.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
