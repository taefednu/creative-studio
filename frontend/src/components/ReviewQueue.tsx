import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import { agoText, notifyReview, reasonKeys } from '../features/review/review'
import type { ReviewItem } from '../features/review/review'

const btnMain =
  'rounded-full bg-primary px-5 py-2 text-sm font-extrabold uppercase text-primary-fg disabled:opacity-50'
const btnSide =
  'rounded-full border border-border bg-surface px-5 py-2 text-sm font-extrabold text-heading disabled:opacity-50'

/** «Задержано» (учитель) и «Ждёт вашего OK» (родитель): один компонент, фильтр на сервере. */
export default function ReviewQueue({ title }: { title: string }) {
  const { t, i18n } = useTranslation()
  const [items, setItems] = useState<ReviewItem[] | null>(null)
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

  return (
    <section id="review" data-testid="review" className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-2xl font-extrabold text-heading">
        {title}
        {items !== null && items.length > 0 && (
          <span
            data-testid="review-count"
            className="rounded-full bg-primary px-3 py-0.5 text-sm text-primary-fg"
          >
            {items.length}
          </span>
        )}
      </h2>
      {failed && (
        <p role="alert" data-testid="review-error" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-bold text-danger">
          {t('review.failed')}
        </p>
      )}
      {items && items.length === 0 && (
        <p data-testid="review-empty" className="text-muted">
          {t('review.empty')}
        </p>
      )}
      {items?.map((it) => (
        <article
          key={it.id}
          data-testid={it.urgent ? 'review-urgent' : 'review-item'}
          className={`grid items-center gap-3 rounded-card border p-3 shadow-card md:grid-cols-[9rem_1fr_auto] ${
            it.urgent ? 'border-urgent-border bg-urgent-soft' : 'border-border bg-surface'
          }`}
        >
          {it.urgent ? (
            <button
              type="button"
              data-testid="review-open"
              onClick={() => setOpen(it)}
              className="flex h-20 items-center justify-center rounded-2xl border border-urgent-border bg-surface text-sm font-extrabold uppercase text-urgent md:h-24"
            >
              {t('review.open')}
            </button>
          ) : it.image_url ? (
            <img src={it.image_url} alt="" className="h-24 w-full rounded-2xl object-cover md:w-36" />
          ) : (
            <div className="flex h-24 items-center rounded-2xl bg-primary-soft p-3 text-sm font-bold text-heading">
              <span className="line-clamp-3 break-words">{it.preview_text}</span>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span data-testid="review-nick" className="text-lg font-extrabold text-heading">
                {it.nick}
              </span>
              <span className="text-xs font-extrabold uppercase text-primary">
                {t(`review.types.${it.item_type}`)}
              </span>
              <span className="text-xs text-muted">
                {where(it)} · {agoText(it.created_at, i18n.language, t('review.now'))}
              </span>
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
          </div>
          <div className="flex gap-2">
            {it.urgent ? (
              <button type="button" className={btnMain} onClick={() => setOpen(it)}>
                {t('review.open')}
              </button>
            ) : (
              <>
                <button type="button" data-testid="review-approve" disabled={busy === it.id} className={btnMain} onClick={() => void act(it, 'approve')}>
                  {t('review.approve')}
                </button>
                <button type="button" data-testid="review-reject" disabled={busy === it.id} className={btnSide} onClick={() => void act(it, 'reject')}>
                  {t('review.reject')}
                </button>
              </>
            )}
          </div>
        </article>
      ))}
      {open && <UrgentModal item={open} busy={busy === open.id} onClose={() => setOpen(null)} onSeen={() => void act(open, 'seen')} />}
    </section>
  )
}

function UrgentModal({
  item,
  busy,
  onClose,
  onSeen,
}: {
  item: ReviewItem
  busy: boolean
  onClose: () => void
  onSeen: () => void
}) {
  const { t } = useTranslation()
  const [full, setFull] = useState<ReviewItem | null>(null)
  useEffect(() => {
    api<ReviewItem>(`/api/review/items/${item.id}`)
      .then(setFull)
      .catch(() => {})
  }, [item.id])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-heading/40 p-4" role="dialog" aria-modal="true" data-testid="review-modal">
      <div className="flex w-full max-w-md flex-col gap-3 rounded-card border border-urgent-border bg-surface p-5 shadow-card">
        <p className="font-extrabold text-urgent">{t('review.urgentNote')}</p>
        <p className="text-sm font-extrabold text-heading">
          {item.nick} · {t(`review.types.${item.item_type}`)}
        </p>
        <p data-testid="review-modal-text" className="break-words rounded-2xl bg-urgent-soft p-3 text-text">
          {full?.preview_text ?? '…'}
        </p>
        <p className="text-sm text-muted">{t('review.urgentHint')}</p>
        <div className="flex gap-2">
          <button type="button" data-testid="review-seen" disabled={busy} className={btnMain} onClick={onSeen}>
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
