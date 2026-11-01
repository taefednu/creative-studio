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
  image_url: string
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
const RATIOS = ['16 / 10', '4 / 3', '3 / 2', '16 / 10', '1 / 1', '4 / 3', '5 / 6'] as const

/** Форма карточки по id поста: картинки квадратные, ряды «кирпичной» сетки разной высоты. */
export function cardRatio(id: number): (typeof RATIOS)[number] {
  return RATIOS[(Math.imul(id, 2654435761) >>> 0) % RATIOS.length]
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
  p: Pick<Post, 'can_remix' | 'is_author' | 'template_id'>,
  child = true,
): 'remix' | 'allow' | 'link' | null {
  if (!child) return null
  if (p.can_remix) return 'remix'
  if (p.is_author) return 'allow'
  return isStyle(p.template_id) ? 'link' : null
}
