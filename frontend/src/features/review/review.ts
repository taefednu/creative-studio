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

export function agoText(iso: string, lang: string, nowText: string): string {
  const sec = Math.round((Date.now() - parseUtc(iso).getTime()) / 1000)
  if (sec < 60) return nowText
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'always', style: 'short' })
  if (sec < 3600) return rtf.format(-Math.floor(sec / 60), 'minute')
  if (sec < 86400) return rtf.format(-Math.floor(sec / 3600), 'hour')
  return rtf.format(-Math.floor(sec / 86400), 'day')
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
]

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
