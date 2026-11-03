import { useTranslation } from 'react-i18next'
import { ApiError } from '../api'

/** Код ошибки бэкенда -> текст ребёнка/взрослого на текущем языке. */
export function errorKey(e: unknown): string {
  return e instanceof ApiError ? e.code : 'generic'
}

export default function ErrorText({ code }: { code: string | null }) {
  const { t, i18n } = useTranslation()
  if (!code) return null
  const key = i18n.exists(`errors.${code}`) ? `errors.${code}` : 'errors.generic'
  return (
    <p role="alert" data-testid="error" className="err-in rounded-xl bg-danger-soft px-3 py-2 text-sm font-bold text-danger">
      {t(key)}
    </p>
  )
}
