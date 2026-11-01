import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import { REACTIONS, feedUrl } from '../features/feed/feed'
import type { FeedKind, FeedPage, Post } from '../features/feed/feed'
import PostModal from './PostModal'

type Props = { kinds: FeedKind[]; classId?: number; title?: string }

/** Лента (docs/design/feed.jpg): «кирпичная» сетка в CSS-колонках, клик по карточке — работа поверх. */
export default function FeedView({ kinds, classId, title }: Props) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<FeedKind>(kinds[0])
  const [page, setPage] = useState<{ key: string; items: Post[]; cursor: number | null } | null>(null)
  const [tick, setTick] = useState(0)
  const [open, setOpen] = useState<number | null>(null)
  const key = `${kind}:${classId ?? ''}`

  useEffect(() => {
    let alive = true
    api<FeedPage>(feedUrl(kind, classId))
      .then((p) => alive && setPage({ key, items: p.items, cursor: p.next_cursor }))
      .catch(() => alive && setPage({ key, items: [], cursor: null }))
    return () => {
      alive = false
    }
  }, [kind, classId, key, tick])

  const loaded = page?.key === key
  const items = loaded ? page.items : []
  const cursor = loaded ? page.cursor : null

  async function more() {
    const p = await api<FeedPage>(feedUrl(kind, classId, cursor))
    setPage((x) => x && { ...x, items: [...x.items, ...p.items], cursor: p.next_cursor })
  }

  const close = useCallback(() => setOpen(null), [])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-extrabold text-heading md:text-[44px] md:leading-[50px]">
          {title ?? t(`feed.title.${kind}`)}
        </h1>
        {kinds.length > 1 && (
          <div className="flex gap-2" role="tablist">
            {kinds.map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                data-testid={`feed-${k}`}
                onClick={() => setKind(k)}
                className={`rounded-full px-5 py-2 text-sm font-extrabold md:text-base ${
                  kind === k ? 'bg-primary text-primary-fg' : 'border border-border bg-surface text-heading'
                }`}
              >
                {t(`feed.tab.${k}`)}
              </button>
            ))}
          </div>
        )}
      </div>
      {loaded && items.length === 0 && (
        <p data-testid="feed-empty" className="mt-6 text-text">
          {t('feed.empty')}
        </p>
      )}
      <div data-testid="feed-grid" className="mt-4 columns-2 gap-3 md:columns-4 xl:columns-5">
        {items.map((p) => (
          <button
            key={p.id}
            type="button"
            data-testid="post-card"
            onClick={() => setOpen(p.id)}
            className="mb-3 block w-full break-inside-avoid overflow-hidden rounded-card border border-border bg-surface text-left shadow-card"
          >
            <img src={p.image_url} alt={p.caption ?? ''} className="w-full object-cover" loading="lazy" />
            <div className="px-3 py-2">
              <p className="truncate text-sm font-extrabold text-heading">{p.nick}</p>
              {p.caption && <p className="text-sm text-text">{p.caption}</p>}
              <div className="mt-1 flex flex-wrap gap-x-3 text-sm font-bold text-heading">
                {REACTIONS.map((r) => (
                  <span key={r.key} data-testid={`card-${r.key}`}>
                    <span aria-hidden="true">{r.emoji}</span> {p.reactions[r.key]}
                  </span>
                ))}
              </div>
            </div>
          </button>
        ))}
      </div>
      {cursor !== null && (
        <button
          type="button"
          data-testid="feed-more"
          onClick={() => void more()}
          className="mt-2 rounded-full border border-border bg-surface px-6 py-2 font-extrabold text-heading"
        >
          {t('feed.more')}
        </button>
      )}
      {open !== null && <PostModal postId={open} onClose={close} onChanged={() => setTick((n) => n + 1)} />}
    </div>
  )
}
