import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { agoText, filterByClass, notifyReview, reasonKeys } from '../features/review/review'
import type { ReviewItem } from '../features/review/review'
import Avatar from './Avatar'

const btnMain =
  'rounded-full bg-primary px-5 py-2 text-sm font-extrabold uppercase text-primary-fg disabled:opacity-50'
const btnSide =
  'rounded-full border border-border bg-surface px-5 py-2 text-sm font-extrabold text-heading disabled:opacity-50'

/**
 * «Задержано» (учитель) и «Ждёт вашего OK» (родитель): один компонент, фильтр по роли на сервере.
 * compact — узкая колонка кабинета родителя; classFilter — фильтр учителя по имени класса.
 */
export default function ReviewQueue({
  title,
  compact = false,
  classFilter = null,
}: {
  title?: string
  compact?: boolean
  classFilter?: string | null
}) {
  const { t } = useTranslation()
  const [all, setItems] = useState<ReviewItem[] | null>(null)
  const items = all && filterByClass(all, classFilter)
  const [open, setOpen] = useState<ReviewItem | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)

  const load = useCallback(() => {
    api<ReviewItem[]>('/api/review/queue')
      .then(setItems)
      .catch(() => {})
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

  const thumb = (it: ReviewItem) => {
    const size = compact ? 'h-20 w-24' : 'h-[90px] w-full xl:h-20 xl:w-[200px]'
    if (it.urgent) {
      return (
        <button
          type="button"
          data-testid="review-open"
          onClick={() => setOpen(it)}
          className={`flex items-center justify-center rounded-2xl border border-urgent-border bg-surface text-sm font-extrabold uppercase text-urgent ${size}`}
        >
          <span className="flex flex-col items-center gap-1">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            {t('review.open')}
          </span>
        </button>
      )
    }
    if (it.original_url) {
      const pair: [string, string | null | undefined, string][] = [
        ['original', it.original_url, t('cab.upload.original')],
        ['blurred', it.blurred_url, t('cab.upload.blurred')],
      ]
      return (
        <div className={`flex gap-1 ${compact ? 'w-24' : 'w-full xl:w-[200px]'}`} data-testid="review-pair">
          {pair
            .filter(([, url]) => url || !compact)
            .map(([k, url, cap]) => (
              <figure key={k} className="min-w-0 flex-1 text-center">
                {url ? (
                  <img src={url} alt="" data-testid={`review-${k}`} className="h-20 w-full rounded-lg object-contain bg-primary-soft xl:h-16" />
                ) : (
                  <div data-testid={`review-${k}-none`} className="flex h-20 items-center justify-center rounded-lg bg-primary-soft px-1 text-[10px] font-bold text-muted xl:h-16">
                    {t('cab.upload.noBlur')}
                  </div>
                )}
                <figcaption className="text-[11px] text-muted">{cap}</figcaption>
              </figure>
            ))}
        </div>
      )
    }
    if (it.image_url) return <img src={it.image_url} alt="" className={`rounded-2xl object-contain bg-primary-soft ${size}`} />
    return (
      <div className={`flex items-center rounded-2xl bg-primary-soft p-3 text-sm font-bold text-heading ${compact ? 'h-20 w-24' : 'h-24 xl:h-20 xl:w-[200px]'}`}>
        <span className="line-clamp-3 break-words">{it.preview_text}</span>
      </div>
    )
  }

  const kind = (it: ReviewItem) => t(`review.types.${it.item_type}`)

  return (
    <section id="review" data-testid="review" className="flex flex-col gap-3">
      {title && (
        <h2 className="flex items-center gap-2 text-2xl font-extrabold text-heading">
          {title}
          {items !== null && items.length > 0 && (
            <span data-testid="review-count" className="rounded-full bg-primary px-3 py-0.5 text-sm text-primary-fg">
              {items.length}
            </span>
          )}
        </h2>
      )}
      {failed && !open && (
        <p role="alert" data-testid="review-error" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-bold text-danger">
          {t('review.failed')}
        </p>
      )}
      {items && items.length === 0 && (
        <div className={compact ? '' : 'flex items-center gap-4 rounded-card border border-border bg-surface p-4 shadow-card'}>
          {!compact && <img src="/art/robot-happy.webp" alt="" className="h-24 w-24 shrink-0 object-contain" />}
          <p data-testid="review-empty" className={compact ? 'text-muted' : 'text-lg font-extrabold text-heading'}>
            {t('review.empty')}
          </p>
        </div>
      )}
      {(compact ? items?.slice(0, 2) : items)?.map((it) => (
        <article
          key={it.id}
          data-testid={it.urgent ? 'review-urgent' : 'review-item'}
          className={`grid items-center gap-3 rounded-card border p-3 shadow-card ${
            compact
              ? 'grid-cols-[auto_1fr_auto]'
              : 'xl:grid-cols-[200px_auto_minmax(0,1fr)_auto_auto] xl:gap-4 xl:px-3 xl:py-2'
          } ${it.urgent ? 'border-urgent-border bg-urgent-soft' : 'border-border bg-surface'}`}
        >
          {thumb(it)}
          {!compact && <Avatar nick={it.nick} className="hidden h-12 w-12 xl:block" />}
          <div className="flex min-w-0 flex-col gap-1">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span data-testid="review-nick" className="text-lg font-extrabold text-heading">
                {it.nick}
              </span>
              <span className="text-xs font-extrabold uppercase text-primary">{kind(it)}</span>
            </p>
            {it.urgent ? (
              <p data-testid="review-urgent-note" className="font-extrabold text-urgent">
                {t('review.urgentNote')}
              </p>
            ) : (
              <>
                {it.image_url && it.preview_text && (
                  <p className="line-clamp-2 break-words text-sm text-text">{it.preview_text}</p>
                )}
                <p className="flex flex-wrap gap-2">
                  {reasonKeys(it.reason_codes).map((k) => (
                    <span key={k} data-testid="review-reason" className="rounded-full bg-danger-soft px-3 py-1 text-xs font-bold text-danger">
                      {t(k)}
                    </span>
                  ))}
                </p>
              </>
            )}
            {compact && (
              <span className="text-xs text-muted">{agoText(it.created_at, t)}</span>
            )}
          </div>
          {!compact && (
            <span className="whitespace-nowrap text-sm text-muted xl:text-base">
              {where(it)} · {agoText(it.created_at, t)}
            </span>
          )}
          {!it.urgent && (
            <div className={compact ? 'flex flex-col gap-2' : 'grid grid-cols-2 gap-2 xl:flex xl:gap-2'}>
              <button type="button" data-testid="review-approve" disabled={busy === it.id} className={`${btnMain} ${compact ? '' : 'h-12 xl:h-11 xl:w-[130px]'}`} onClick={() => void act(it, 'approve')}>
                {t('review.approve')}
              </button>
              <button type="button" data-testid="review-reject" disabled={busy === it.id} className={`${btnSide} ${compact ? '' : 'h-12 xl:h-11 xl:w-[120px]'}`} onClick={() => void act(it, 'reject')}>
                {t('review.reject')}
              </button>
            </div>
          )}
        </article>
      ))}
      {compact && items && items.length > 2 && (
        <Link to="/parent/review" data-testid="review-all" className="self-start text-sm font-extrabold text-primary underline">
          {t('cab.allReview', { count: items.length })}
        </Link>
      )}
      {open && <UrgentModal item={open} busy={busy === open.id} failed={failed} onClose={() => setOpen(null)} onSeen={() => void act(open, 'seen')} />}
    </section>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim backdrop-blur-sm p-4" role="dialog" aria-modal="true" data-testid="review-modal">
      <div className="flex max-h-full w-full max-w-md flex-col gap-3 overflow-y-auto rounded-card border border-urgent-border bg-surface p-5 shadow-card">
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
