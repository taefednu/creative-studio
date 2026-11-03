import { useEffect, useState } from 'react'
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
  'w-full rounded-2xl border border-border bg-surface px-4 py-0 h-12 text-lg short:h-11 font-bold text-heading outline-none focus:border-primary'
const label = 'mb-1 block text-xs font-extrabold uppercase text-primary'
const primaryBtn =
  'btn-press w-full rounded-[14px] bg-primary px-6 h-[52px] lg:h-14 text-xl short:h-12 short:text-lg font-extrabold text-primary-fg shadow-press disabled:opacity-50 disabled:shadow-none'

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
      <p className="text-center text-sm font-bold leading-5 text-primary underline">{t('auth.qrHelp')}</p>
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

/** Демо-стенд для жюри: вход без паролей. Обычный стенд отвечает enabled=false, и кнопок нет. */
function DemoButtons() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    api<{ enabled: boolean }>('/api/demo').then((r) => setEnabled(r.enabled)).catch(() => {})
  }, [])
  if (!enabled) return null
  async function go(role: 'child' | 'parent' | 'teacher') {
    await api('/api/demo/login', 'POST', { role })
    window.location.assign(role === 'child' ? '/create' : `/${role}`)
  }
  return (
    <div data-testid="demo-login" className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-primary-soft p-1 text-sm font-extrabold text-primary">
      <span className="px-2">{t('demo.try')}</span>
      {(['child', 'parent', 'teacher'] as const).map((r) => (
        <button key={r} type="button" data-testid={`demo-${r}`} onClick={() => void go(r)} className="rounded-full bg-surface px-3 py-1.5 text-heading shadow-card">
          {t(`demo.${r}`)}
        </button>
      ))}
    </div>
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
    <div className="flex min-h-dvh flex-col bg-bg lg:h-dvh lg:flex-row">
      <section className="flex min-w-0 flex-col lg:w-1/2 lg:overflow-y-auto">
        <header data-testid="login-header" className="flex h-[60px] shrink-0 items-center justify-between px-4 lg:h-[72px] lg:px-8">
          <Link to="/" aria-label={t('showcase.fromLogin')}>
            <Logo />
          </Link>
          <LangSwitch />
        </header>
        <div className="relative h-[132px] shrink-0 overflow-hidden lg:hidden">
          <img src="/art/login-art.webp" alt="" className="h-full w-full object-cover object-[50%_34%]" />
        </div>
        <main className="mx-auto flex w-full max-w-[520px] flex-1 flex-col justify-center px-4 pb-6 pt-4 lg:px-0 lg:pb-4 lg:pt-0">
          <div className="mb-3 empty:hidden">
            <DemoButtons />
          </div>
          <h1 data-testid="login-title" className="mb-3 text-[32px] font-black leading-none tracking-tight text-heading lg:text-[40px] short:mb-2 short:text-[34px]">
            {t('auth.who')}
          </h1>
          <div data-testid="login-card">
          <div className="mb-3 grid grid-cols-3 gap-2" role="tablist">
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
                className={`relative flex h-[76px] flex-col items-center justify-center gap-0.5 rounded-2xl border-2 px-1 text-sm font-extrabold text-heading transition-colors duration-150 short:h-[68px] ${
                  role === r.role ? 'border-primary bg-primary-soft' : 'border-border bg-surface'
                }`}
              >
                {role === r.role && (
                  <span data-testid={`role-check-${r.role}`} className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-fg">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12l5 5 9-10" />
                    </svg>
                  </span>
                )}
                <img src={r.icon} alt="" className="h-9 w-9 object-contain short:h-8 short:w-8" />
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
            className="flex min-h-12 short:min-h-11 w-full items-center justify-center gap-2 rounded-[14px] border border-border bg-surface px-3 py-1 text-base font-extrabold text-heading"
          >
            <img src="/mentorium-logo.png" alt="" className="h-6 w-auto" />
            {t('auth.mentorium')}
          </button>
          {platform && <PlatformForm onDone={(r) => void done(r)} onClose={() => setPlatform(false)} />}
          <p className="mt-2 flex items-center justify-center gap-2 text-center text-base text-muted short:hidden">
            <img src="/art/coin.webp" alt="" className="h-6 w-6 shrink-0" />
            {t('auth.coinsLine')}
          </p>
          <p className="text-center text-base font-bold text-primary underline short:hidden">{t('auth.classHint')}</p>
          </div>
          <Link to="/" data-testid="to-showcase" className="mt-2 block text-center text-base font-bold text-primary underline short:hidden">
            {t('showcase.fromLogin')}
          </Link>
        </main>
      </section>
      <aside aria-hidden="true" className="relative hidden overflow-hidden lg:block lg:w-1/2">
        <img src="/art/login-art.webp" alt="" className="login-art absolute inset-0 h-full w-full object-cover" />
      </aside>
    </div>
  )
}
