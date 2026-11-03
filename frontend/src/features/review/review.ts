import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api'

export type ReviewItem = {
  id: number
  item_type: string
  nick: string
  where: 'class' | 'family' | 'personal'
  class_id?: number | null
  class_name: string | null
  reason_codes: string[]
  urgent: boolean
  status: string
  created_at: string
  preview_text: string | null
  image_url: string | null
  original_url?: string | null
  blurred_url?: string | null
  /** Сказка: взрослый читает страницы перед решением. */
  story_id?: number | null
}

export const REVIEW_EVENT = 'review:changed'

/** Очередь и бейдж держат один счётчик: после решения зовём notifyReview(). */
export function notifyReview() {
  window.dispatchEvent(new Event(REVIEW_EVENT))
}

export function useReviewCount(): number | null {
  const [n, setN] = useState<number | null>(null)
  const load = useCallback(() => {
    api<{ count: number }>('/api/review/count')
      .then((r) => setN(r.count))
      .catch(() => {})
  }, [])
  useEffect(() => {
    load()
    window.addEventListener(REVIEW_EVENT, load)
    return () => window.removeEventListener(REVIEW_EVENT, load)
  }, [load])
  return n
}

/** Сколько ждёт решения у каждого ребёнка: срочное тоже, сумма сходится со счётчиком на вкладке. */
export function waitingByNick(items: Pick<ReviewItem, 'nick'>[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const x of items) counts[x.nick] = (counts[x.nick] ?? 0) + 1
  return counts
}

/** Кого открыть при входе: первого, у кого есть что решить, иначе первого в списке. */
export function firstKid<T extends { nick: string }>(kids: T[], counts: Record<string, number>): T | undefined {
  return kids.find((k) => counts[k.nick]) ?? kids[0]
}

/** Стопка решений: «Ещё» отправляет верхнюю работу под низ, ни одна не пропадает. */
export function stackOrder<T>(items: T[], skipped: number): T[] {
  const n = skipped % (items.length || 1)
  return [...items.slice(n), ...items.slice(0, n)]
}

/** Сервер хранит наивное UTC: без «Z» браузер прочитал бы его как местное. */
export function parseUtc(iso: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`)
}

type Tr = (key: string, opts?: Record<string, unknown>) => string

/** «5 мин назад» из i18n с plural: Intl.RelativeTimeFormat в Chromium не знает uz. */
export function agoText(iso: string, t: Tr, nowMs = Date.now()): string {
  const sec = Math.round((nowMs - parseUtc(iso).getTime()) / 1000)
  if (sec < 60) return t('review.now')
  if (sec < 3600) return t('ago.minute', { count: Math.floor(sec / 60) })
  if (sec < 86400) return t('ago.hour', { count: Math.floor(sec / 3600) })
  return t('ago.day', { count: Math.floor(sec / 86400) })
}

const KNOWN = [
  'personal_info',
  'off_platform_contact',
  'bullying',
  'unsafe_content',
  'self_harm',
  'prompt_injection',
  'model_error',
  'low_confidence',
  'invalid_response',
  'check_failed',
  'invalid_lang',
  'rewrite_failed',
  'kinder_failed',
  'content_policy',
  'held',
  // загрузка: SAM размыл найденное (backend/app/works/upload/sam.py ENTITIES) или не ответил
  'blurred_face',
  'blurred_school_uniform',
  'blurred_house_number',
  'blurred_handwritten_name',
  'blurred_written_word',
  'drawn_face',
  'cleared_word',
  'sam_failed',
  'remix_source_gone',
  'avatar_review',
]

// Типы, у которых есть своя подпись «что будет после одобрения»; остальным общая
const EFFECTS = ['prompt', 'image', 'post', 'comment', 'upload', 'submission', 'story', 'share', 'nickname', 'avatar']

/** Что значат кнопки для этой работы. Размытая загрузка уже у ребёнка: решаем, оставить ли её, а не показать ли. */
export function effectKey(it: Pick<ReviewItem, 'item_type' | 'reason_codes'>): string {
  if (nothingBlurred(it.reason_codes)) return `review.effect.${it.reason_codes.includes('drawn_face') ? 'drawn_face' : 'cleared_word'}`
  if (it.item_type === 'upload' && it.reason_codes.some((c) => c.startsWith('blurred_'))) return 'review.effect.blurred'
  return `review.effect.${EFFECTS.includes(it.item_type) ? it.item_type : 'other'}`
}

/** Ничего не размыто (лицо нарисовано, надписи не оказалось): две одинаковые картинки рядом ничего не сравнивают. */
export function nothingBlurred(codes: string[]): boolean {
  return codes.length > 0 && codes.every((c) => c === 'drawn_face' || c === 'cleared_word')
}

/** Неизвестный код — общий текст «нужна проверка», а не сырой ключ. */
export function reasonKey(code: string): string {
  return `review.reasons.${KNOWN.includes(code) ? code : 'unknown'}`
}

/** Без дублей текста: low_confidence рядом с категорией не говорит больше самой категории. */
export function reasonKeys(codes: string[]): string[] {
  const keys = [...new Set(codes.map(reasonKey))]
  const real = keys.filter((k) => k !== 'review.reasons.low_confidence')
  const out = real.length ? real : keys
  return out.length ? out : ['review.reasons.unknown']
}

/** Записи класса. Запись без класса показываем в каждом: иначе она пропала бы с экрана учителя. */
export function forClass<T extends { class_id?: number | null }>(items: T[], classId: number): T[] {
  return items.filter((i) => i.class_id == null || i.class_id === classId)
}

const CABINET = 'cabinet:changed'

/** Новый ребёнок или класс: шапка кабинета перечитывает имя и ссылку на ленту. */
export function notifyCabinet() {
  window.dispatchEvent(new Event(CABINET))
}
export const CABINET_EVENT = CABINET
