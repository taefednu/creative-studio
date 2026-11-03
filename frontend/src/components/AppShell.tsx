import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api'
import { useSession } from '../features/auth/session'
import { useLoad } from '../useLoad'
import ErrorText, { errorKey } from './ErrorText'
import { HEADER_CLS, NAV_CLS } from './headerStyles'
import LangSwitch from './LangSwitch'
import Logo from './Logo'
import Avatar from './Avatar'
import SiteFooter from './SiteFooter'
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
  needs_adult: boolean
}

export type ShellContext = {
  reloadMe: () => void
  coins: number | null
  cls: { id: number; name: string } | null
  nick: string | null
  hasParent: boolean
  needsAdult: boolean
  ready: boolean
}

const loadMe = () => api<Me>('/api/child/me')

export default function AppShell() {
  const { t } = useTranslation()
  const { refresh } = useSession()
  const navigate = useNavigate()
  const home = useLocation().pathname === '/' // подвал только на главной: остальные экраны собраны под одно окно
  const [me, load] = useLoad(loadMe)
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [link, setLink] = useState<{ code: string; min: number } | string | null>(null)
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

  async function parentCode() {
    try {
      const r = await api<{ code: string; expires_in: number }>('/api/child/parent-link-code', 'POST')
      setLink({ code: r.code, min: Math.round(r.expires_in / 60) })
    } catch (x) {
      if (x instanceof ApiError && x.code === 'already_linked') {
        setLink('already_linked')
        load()
      } else setLink('generic')
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
    nick: me?.nick ?? null,
    hasParent: me?.has_parent ?? false,
    needsAdult: me?.needs_adult ?? false,
    ready: me !== null,
  }

  return (
    <div className={`min-h-dvh bg-bg ${home ? '' : 'pb-24 lg:pb-4'}`}>
      <header
        data-testid="shell-header"
        className={HEADER_CLS}
      >
        <Logo />
        <nav
          aria-label={t('shell.nav')}
          data-testid="main-nav"
          className={NAV_CLS}
        >
          {/* Задания даёт учитель класса: у ребёнка без класса вкладке нечего показать */}
          {TABS.filter((tab) => tab.key !== 'tasks' || me?.class).map((tab) => (
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
        <div className="ml-auto flex shrink-0 items-center gap-1.5 s380:gap-2 lg:justify-self-end big:gap-4">
          <LangSwitch />
          {me && (
            <>
              <span
                data-testid="coins"
                title={me.coins === null ? t('shell.coinsUnknown') : t('child.coins')}
                className="flex h-9 shrink-0 items-center justify-center gap-1 rounded-full bg-primary-soft px-2 text-sm font-extrabold text-heading s380:px-3 s380:text-base lg:h-11 lg:gap-2 lg:text-lg"
              >
                <img key={me.coins} src="/art/coin.webp" alt="" className="coin-flip h-6 w-6 lg:h-7 lg:w-7" />
                <span key={`n-${me.coins}`} className="coin-tick">{me.coins ?? '—'}</span>
              </span>
              <div ref={menuRef} className="relative shrink-0">
                <button
                  type="button"
                  data-testid="avatar-me"
                  aria-haspopup="dialog"
                  aria-expanded={menu}
                  aria-label={t('shell.account')}
                  onClick={() => setMenu((v) => !v)}
                  className="block rounded-full lg:h-11"
                >
                  <Avatar nick={me.nick} className="h-9 w-9 s380:h-10 s380:w-10 lg:h-11 lg:w-11" />
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
                    {!me.class && (
                      <form onSubmit={(e) => void join(e)} data-testid="join-class" className="mt-3">
                        <label htmlFor="class-code" className="text-sm font-extrabold text-heading">
                          {t('child.classCode')}
                        </label>
                        <div className="mt-1 flex gap-2">
                          <input
                            id="class-code"
                            data-testid="class-code-input"
                            value={code}
                            maxLength={12}
                            autoComplete="off"
                            onChange={(e) => setCode(e.target.value.toUpperCase())}
                            className="h-10 w-full min-w-0 rounded-full border border-border bg-surface px-3 font-extrabold uppercase tracking-widest text-heading outline-none focus:border-primary"
                          />
                          <button
                            type="submit"
                            disabled={!code.trim()}
                            className="h-10 shrink-0 rounded-full bg-primary px-4 text-sm font-extrabold text-primary-fg disabled:opacity-50"
                          >
                            {t('child.join')}
                          </button>
                        </div>
                        <ErrorText code={err} />
                      </form>
                    )}
                    <p className="mt-3 flex items-start gap-2 text-sm text-muted">
                      <img src="/art/coin.webp" alt="" className="h-5 w-5 shrink-0" />
                      {t('child.moreCoins')}
                    </p>
                    {!me.has_parent && (
                      <div className="mt-3">
                        <button
                          type="button"
                          data-testid="parent-code"
                          onClick={() => void parentCode()}
                          className="w-full rounded-full bg-primary-soft px-4 py-2 text-sm font-extrabold text-primary"
                        >
                          {t('cab.child.parentCode')}
                        </button>
                        {typeof link === 'object' && link && (
                          <div className="mt-2 text-center">
                            <p className="text-xs font-extrabold uppercase text-primary">{t('cab.child.codeTitle')}</p>
                            <p data-testid="parent-code-value" className="text-4xl font-extrabold tracking-widest text-heading">
                              {link.code}
                            </p>
                            <p className="text-xs text-muted">{t('cab.child.expires', { min: link.min })}</p>
                          </div>
                        )}
                        {link === 'already_linked' && (
                          <p data-testid="parent-code-error" className="mt-2 text-sm font-bold text-muted">
                            {t('cab.child.alreadyLinked')}
                          </p>
                        )}
                        {link === 'generic' && <p data-testid="parent-code-error" className="mt-2 text-sm font-bold text-danger">{t('errors.generic')}</p>}
                      </div>
                    )}
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
      <main className="px-4 pb-5 pt-1.5 md:px-8 md:pb-0 lg:pt-4">
        {me?.needs_adult && (
          <p data-testid="needs-adult" className="mb-4 rounded-card border border-border bg-primary-soft p-3 text-sm font-bold text-heading">
            {t('cab.child.needsAdult')}
          </p>
        )}
        <Outlet context={ctx} />
      </main>
      {home && <SiteFooter />}
    </div>
  )
}
