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
  created_at: string
}

export type FeedPage = { items: Post[]; next_cursor: number | null }

export type PostComment = {
  id: number
  nick: string
  text: string
  status: 'published' | 'held'
  mine: boolean
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
