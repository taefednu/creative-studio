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
  template_id: string
  status: WorkStatus
  reason_codes: string[]
  rewrite_text: string | null
  image_url: string | null
  adult_notified?: boolean
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
