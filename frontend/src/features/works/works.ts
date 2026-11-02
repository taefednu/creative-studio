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
  /** Идея ребёнка, только пока идёт рисование. */
  idea?: string | null
  /** Файл уже записан: идёт проверка картинки. */
  drawn?: boolean
  /** Ожившая работа: id загруженного рисунка, из которого она сделана. */
  hero_of_work_id?: number | null
  /** Где работа показана; у старого бэкенда поля нет. */
  shared?: Shared[]
}

export type Shared = { audience: 'class' | 'family'; status: 'published' | 'waiting' }
export type WorkFilter = 'all' | 'shared' | 'waiting'

/** Что SAM прячет на загрузке: коды blurred_<что> (backend/app/works/upload/sam.py ENTITIES), текст в create.blurred.<что>. */
export const BLURRED = ['face', 'school_uniform', 'house_number', 'handwritten_name', 'written_word']

/** Галерея: готовые картинки впереди, плитки без картинки в конце; порядок внутри групп не меняется. */
export function galleryOrder(list: Work[]): Work[] {
  return [...list.filter((w) => w.image_url), ...list.filter((w) => !w.image_url)]
}

/** Альбом стилей: последняя готовая работа ребёнка в каждом стиле; список приходит от новых к старым. */
export function styleAlbum(templates: TemplateInfo[], works: Work[]) {
  return templates.map((tpl) => ({ tpl, work: works.find((w) => w.template_id === tpl.id && w.image_url) ?? null }))
}

/** Фильтры «Моих работ»: «Показанные» — есть опубликованный пост, «Ждут» — пост ждёт взрослого или сама работа на проверке. */
export function filterWorks(list: Work[], f: WorkFilter): Work[] {
  if (f === 'all') return list
  if (f === 'waiting') return list.filter((w) => w.status === 'held' || (w.shared ?? []).some((s) => s.status === 'waiting'))
  return list.filter((w) => (w.shared ?? []).some((s) => s.status === 'published'))
}

export type TemplateInfo = { id: string; image_url: string }

export const loadTemplates = () => api<{ price: number; story_price?: number; templates: TemplateInfo[] }>('/api/templates')

export const POLLING: WorkStatus[] = ['checking', 'generating']

const HINTED = ['unsafe_content', 'bullying', 'personal_info', 'off_platform_contact', 'prompt_injection']

/** Ключ i18n мягкой подсказки по причине отказа. */
export function hintKey(codes: string[]): string {
  const c = codes.find((x) => HINTED.includes(x))
  return `hint.${c ?? 'generic'}`
}

export const loadMine = () => api<Work[]>('/api/works/mine')
