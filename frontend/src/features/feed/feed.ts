import { parseUtc } from '../review/review'

export const REACTIONS = [
  { key: 'star', emoji: '⭐' },
  { key: 'heart', emoji: '❤️' },
  { key: 'laugh', emoji: '😂' },
  { key: 'wow', emoji: '😮' },
] as const

export type ReactionKey = (typeof REACTIONS)[number]['key']

export type Post = {
  id: number
  nick: string
  caption: string | null
  /** Только у демо-постов: подпись на языках интерфейса. Текст настоящего ребёнка остаётся как написан. */
  caption_i18n?: Record<string, string> | null
  image_url: string
  /** Пост сказки: читается как книжка. */
  story?: { id: number; title: string | null; pages: { text: string | null }[] } | null
  template_id: string | null
  audience: 'class' | 'family'
  status: string
  best: boolean
  reactions: Record<ReactionKey, number>
  mine: ReactionKey[]
  comments: number
  is_author: boolean
  can_react: boolean
  can_comment: boolean
  can_delete: boolean
  can_remix: boolean
  /** true только автору при срочном: тёплый ответ, без пометок «ждёт взрослого» */
  support?: boolean
  remix_allowed: boolean
  remix_of: { post_id: number; nick: string } | null
  created_at: string
}

export function captionOf(p: Pick<Post, 'caption' | 'caption_i18n'>, lang: string): string | null {
  return p.caption_i18n?.[lang] ?? p.caption
}

export type FeedPage = { items: Post[]; next_cursor: number | null }

export type PostComment = {
  id: number
  nick: string
  text: string
  status: 'published' | 'held'
  mine: boolean
  support?: boolean
}

export type CommentResult =
  | { status: 'published' | 'held' | 'support'; id: number }
  | { status: 'suggest'; kinder: string; suggestion_id: number }

export type FeedKind = 'class' | 'family' | 'best'

export function feedUrl(kind: FeedKind, classId?: number, before?: number | null): string {
  const q = new URLSearchParams()
  if (classId !== undefined && kind === 'class') q.set('class_id', String(classId))
  if (before) q.set('before', String(before))
  const s = q.toString()
  return `/api/feed/${kind}${s ? `?${s}` : ''}`
}

// как на feed.jpg: больше лежачих, вертикальных мало
const RATIOS = ['16 / 10', '4 / 3', '3 / 4', '3 / 2', '1 / 1', '4 / 5', '5 / 6'] as const

/** Форма карточки по её месту в ленте (с единицы): заглушка и настоящая карточка на одном месте одной формы, ничего не прыгает. */
export function cardRatio(place: number): (typeof RATIOS)[number] {
  return RATIOS[(Math.imul(place, 2654435761) >>> 0) % RATIOS.length]
}

/** Раскладка по колонкам: каждая карточка в самую короткую. Дозагрузка не двигает уже показанные. */
export function toColumns<T>(items: T[], count: number): T[][] {
  const cols: T[][] = Array.from({ length: count }, () => [])
  const heights = cols.map(() => 0)
  items.forEach((p, i) => {
    const c = heights.indexOf(Math.min(...heights))
    const [w, h] = cardRatio(i + 1).split(' / ').map(Number)
    cols[c].push(p)
    heights[c] += h / w
  })
  return cols
}

/** Фильтр по стилю на клиенте: '' — все. */
export function byStyle(items: Post[], style: string): Post[] {
  return style ? items.filter((p) => p.template_id === style) : items
}

const dayNo = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)

/** «Создано»: сегодня и вчера по местным суткам браузера, иначе дата ДД.ММ.ГГГГ (Intl не знает uz). */
export function createdLabel(iso: string, now: Date = new Date()): 'today' | 'yesterday' | string {
  const d = parseUtc(iso)
  const ago = dayNo(now) - dayNo(d)
  if (ago === 0) return 'today'
  if (ago === 1) return 'yesterday'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`
}

/** Работа сделана по шаблону из каталога, а не ремиксом или загрузкой: только на такой есть /create?template=. */
export const isStyle = (id: string | null): id is string => !!id && id !== 'remix' && id !== 'upload'

/** Что показать вместо «Нарисовать так же»: ремикс, переключатель автору или ссылку на стиль (взрослому ничего). */
export function drawSameKind(
  p: Pick<Post, 'can_remix' | 'is_author' | 'template_id' | 'story'>,
  child = true,
): 'remix' | 'allow' | 'link' | null {
  if (!child || p.story) return null // сказку не повторяют: у неё свой герой
  if (p.can_remix) return 'remix'
  if (p.is_author) return 'allow'
  return isStyle(p.template_id) ? 'link' : null
}
