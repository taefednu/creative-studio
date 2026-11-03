export type ShownPost = { audience: string; status: 'published' | 'waiting' }
export type ShareState = { status: 'none' | 'waiting' | 'live' | 'off' | 'refused'; path: string | null; posts?: ShownPost[] }
export type RowState = 'free' | 'waiting' | 'done' | 'refused'

/** Строка «Моему классу» или «Моей семье»: что с этой работой у этой аудитории сейчас. */
export function postRow(posts: ShownPost[], audience: string): RowState {
  const p = posts.find((x) => x.audience === audience)
  return !p ? 'free' : p.status === 'published' ? 'done' : 'waiting'
}

/** Строка «Всем». Ребёнок сам выключил ссылку: можно просить снова; отказ взрослого сильнее просьбы. */
export function allRow(status: ShareState['status']): RowState {
  if (status === 'waiting') return 'waiting'
  if (status === 'live') return 'done'
  return status === 'refused' ? 'refused' : 'free'
}
