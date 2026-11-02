import { api } from '../../api'

export type WorkStatus =
  | 'proposed'
  | 'checking'
  | 'generating'
  | 'ready'
  | 'refused'
  | 'held'
  | 'support'
  | 'failed'

export type Work = {
  id: number
  /** 'upload' — загруженный рисунок: image_url у него размытая версия, оригинал ребёнку не отдаётся */
  kind?: string
  template_id: string
  status: WorkStatus
  reason_codes: string[]
  rewrite_text: string | null
  image_url: string | null
  adult_notified?: boolean
  /** Где работа показана; у старого бэкенда поля нет. */
  shared?: Shared[]
}

export type Shared = { audience: 'class' | 'family'; status: 'published' | 'waiting' }
export type WorkFilter = 'all' | 'shared' | 'waiting'

/** Фильтры «Моих работ»: «Показанные» — есть опубликованный пост, «Ждут» — есть пост, ожидающий взрослого. */
export function filterWorks(list: Work[], f: WorkFilter): Work[] {
  if (f === 'all') return list
  const want = f === 'shared' ? 'published' : 'waiting'
  return list.filter((w) => (w.shared ?? []).some((s) => s.status === want))
}

export type TemplateInfo = { id: string; image_url: string }

export const loadTemplates = () => api<{ price: number; templates: TemplateInfo[] }>('/api/templates')

export const POLLING: WorkStatus[] = ['checking', 'generating']

const HINTED = ['unsafe_content', 'bullying', 'personal_info', 'off_platform_contact', 'prompt_injection']

/** Ключ i18n мягкой подсказки по причине отказа. */
export function hintKey(codes: string[]): string {
  const c = codes.find((x) => HINTED.includes(x))
  return `hint.${c ?? 'generic'}`
}

export const loadMine = () => api<Work[]>('/api/works/mine')
