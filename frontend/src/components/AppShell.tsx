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
import NavIcon from './NavIcon'

const TABS = [
  { to: '/', key: 'feed' },
  { to: '/create', key: 'create' },
  { to: '/tasks', key: 'tasks' },
  { to: '/my-works', key: 'mine' },
] as const

type Me = {
  nick: string
  coins: number
  class: { id: number; name: string } | null
  has_parent: boolean
}

export type ShellContext = {
  reloadMe: () => void
  coins: number | null
  cls: { id: number; name: string } | null
  hasParent: boolean
  ready: boolean
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

  const ctx: ShellContext = {
    reloadMe: load,
    coins: me ? me.coins : null,
    cls: me?.class ?? null,
    hasParent: me?.has_parent ?? false,
    ready: me !== null,
  }

  return (
    <div className="min-h-screen bg-bg pb-24 md:pb-6">
      <header className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2 md:grid md:h-[85px] md:grid-cols-[1fr_auto_1fr] md:gap-3 md:px-8 md:py-0">
        <div className="flex items-center gap-2">
          <img src="/mentorium-logo.png" alt="Mentorium" className="h-9 w-auto" />
          <span className="hidden text-lg font-extrabold text-heading md:inline">{t('app.name')}</span>
        </div>
        <nav
          aria-label="main"
          className="fixed inset-x-0 bottom-0 z-10 flex justify-around gap-1 border-t border-border bg-surface px-2 py-2 md:static md:z-auto md:justify-center md:gap-3 md:border-0 md:bg-transparent md:p-0"
        >
          {TABS.map((tab) => (
            <NavLink
              key={tab.key}
              to={tab.to}
              end={tab.to === '/'}
              data-testid={`tab-${tab.key}`}
              className={({ isActive }) =>
                `flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-2xl px-1 py-1.5 text-xs font-extrabold md:flex-none md:flex-row md:gap-2 md:rounded-full md:px-5 md:py-3 md:text-base ${
                  isActive
                    ? 'bg-primary text-primary-fg shadow-card'
                    : 'text-heading md:border md:border-border md:bg-surface'
                }`
              }
            >
              <NavIcon name={tab.key} className="h-6 w-6 shrink-0" />
              <span className="max-w-full truncate">{t(`nav.${tab.key}`)}</span>
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <LangSwitch />
          {me && (
            <>
              <span
                data-testid="coins"
                className="flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 text-lg font-extrabold text-heading"
                title={t('child.coins')}
              >
                <Coin className="h-6 w-6" />
                {me.coins}
              </span>
              <span data-testid="my-nick" className="hidden text-sm font-bold text-heading md:inline">
                {me.nick}
              </span>
              <button
                type="button"
                data-testid="logout"
                onClick={() => void logout()}
                className="hidden rounded-full border border-border bg-surface px-3 py-1 text-sm font-bold text-heading md:inline"
              >
                {t('auth.logout')}
              </button>
            </>
          )}
        </div>
      </header>
      <main className="px-4 py-5 md:px-[35px]">
        <Outlet context={ctx} />
        {me?.class && (
          <p data-testid="my-class" className="mt-6 text-sm font-bold text-muted">
            {t('child.myClass', { name: me.class.name })}
          </p>
        )}
        {me && !me.class && (
          <form
            onSubmit={(e) => void join(e)}
            data-testid="join-class"
            className="mt-6 flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-4 shadow-card"
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
        <p className="mt-4 flex items-center gap-2 text-sm text-muted">
          <Coin className="h-5 w-5 shrink-0" />
          {t('child.moreCoins')}
        </p>
        <button
          type="button"
          onClick={() => void logout()}
          className="mt-4 rounded-full border border-border bg-surface px-4 py-1 text-sm font-bold text-heading md:hidden"
        >
          {t('auth.logout')}
        </button>
      </main>
    </div>
  )
}
