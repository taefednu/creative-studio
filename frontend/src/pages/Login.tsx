import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { api } from '../api'
import ErrorText, { errorKey } from '../components/ErrorText'
import LangSwitch from '../components/LangSwitch'
import Logo from '../components/Logo'
import PictureGrid from '../components/PictureGrid'
import { PASSWORD_LENGTH } from '../features/auth/pictures'
import { HOME, useSession } from '../features/auth/session'
import type { Role } from '../features/auth/session'

const ROLES: { role: Role; icon: string }[] = [
  { role: 'child', icon: '/art/backpack.webp' },
  { role: 'parent', icon: '/art/house.webp' },
  { role: 'teacher', icon: '/art/tab-tasks.webp' },
]

const input =
  'w-full rounded-2xl border border-border bg-surface px-4 py-0 h-12 text-2xl short:h-11 font-bold text-heading outline-none focus:border-primary'
const label = 'mb-1 block text-xs font-extrabold uppercase text-primary'
const primaryBtn =
  'w-full rounded-full bg-primary px-6 h-[52px] lg:h-14 text-2xl short:h-12 short:text-xl font-extrabold uppercase text-primary-fg disabled:opacity-50'

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
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4 short:gap-2" data-testid="child-form">
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
        {t('auth.childLogin')}
      </button>
      <p className="text-center text-base font-bold leading-5 text-primary underline">{t('auth.qrHelp')}</p>
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
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4 short:gap-2" data-testid={`${role}-form`}>
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

type PlatformErr = { code: string; text?: string }

/** Вход через платформу: свой fetch, потому что api() теряет тело ошибки captcha (там тексты ru/en/uz). */
function PlatformForm({ onDone, onClose }: { onDone: (r: Role) => void; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<PlatformErr | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/auth/platform-login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password, lang: i18n.language }),
      })
      if (res.ok) {
        setPassword('')
        // вход удался: сбой чтения сессии не значит «Mentorium не отвечает»
        let role: Role | null = null
        try {
          role = (await api<{ role: Role | null }>('/api/session')).role
        } catch {
          /* role остаётся null */
        }
        if (role) return onDone(role)
        return setErr({ code: 'generic' })
      }
      let d: unknown
      try {
        d = ((await res.json()) as { detail?: unknown }).detail
      } catch {
        /* пустое тело */
      }
      if (typeof d === 'string') setErr({ code: d })
      else if (d && typeof d === 'object') {
        const o = d as { code?: string; messages?: Record<string, string> }
        setErr({ code: o.code ?? 'generic', text: o.messages?.[i18n.language] ?? o.messages?.ru })
      } else setErr({ code: 'generic' })
    } catch {
      setErr({ code: 'platform_unavailable' })
    } finally {
      setBusy(false)
    }
  }

  const known = err && i18n.exists(`login.err.${err.code}`)
  return (
    <form onSubmit={(e) => void submit(e)} className="mt-3 flex flex-col gap-3" data-testid="platform-form">
      <p className="text-sm font-extrabold text-heading">{t('login.title')}</p>
      <div>
        <label htmlFor="platform-login" className={label}>
          {t('login.login')}
        </label>
        <input
          id="platform-login"
          data-testid="platform-login"
          className={input}
          value={login}
          maxLength={255}
          autoComplete="username"
          onChange={(e) => setLogin(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="platform-password" className={label}>
          {t('login.password')}
        </label>
        <input
          id="platform-password"
          data-testid="platform-password"
          type="password"
          className={input}
          value={password}
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {err && (
        <p role="alert" data-testid="platform-error" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-bold text-danger">
          {err.text ?? (known ? t(`login.err.${err.code}`) : t('errors.generic'))}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" data-testid="platform-submit" disabled={busy || !login.trim() || !password} className={primaryBtn}>
          {t('login.submit')}
        </button>
        <button type="button" data-testid="platform-close" onClick={onClose} className="rounded-full border border-border px-5 font-extrabold text-heading">
          {t('login.back')}
        </button>
      </div>
    </form>
  )
}

export default function Login() {
  const { t } = useTranslation()
  const { role: current, refresh } = useSession()
  const navigate = useNavigate()
  const [role, setRole] = useState<Role>('child')
  const [platform, setPlatform] = useState(false)

  if (current) return <Navigate to={HOME[current]} replace />

  async function done(r: Role) {
    await refresh()
    navigate(HOME[r])
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg bg-cover bg-center" style={{ backgroundImage: 'url(/art/login-bg.webp)' }}>
      <header data-testid="login-header" className="flex h-[60px] items-center justify-between border-b border-border bg-surface px-3 lg:h-16 lg:px-8">
        <Logo />
        <div className="rounded-full border border-border bg-surface px-2 shadow-card">
          <LangSwitch />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[719px] px-3 pb-10 pt-3 lg:flex lg:max-w-[600px] lg:flex-1 lg:flex-col lg:justify-center lg:py-2">
        <div data-testid="login-card" className="rounded-card border border-border bg-surface p-3 shadow-card md:p-[29px] short:p-4">
          <div className="mb-3 grid grid-cols-3 gap-2 md:gap-3" role="tablist">
            {ROLES.map((r) => (
              <button
                key={r.role}
                type="button"
                role="tab"
                aria-selected={role === r.role}
                data-testid={`role-${r.role}`}
                onClick={() => {
                  setRole(r.role)
                  setPlatform(false)
                }}
                className={`relative flex flex-col items-center gap-1 rounded-2xl border-2 px-1 py-2 text-sm font-extrabold text-heading md:h-[176px] md:justify-center md:text-2xl short:h-[84px] short:text-base ${
                  role === r.role ? 'border-primary bg-primary-soft' : 'border-border bg-surface'
                }`}
              >
                {role === r.role && (
                  <span data-testid={`role-check-${r.role}`} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-fg">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12l5 5 9-10" />
                    </svg>
                  </span>
                )}
                <img src={r.icon} alt="" className="h-16 w-16 object-contain md:h-[110px] md:w-[110px] short:h-11 short:w-11" />
                {t(`auth.roles.${r.role}`)}
              </button>
            ))}
          </div>

          {role === 'child' ? (
            <ChildForm onDone={(r) => void done(r)} />
          ) : (
            <EmailForm key={role} role={role} onDone={(r) => void done(r)} />
          )}

          <div className="my-1 flex items-center gap-3 text-base leading-5 text-muted">
            <span className="h-px flex-1 bg-border" />
            {t('auth.or')}
            <span className="h-px flex-1 bg-border" />
          </div>
          <button
            type="button"
            data-testid="mentorium-login"
            aria-expanded={platform}
            onClick={() => setPlatform((v) => !v)}
            className="flex min-h-[52px] short:min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-3 py-1 text-base md:text-xl font-extrabold text-heading"
          >
            <img src="/mentorium-logo.png" alt="" className="h-6 w-auto md:h-8" />
            {t('auth.mentorium')}
          </button>
          {platform && <PlatformForm onDone={(r) => void done(r)} onClose={() => setPlatform(false)} />}
          <p className="mt-2 flex items-center justify-center gap-2 text-center text-base text-muted short:hidden">
            <img src="/art/coin.webp" alt="" className="h-6 w-6 shrink-0" />
            {t('auth.coinsLine')}
          </p>
          <p className="text-center text-base font-bold text-primary underline short:hidden">{t('auth.classHint')}</p>
        </div>
        <Link to="/" data-testid="to-showcase" className="mt-3 block text-center text-base font-bold text-primary underline short:hidden">
          {t('showcase.fromLogin')}
        </Link>
      </main>
    </div>
  )
}
