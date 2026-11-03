import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import { useLoad } from '../useLoad'
import ErrorText, { errorKey } from './ErrorText'
import Icon from './Icon'

const loadState = () => api<{ enabled: boolean; linked: boolean }>('/api/auth/platform-link')
const FIELD = 'h-10 w-full rounded-full border border-border bg-surface px-3 text-sm font-bold text-heading outline-none focus:border-primary'

/** Привязка профиля Mentorium к уже созданному аккаунту. Платформа не настроена — блока нет: кнопка всегда давала бы ошибку. */
export default function PlatformLink({ note }: { note: 'childNote' | 'adultNote' }) {
  const { t, i18n } = useTranslation()
  const [state, reload] = useLoad(loadState)
  const [open, setOpen] = useState(false)
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (!state?.enabled) return null
  if (state.linked) {
    return (
      <p data-testid="link-done" className="flex items-center gap-2 text-sm font-extrabold text-success">
        <Icon name="check" className="h-4 w-4 shrink-0" />
        {t('link.done')}
      </p>
    )
  }
  if (!open) {
    return (
      <button type="button" data-testid="link-open" onClick={() => setOpen(true)} className="w-full rounded-full bg-primary-soft px-4 py-2 text-sm font-extrabold text-primary">
        {t('link.open')}
      </button>
    )
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await api('/api/auth/platform-link', 'POST', { login, password })
      setPassword('')
      reload()
    } catch (x) {
      setErr(errorKey(x))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form data-testid="link-form" onSubmit={(e) => void submit(e)} className="flex flex-col gap-2">
      <p className="text-sm font-extrabold text-heading">{t('link.title')}</p>
      <p className="text-xs font-bold text-muted">{t(`link.${note}`)}</p>
      <input data-testid="link-login" aria-label={t('login.login')} placeholder={t('login.login')} value={login} maxLength={255} autoComplete="username" onChange={(e) => setLogin(e.target.value)} className={FIELD} />
      <input data-testid="link-password" aria-label={t('login.password')} placeholder={t('login.password')} type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} className={FIELD} />
      {err && i18n.exists(`login.err.${err}`) ? <p role="alert" data-testid="link-error" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-bold text-danger">{t(`login.err.${err}`)}</p> : <ErrorText code={err} />}
      <button type="submit" data-testid="link-submit" disabled={busy || !login.trim() || !password} className="h-10 w-full rounded-full bg-primary text-sm font-extrabold text-primary-fg disabled:opacity-50">
        {t('link.submit')}
      </button>
    </form>
  )
}
