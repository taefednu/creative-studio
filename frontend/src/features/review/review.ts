import { useCallback, useEffect, useState } from 'react'
import { api } from '../../api'

export type ReviewItem = {
  id: number
  item_type: string
  nick: string
  where: 'class' | 'family' | 'personal'
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

const EVENT = 'review:changed'

/** Очередь и бейдж держат один счётчик: после решения зовём notifyReview(). */
export function notifyReview() {
  window.dispatchEvent(new Event(EVENT))
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
    window.addEventListener(EVENT, load)
    return () => window.removeEventListener(EVENT, load)
  }, [load])
  return n
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
  'sam_failed',
  'remix_source_gone',
]

/** Лицо нарисовано и ничего не размыто: две одинаковые картинки рядом ничего не сравнивают. */
export function onlyDrawnFace(codes: string[]): boolean {
  return codes.length > 0 && codes.every((c) => c === 'drawn_face')
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

/** Фильтр очереди учителя по имени класса; null — все классы. Срочное и без класса видно всегда: его нельзя спрятать. */
export function filterByClass<T extends { class_name: string | null; urgent?: boolean }>(items: T[], className: string | null): T[] {
  return className === null ? items : items.filter((i) => i.urgent || i.class_name === null || i.class_name === className)
}

const CABINET = 'cabinet:changed'

/** Новый ребёнок или класс: шапка кабинета перечитывает имя и ссылку на ленту. */
export function notifyCabinet() {
  window.dispatchEvent(new Event(CABINET))
}
export const CABINET_EVENT = CABINET
