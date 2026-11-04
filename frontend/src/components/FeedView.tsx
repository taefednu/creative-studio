import LoadFailed from './LoadFailed'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError, api } from '../api'
import { byStyle, captionOf, cardRatio, feedUrl, toColumns } from '../features/feed/feed'
import type { FeedKind, FeedPage, Post } from '../features/feed/feed'
import type { TemplateInfo } from '../features/works/works'
import Avatar from './Avatar'
import FeedImage, { Skeleton } from './FeedImage'
import ChipSelect from './ChipSelect'
import PostModal from './PostModal'

export type FeedHead = { id: string; label: string; active: boolean; onPick: () => void; count?: number }

type Props = {
  kinds: FeedKind[]
  classId?: number
  title?: string
  /** Учитель: шапка переключает классы вместо вкладок ленты. Пустой список: классы ещё грузятся. */
  classes?: FeedHead[]
  /** Работы одного ребёнка внутри кабинета родителя: без своей шапки. */
  nick?: string
  /** Лента ребёнка: фильтр по стилям и место под панель создания. */
  child?: { templates: TemplateInfo[]; onStyle: (id: string) => void }
  /** Витрина для гостя: та же сетка, но без комментариев и реакций. */
  guest?: boolean
}

// Ширина экрана → число колонок, снизу вверх: как брейкпоинты md, lg, xl
const COLUMN_STEPS: [number, number][] = [[768, 3], [1024, 5], [1280, 6]]
const columnCount = () => COLUMN_STEPS.reduce((n, [w, c]) => (window.innerWidth >= w ? c : n), 2)

// Дальше подгрузка только по кнопке: иначе до подвала не дойти
const AUTO_LOAD_MAX = 60

function useColumnCount() {
  const [count, setCount] = useState(columnCount)
  useEffect(() => {
    const onResize = () => setCount(columnCount())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return count
}

const GHOST_ROWS = 4

const HEAD_CLS = 'whitespace-nowrap text-2xl font-black leading-10 tracking-tight md:text-5xl md:leading-[56px]'

/** Заголовок экрана крупными словами: один — просто заголовок, несколько — переключатель. Лента и задания. */
export function BigHeads({ heads, Title = 'h1' }: { heads: FeedHead[]; Title?: 'h1' | 'h2' }) {
  if (heads.length === 1) return <Title data-testid="feed-title" className={`${HEAD_CLS} text-heading`}>{heads[0].label}</Title>
  return (
    <>
      <Title data-testid="feed-title" className="sr-only">{heads.find((x) => x.active)?.label}</Title>
      <div className="flex min-w-0 gap-3 overflow-x-auto [scrollbar-width:none] md:gap-8" role="tablist">
        {heads.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={x.active}
            data-testid={`feed-${x.id}`}
            onClick={x.onPick}
            className={`${HEAD_CLS} shrink-0 transition-colors ${x.active ? 'text-heading' : 'text-muted hover:text-heading'}`}
          >
            {x.label}
            {!!x.count && <span data-testid={`feed-${x.id}-count`} className="ml-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-danger px-1.5 align-middle text-xs font-extrabold leading-none tracking-normal text-primary-fg md:h-7 md:min-w-7 md:text-sm">{x.count}</span>}
          </button>
        ))}
      </div>
    </>
  )
}

/** Экран до ответа о ребёнке: те же места, что займёт лента, и заголовок той же высоты. */
export function FeedSkeleton() {
  const count = useColumnCount()
  return (
    <div data-testid="feed-skeleton" aria-hidden="true">
      <div className="flex h-10 items-center md:h-14">
        <Skeleton className="block h-9 w-[220px] rounded-full" />
      </div>
      <div className="mt-2 flex items-start gap-2 lg:gap-3">
        {toColumns(Array.from({ length: count * GHOST_ROWS }, (_, i) => i), count).map((col, c) => (
          <div key={c} className="flex min-w-0 flex-1 flex-col gap-2 lg:gap-3">
            {col.map((i) => (
              <Skeleton key={i} className="block rounded-card" style={{ aspectRatio: cardRatio(i + 1) }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Лента (docs/design/feed.jpg): «кирпичная» сетка, клик по карточке — работа поверх. Новые страницы подгружаются при прокрутке. */
export default function FeedView({ kinds, classId, title, classes, nick, child, guest }: Props) {
  const { t, i18n } = useTranslation()
  const [kind, setKind] = useState<FeedKind>(kinds[0])
  const [page, setPage] = useState<{ key: string; items: Post[]; cursor: number | null; failed?: boolean } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [open, setOpen] = useState<number | null>(null)
  const [style, setStyle] = useState('')
  const key = `${kind}:${classId ?? ''}`

  useEffect(() => {
    let alive = true
    api<FeedPage>(feedUrl(kind, classId))
      .then((p) => alive && setPage({ key, items: p.items, cursor: p.next_cursor }))
      .catch(() => alive && setPage({ key, items: [], cursor: null, failed: true }))
    return () => {
      alive = false
    }
  }, [kind, classId, key, attempt])

  const loaded = page?.key === key
  const items = (loaded ? page.items : []).filter((p) => !nick || p.nick === nick)
  const cursor = loaded ? page.cursor : null
  const shown = byStyle(items, style)

  const count = useColumnCount()
  const loading = useRef(false)
  const [fetching, setFetching] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)

  const more = useCallback(async () => {
    if (loading.current) return
    loading.current = true
    setFetching(true)
    try {
      const p = await api<FeedPage>(feedUrl(kind, classId, cursor))
      setPage((x) => (x?.key === key ? { ...x, items: [...x.items, ...p.items], cursor: p.next_cursor } : x))
    } catch {
      // кнопка остаётся: ребёнок может нажать ещё раз
    } finally {
      loading.current = false
      setFetching(false)
    }
  }, [kind, classId, cursor, key])

  useEffect(() => {
    const el = moreRef.current
    if (!el) return
    const io = new IntersectionObserver((e) => e[0].isIntersecting && items.length < AUTO_LOAD_MAX && void more(), { rootMargin: '800px' })
    io.observe(el)
    return () => io.disconnect()
  }, [more, items.length])

  const close = useCallback(() => setOpen(null), [])
  // Места под то, что ещё придёт, в той же сетке: настоящая карточка встаёт на место заглушки той же формы
  const autoLoads = cursor !== null && items.length < AUTO_LOAD_MAX
  const ghosts = !loaded ? count * GHOST_ROWS : autoLoads || fetching ? count : 0
  const slots: (Post | number)[] = [...shown, ...Array.from({ length: ghosts }, (_, i) => shown.length + i)]
  const Title = guest ? 'h2' : 'h1' // у гостя заголовок страницы на первом экране
  const heads: FeedHead[] =
    classes ?? kinds.map((k) => ({ id: k, label: title ?? t(`feed.tab.${k}`), active: kind === k, onPick: () => setKind(k) }))

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
    <div>
      <div className={`flex min-h-10 items-center gap-x-2 md:min-h-14 md:gap-x-3 ${nick ? 'hidden' : ''}`}>
        {!nick && <BigHeads heads={heads} Title={Title} />}
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
            className="ml-auto h-10 w-[136px] shrink-0 md:h-[45px] md:w-[184px]"
          />
        )}
      </div>
      {loaded && page?.failed && <LoadFailed onRetry={() => { setPage(null); setAttempt((n) => n + 1) }} />}
      {loaded && items.length === 0 && !page?.failed && (
        <p data-testid="feed-empty" className="mt-6 text-text">
          {t(child ? 'feed.empty' : 'feed.emptyAdult')}
        </p>
      )}
      {loaded && items.length > 0 && shown.length === 0 && cursor === null && (
        <p data-testid="feed-filter-empty" className="mt-6 text-text">
          {t('panel.noStyleMatch')}
        </p>
      )}
      <div data-testid="feed-grid" className="mt-2 flex items-start gap-2 lg:gap-3">
        {toColumns(slots, count).map((col, c) => (
        <div key={c} className="stagger flex min-w-0 flex-1 flex-col gap-2 lg:gap-3">
        {col.map((p, row) =>
          typeof p === 'number' ? (
            <Skeleton key={`g${p}`} data-testid="feed-ghost" className="block rounded-card" style={{ aspectRatio: cardRatio(p + 1) }} />
          ) : (
          <button
            key={p.id}
            type="button"
            data-testid="post-card"
              data-post-id={p.id}
            aria-label={p.caption ? `${p.nick}: ${captionOf(p, i18n.language)}` : p.nick || t('feed.anon')}
            title={p.nick || t('feed.anon')}
            onClick={() => setOpen(p.id)}
            style={{ aspectRatio: cardRatio(shown.indexOf(p) + 1) }}
            className="feed-card group relative block w-full overflow-hidden rounded-card bg-primary-soft text-left shadow-card"
          >
            <FeedImage src={`${p.image_url}?thumb=1`} alt={captionOf(p, i18n.language) ?? ''} eager={row < 3} className="h-full w-full object-cover group-hover:scale-105" />
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
          className={`mx-auto mt-4 block rounded-full border border-border bg-surface px-6 py-2 font-extrabold text-heading ${autoLoads ? 'invisible' : ''}`}
        >
          {t('feed.more')}
        </button>
      )}
      {open !== null && <PostModal postId={open} isChild={!!child} guest={guest} onClose={close} onChanged={() => void refreshPost(open)} />}
    </div>
  )
}
