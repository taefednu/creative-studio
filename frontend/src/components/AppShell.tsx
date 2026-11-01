import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useSession } from '../features/auth/session'
import { useLoad } from '../useLoad'
import ErrorText, { errorKey } from './ErrorText'
import LangSwitch from './LangSwitch'
import Logo from './Logo'
import Avatar from './Avatar'
import TabPill from './TabPill'

const TABS = [
  { to: '/', key: 'feed' },
  { to: '/create', key: 'create' },
  { to: '/tasks', key: 'tasks' },
  { to: '/my-works', key: 'mine' },
] as const

type Me = {
  nick: string
  coins: number | null
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
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const away = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [menu])

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
    <div className="min-h-screen bg-bg pb-24 lg:pb-4">
      <header
        data-testid="shell-header"
        className="flex h-[60px] items-center gap-1.5 border-b border-border bg-surface px-2 min-[380px]:gap-2 min-[380px]:px-3 lg:grid lg:h-[87px] lg:grid-cols-[1fr_auto_1fr] lg:gap-3 lg:px-8"
      >
        <Logo />
        <nav
          aria-label="main"
          className="fixed inset-x-0 bottom-0 z-30 flex h-[72px] items-stretch gap-1 border-t border-border bg-surface px-1 py-1 lg:static lg:z-auto lg:h-auto lg:justify-center lg:gap-3 lg:border-0 lg:bg-transparent lg:p-0 2xl:gap-4"
        >
          {TABS.map((tab) => (
            <TabPill
              key={tab.key}
              to={tab.to}
              end={tab.to === '/'}
              icon={tab.key}
              testid={`tab-${tab.key}`}
              label={t(`nav.${tab.key}`)}
            />
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 min-[380px]:gap-2 lg:justify-self-end 2xl:gap-4">
          <LangSwitch />
          {me && (
            <>
              <span
                data-testid="coins"
                title={me.coins === null ? t('shell.coinsUnknown') : t('child.coins')}
                className="flex h-9 shrink-0 items-center justify-center gap-1 rounded-full border border-border bg-surface px-2 text-sm font-extrabold text-heading shadow-card min-[380px]:px-3 min-[380px]:text-base lg:h-[55px] lg:gap-2 lg:text-2xl"
              >
                <img src="/art/coin.webp" alt="" className="h-6 w-6 lg:h-9 lg:w-9" />
                {me.coins ?? '—'}
              </span>
              <div ref={menuRef} className="relative shrink-0">
                <button
                  type="button"
                  data-testid="avatar-me"
                  aria-haspopup="dialog"
                  aria-expanded={menu}
                  aria-label={t('shell.account')}
                  onClick={() => setMenu((v) => !v)}
                  className="block rounded-full lg:h-[58px]"
                >
                  <Avatar nick={me.nick} className="h-9 w-9 min-[380px]:h-10 min-[380px]:w-10 lg:h-[54px] lg:w-[54px]" />
                </button>
                {menu && (
                  <div
                    role="dialog"
                    aria-label={t('shell.account')}
                    className="absolute right-0 top-full z-40 mt-2 w-72 rounded-card border border-border bg-surface p-4 shadow-card"
                  >
                    <p data-testid="my-nick" className="text-lg font-extrabold text-heading">
                      {me.nick}
                    </p>
                    {me.class && (
                      <p data-testid="my-class" className="mt-1 text-sm font-bold text-muted">
                        {t('child.myClass', { name: me.class.name })}
                      </p>
                    )}
                    <p className="mt-3 flex items-start gap-2 text-sm text-muted">
                      <img src="/art/coin.webp" alt="" className="h-5 w-5 shrink-0" />
                      {t('child.moreCoins')}
                    </p>
                    <button
                      type="button"
                      data-testid="logout"
                      onClick={() => void logout()}
                      className="mt-4 w-full rounded-full border border-border bg-surface px-4 py-2 text-sm font-extrabold text-heading"
                    >
                      {t('auth.logout')}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </header>
      <main className="px-4 py-5 md:px-[35px] md:pb-0 pt-1.5 lg:pt-[17px]">
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
        <Outlet context={ctx} />
      </main>
    </div>
  )
}
