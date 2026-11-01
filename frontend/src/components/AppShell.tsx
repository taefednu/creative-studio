import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useSession } from '../features/auth/session'
import { useLoad } from '../useLoad'
import Coin from './Coin'
import ErrorText, { errorKey } from './ErrorText'
import LangSwitch from './LangSwitch'

const TABS = [
  { to: '/', key: 'feed' },
  { to: '/create', key: 'create' },
  { to: '/tasks', key: 'tasks' },
  { to: '/mine', key: 'mine' },
] as const

type Me = {
  nick: string
  coins: number
  class: { id: number; name: string } | null
  has_parent: boolean
}

const loadMe = () => api<Me>('/api/child/me')

export default function AppShell() {
  const { t } = useTranslation()
  const { refresh } = useSession()
  const navigate = useNavigate()
  const [me, load] = useLoad(loadMe)
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function join(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    try {
      await api('/api/child/join-class', 'POST', { code })
      setCode('')
      load()
    } catch (x) {
      setErr(errorKey(x))
    }
  }

  async function logout() {
    await api('/api/logout', 'POST')
    await refresh()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-8">
        <div className="flex items-center gap-2">
          <img src="/mentorium-logo.png" alt="Mentorium" className="h-9 w-auto" />
          <span className="text-lg font-extrabold text-heading">{t('app.name')}</span>
        </div>
        <nav className="order-last flex w-full gap-2 overflow-x-auto md:order-none md:ml-6 md:w-auto">
          {TABS.map((tab) => (
            <NavLink
              key={tab.key}
              to={tab.to}
              end={tab.to === '/'}
              data-testid={`tab-${tab.key}`}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${
                  isActive
                    ? 'bg-primary text-primary-fg'
                    : 'border border-border bg-surface text-heading'
                }`
              }
            >
              {t(`nav.${tab.key}`)}
            </NavLink>
          ))}
        </nav>
        <LangSwitch />
        {me && (
          <div className="flex items-center gap-3">
            <span
              data-testid="coins"
              className="flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 font-extrabold text-heading"
              title={t('child.coins')}
            >
              <Coin />
              {me.coins}
            </span>
            <span data-testid="my-nick" className="text-sm font-bold text-heading">
              {me.nick}
            </span>
            <button
              type="button"
              data-testid="logout"
              onClick={() => void logout()}
              className="rounded-full border border-border bg-surface px-3 py-1 text-sm font-bold text-heading"
            >
              {t('auth.logout')}
            </button>
          </div>
        )}
      </header>
      <main className="px-4 py-6 md:px-8">
        {me && !me.class && (
          <form
            onSubmit={(e) => void join(e)}
            data-testid="join-class"
            className="mb-4 flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-4 shadow-card"
          >
            <label htmlFor="class-code" className="text-sm font-extrabold text-heading">
              {t('child.classCode')}
            </label>
            <input
              id="class-code"
              data-testid="class-code-input"
              value={code}
              maxLength={12}
              autoComplete="off"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="w-36 rounded-2xl border border-border bg-surface px-3 py-2 font-extrabold uppercase tracking-widest text-heading outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={!code.trim()}
              className="rounded-full bg-primary px-5 py-2 text-sm font-extrabold uppercase text-primary-fg disabled:opacity-50"
            >
              {t('child.join')}
            </button>
            <div className="w-full">
              <ErrorText code={err} />
            </div>
          </form>
        )}
        {me?.class && (
          <p data-testid="my-class" className="mb-4 text-sm font-bold text-muted">
            {t('child.myClass', { name: me.class.name })}
          </p>
        )}
        <Outlet />
        <p className="mt-6 flex items-center gap-2 text-sm text-muted">
          <Coin className="h-5 w-5 shrink-0" />
          {t('child.moreCoins')}
        </p>
      </main>
    </div>
  )
}
