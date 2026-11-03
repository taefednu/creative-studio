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
  created_at?: string
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

/** Рисунок, из которого уже вышел герой, в галерее не дублируем: он виден на углу героя. Показанный кому-то остаётся. */
export function withoutHeroSources(list: Work[]): Work[] {
  const sources = new Set(list.map((w) => w.hero_of_work_id))
  return list.filter((w) => !sources.has(w.id) || (w.shared ?? []).length > 0)
}

// Звания: сколько готовых картинок нужно. Значения подобраны под детскую норму, легко двигать
const RANKS = [
  { id: 'novice', need: 0 },
  { id: 'young', need: 3 },
  { id: 'master', need: 10 },
  { id: 'wizard', need: 25 },
  { id: 'great', need: 50 },
]
export const BADGES = ['first', 'alive', 'story', 'shared', 'styles', 'ten'] as const
export type BadgeId = (typeof BADGES)[number]

/** Путь художника: только из настоящих работ ребёнка. Загруженные рисунки не считаем: нарисовал не он здесь. Монет и сравнения с другими нет. */
export function artistProgress(works: Work[], storiesReady: number, stylesDone: number, stylesTotal: number) {
  const pictures = works.filter((w) => w.image_url && w.kind !== 'upload').length
  const at = RANKS.filter((r) => pictures >= r.need).length - 1
  const earned: Record<BadgeId, boolean> = {
    first: pictures >= 1,
    alive: works.some((w) => w.kind === 'alive' && w.image_url),
    story: storiesReady > 0,
    shared: works.some((w) => (w.shared ?? []).some((s) => s.status === 'published')),
    styles: stylesTotal > 0 && stylesDone >= stylesTotal,
    ten: pictures >= 10,
  }
  return { pictures, rank: RANKS[at].id, next: RANKS[at + 1] ?? null, from: RANKS[at].need, earned }
}

/** Галерея вместе со сказками: готовое по дате, от новых к старым; плитки без картинки остаются в конце. */
export function withStories<S extends { created_at: string }>(list: Work[], stories: S[]): ({ work: Work; story?: undefined } | { story: S; work?: undefined })[] {
  const dated = [
    ...list.filter((w) => w.image_url).map((work) => ({ at: work.created_at ?? '', item: { work } })),
    ...stories.map((story) => ({ at: story.created_at, item: { story } })),
  ]
  dated.sort((a, b) => b.at.localeCompare(a.at))
  return [...dated.map((x) => x.item), ...list.filter((w) => !w.image_url).map((work) => ({ work }))]
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
