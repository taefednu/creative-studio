import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, api } from '../api'
import { REACTIONS, byStyle, cardRatio, feedUrl, toColumns } from '../features/feed/feed'
import type { FeedKind, FeedPage, Post } from '../features/feed/feed'
import type { TemplateInfo } from '../features/works/works'
import Avatar from './Avatar'
import ChipSelect from './ChipSelect'
import PostModal from './PostModal'
import TeacherTask from './TeacherTask'

type Props = {
  kinds: FeedKind[]
  classId?: number
  title?: string
  /** Лента ребёнка: строка задания, фильтр по стилям и место под панель создания. */
  child?: { templates: TemplateInfo[]; onStyle: (id: string) => void }
  /** Витрина для гостя: та же сетка, но без строки задания, комментариев и реакций. */
  guest?: boolean
}

/** Первые ряды грузим сразу, остальные при подходе к экрану; картинка проявляется, а не выскакивает. */
function CardImage({ src, alt, eager, className }: { src: string; alt: string; eager: boolean; className: string }) {
  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={`feed-img ${className}`}
      onLoad={(e) => e.currentTarget.classList.add('feed-img-on')}
    />
  )
}

// Ширина экрана → число колонок, снизу вверх: как брейкпоинты md, lg, xl
const COLUMN_STEPS: [number, number][] = [[768, 3], [1024, 5], [1280, 6]]
const columnCount = () => COLUMN_STEPS.reduce((n, [w, c]) => (window.innerWidth >= w ? c : n), 2)

function useColumnCount() {
  const [count, setCount] = useState(columnCount)
  useEffect(() => {
    const onResize = () => setCount(columnCount())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return count
}

/** Лента (docs/design/feed.jpg): «кирпичная» сетка, клик по карточке — работа поверх. Новые страницы подгружаются при прокрутке. */
export default function FeedView({ kinds, classId, title, child, guest }: Props) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<FeedKind>(kinds[0])
  const [page, setPage] = useState<{ key: string; items: Post[]; cursor: number | null } | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [style, setStyle] = useState('')
  const key = `${kind}:${classId ?? ''}`

  useEffect(() => {
    let alive = true
    api<FeedPage>(feedUrl(kind, classId))
      .then((p) => alive && setPage({ key, items: p.items, cursor: p.next_cursor }))
      .catch(() => alive && setPage({ key, items: [], cursor: null }))
    return () => {
      alive = false
    }
  }, [kind, classId, key])

  const loaded = page?.key === key
  const items = loaded ? page.items : []
  const cursor = loaded ? page.cursor : null
  const shown = byStyle(items, style)

  const count = useColumnCount()
  const loading = useRef(false)
  const moreRef = useRef<HTMLButtonElement>(null)

  const more = useCallback(async () => {
    if (loading.current) return
    loading.current = true
    try {
      const p = await api<FeedPage>(feedUrl(kind, classId, cursor))
      setPage((x) => (x?.key === key ? { ...x, items: [...x.items, ...p.items], cursor: p.next_cursor } : x))
    } catch {
      // кнопка остаётся: ребёнок может нажать ещё раз
    } finally {
      loading.current = false
    }
  }, [kind, classId, cursor, key])

  useEffect(() => {
    const el = moreRef.current
    if (!el) return
    const io = new IntersectionObserver((e) => e[0].isIntersecting && void more(), { rootMargin: '800px' })
    io.observe(el)
    return () => io.disconnect()
  }, [more])

  const close = useCallback(() => setOpen(null), [])

  // Обновляем только изменённый пост: перезагрузка ленты вернула бы её к первой странице и сбила прокрутку
  async function refreshPost(id: number) {
    const drop = (x: typeof page) => x && { ...x, items: x.items.filter((p) => p.id !== id) }
    try {
      const fresh = await api<Post>(`/api/posts/${id}`)
      setPage((x) => x && { ...x, items: x.items.map((p) => (p.id === id ? fresh : p)) })
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setPage(drop)
    }
  }

  return (
    <div className={child ? 'pb-[110px] md:pb-[125px] lg:pb-[150px]' : ''}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 md:flex-nowrap">
        <div className="order-1 mt-1 md:mt-0">
          <h1 data-testid="feed-title" className="w-fit text-3xl font-extrabold leading-9 text-heading md:text-[44px] md:leading-[42px]">
            {title ?? t(`feed.title.${kind}`)}
          </h1>
        </div>
        {kinds.length > 1 && (
          <div className="order-3 flex max-w-full basis-full gap-2 overflow-x-auto md:order-2 md:basis-auto md:gap-1.5" role="tablist">
            {kinds.map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                data-testid={`feed-${k}`}
                onClick={() => setKind(k)}
                className={`h-10 whitespace-nowrap shrink-0 rounded-full px-4 text-sm s380:px-[26px] font-extrabold md:h-[45px] md:px-9 md:text-base ${
                  kind === k ? 'bg-primary text-primary-fg shadow-card' : 'border border-border bg-surface text-heading shadow-card'
                }`}
              >
                {t(`feed.tab.${k}`)}
              </button>
            ))}
          </div>
        )}
        {child && (
          <ChipSelect
            testid="style-filter"
            label={t('panel.styleFilter')}
            value={style}
            onChange={(v) => {
              setStyle(v)
              if (v) child.onStyle(v)
            }}
            options={[
              { value: '', label: t('panel.allStyles') },
              ...child.templates.map((x) => ({ value: x.id, label: t(`templates.${x.id}`), thumb: x.image_url })),
            ]}
            className="order-2 ml-auto h-10 w-[124px] md:order-3 md:h-[45px] md:w-[156px]"
          />
        )}
      </div>
      {child && !guest && (
        <div className="mt-3 empty:hidden">
          <TeacherTask start />
        </div>
      )}
      {loaded && items.length === 0 && (
        <p data-testid="feed-empty" className="mt-6 text-text">
          {t('feed.empty')}
        </p>
      )}
      {loaded && items.length > 0 && shown.length === 0 && cursor === null && (
        <p data-testid="feed-filter-empty" className="mt-6 text-text">
          {t('panel.noStyleMatch')}
        </p>
      )}
      <div data-testid="feed-grid" className="mt-3 flex items-start gap-2">
        {toColumns(shown, count).map((col, c) => (
        <div key={c} className="flex min-w-0 flex-1 flex-col gap-2">
        {col.map((p, row) =>
          !child ? (
            <button
              key={p.id}
              type="button"
              data-testid="post-card"
              data-post-id={p.id}
              onClick={() => setOpen(p.id)}
              className="feed-card block w-full overflow-hidden rounded-card border border-border bg-primary-soft text-left shadow-card"
            >
              <CardImage src={`${p.image_url}?thumb=1`} alt={p.caption ?? ''} eager={row < 3} className="w-full object-cover" />
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
          ) : (
          <button
            key={p.id}
            type="button"
            data-testid="post-card"
              data-post-id={p.id}
            aria-label={p.caption ? `${p.nick}: ${p.caption}` : p.nick}
            title={p.nick}
            onClick={() => setOpen(p.id)}
            style={{ aspectRatio: cardRatio(p.id), animationDelay: row < 2 ? `${(row * count + c) * 40}ms` : undefined }}
            className="feed-card group relative block w-full overflow-hidden rounded-[22px] bg-primary-soft text-left shadow-card"
          >
            <CardImage src={`${p.image_url}?thumb=1`} alt={p.caption ?? ''} eager={row < 3} className="h-full w-full object-cover group-hover:scale-105" />
            {p.status === 'held' && !p.support && (
              <span className="absolute inset-x-2 top-2 rounded-xl bg-scrim px-3 py-1.5 text-xs font-bold text-primary-fg">
                {t('feed.heldMark')}
              </span>
            )}
            {p.story && (
              <span data-testid="card-book" className="absolute left-2 top-2 rounded-full bg-surface px-2.5 py-1 text-xs font-extrabold text-primary shadow-card">
                {t('story.book')}
              </span>
            )}
            <Avatar nick={p.nick} className="absolute bottom-2 left-2 h-9 w-9" />
            <span
              data-testid="card-heart"
             
              className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-scrim px-3 py-1 text-sm font-extrabold text-primary-fg"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-heart" fill="currentColor" aria-hidden="true">
                <path d="M12 21s-8-5.2-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 5.800-8 11-8 11z" />
              </svg>
              {p.reactions.heart}
            </span>
          </button>
          ),
        )}
        </div>
        ))}
      </div>
      {cursor !== null && (
        <button
          ref={moreRef}
          type="button"
          data-testid="feed-more"
          onClick={() => void more()}
          className="mt-2 rounded-full border border-border bg-surface px-6 py-2 font-extrabold text-heading"
        >
          {t('feed.more')}
        </button>
      )}
      {open !== null && <PostModal postId={open} isChild={!!child} guest={guest} onClose={close} onChanged={() => void refreshPost(open)} />}
    </div>
  )
}
