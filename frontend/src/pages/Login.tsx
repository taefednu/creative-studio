import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate } from 'react-router-dom'
import { api } from '../api'
import Coin from '../components/Coin'
import ErrorText, { errorKey } from '../components/ErrorText'
import LangSwitch from '../components/LangSwitch'
import PictureGrid from '../components/PictureGrid'
import { PASSWORD_LENGTH } from '../features/auth/pictures'
import { HOME, useSession } from '../features/auth/session'
import type { Role } from '../features/auth/session'

const ROLES: { role: Role; icon: string }[] = [
  { role: 'child', icon: '🎒' },
  { role: 'parent', icon: '🏡' },
  { role: 'teacher', icon: '📖' },
]

const input =
  'w-full rounded-2xl border border-border bg-surface px-4 py-3 text-lg font-bold text-heading outline-none focus:border-primary'
const label = 'mb-1 block text-xs font-extrabold uppercase text-primary'
const primaryBtn =
  'w-full rounded-full bg-primary px-6 py-3 text-lg font-extrabold uppercase text-primary-fg disabled:opacity-50'

function ChildForm({ onDone }: { onDone: (r: Role) => void }) {
  const { t } = useTranslation()
  const [nick, setNick] = useState('')
  const [pics, setPics] = useState<number[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await api('/api/child/login', 'POST', { nick, pictures: pics })
      onDone('child')
    } catch (x) {
      setErr(errorKey(x))
      setPics([])
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" data-testid="child-form">
      <div>
        <label htmlFor="nick" className={label}>
          {t('auth.nick')}
        </label>
        <input
          id="nick"
          data-testid="nick"
          className={input}
          value={nick}
          maxLength={40}
          autoComplete="off"
          onChange={(e) => setNick(e.target.value)}
        />
      </div>
      <div>
        <span className={label}>{t('auth.picturePassword')}</span>
        <PictureGrid value={pics} onChange={setPics} />
      </div>
      <ErrorText code={err} />
      <button
        type="submit"
        data-testid="child-submit"
        disabled={busy || !nick.trim() || pics.length !== PASSWORD_LENGTH}
        className={primaryBtn}
      >
        {t('auth.login')}
      </button>
      <p className="text-center text-sm font-bold text-primary underline">{t('auth.qrHelp')}</p>
    </form>
  )
}

function EmailForm({ role, onDone }: { role: 'parent' | 'teacher'; onDone: (r: Role) => void }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      await api(`/api/${role}/${mode}`, 'POST', { email, password })
      onDone(role)
    } catch (x) {
      setErr(errorKey(x))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" data-testid={`${role}-form`}>
      <div>
        <label htmlFor="email" className={label}>
          {t('auth.email')}
        </label>
        <input
          id="email"
          data-testid="email"
          type="email"
          className={input}
          value={email}
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="password" className={label}>
          {t('auth.password')}
        </label>
        <input
          id="password"
          data-testid="password"
          type="password"
          className={input}
          value={password}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <ErrorText code={err} />
      <button type="submit" data-testid="email-submit" disabled={busy || !email || !password} className={primaryBtn}>
        {mode === 'login' ? t('auth.login') : t('auth.register')}
      </button>
      <button
        type="button"
        data-testid="mode-toggle"
        onClick={() => {
          setMode(mode === 'login' ? 'register' : 'login')
          setErr(null)
        }}
        className="text-center text-sm font-bold text-primary underline"
      >
        {mode === 'login' ? t('auth.toRegister') : t('auth.toLogin')}
      </button>
    </form>
  )
}

export default function Login() {
  const { t } = useTranslation()
  const { role: current, refresh } = useSession()
  const navigate = useNavigate()
  const [role, setRole] = useState<Role>('child')

  if (current) return <Navigate to={HOME[current]} replace />

  async function done(r: Role) {
    await refresh()
    navigate(HOME[r])
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="flex items-center gap-3 px-4 py-3 md:px-8">
        <img src="/mentorium-logo.png" alt="Mentorium" className="h-9 w-auto" />
        <span className="text-lg font-extrabold text-heading">{t('app.name')}</span>
        <LangSwitch />
      </header>
      <main className="mx-auto w-full max-w-[560px] px-4 pb-10 pt-4">
        <div className="rounded-card border border-border bg-surface p-4 shadow-card md:p-6">
          <div className="mb-5 grid grid-cols-3 gap-2 md:gap-3" role="tablist">
            {ROLES.map((r) => (
              <button
                key={r.role}
                type="button"
                role="tab"
                aria-selected={role === r.role}
                data-testid={`role-${r.role}`}
                onClick={() => setRole(r.role)}
                className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-1 py-3 text-sm font-extrabold text-heading md:text-base ${
                  role === r.role ? 'border-primary bg-primary-soft' : 'border-border bg-surface'
                }`}
              >
                <span className="text-4xl md:text-5xl" aria-hidden="true">
                  {r.icon}
                </span>
                {t(`auth.roles.${r.role}`)}
              </button>
            ))}
          </div>

          {role === 'child' ? (
            <ChildForm onDone={(r) => void done(r)} />
          ) : (
            <EmailForm key={role} role={role} onDone={(r) => void done(r)} />
          )}

          <div className="my-4 flex items-center gap-3 text-sm text-muted">
            <span className="h-px flex-1 bg-border" />
            {t('auth.or')}
            <span className="h-px flex-1 bg-border" />
          </div>
          <button
            type="button"
            disabled
            data-testid="mentorium-login"
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 font-extrabold text-muted"
          >
            {t('auth.mentorium')}
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">{t('auth.soon')}</span>
          </button>
          <p className="mt-4 flex items-center justify-center gap-2 text-center text-sm text-muted">
            <Coin className="h-5 w-5 shrink-0" />
            {t('auth.coinsLine')}
          </p>
          <p className="mt-2 text-center text-sm font-bold text-primary underline">{t('auth.classHint')}</p>
        </div>
      </main>
    </div>
  )
}
