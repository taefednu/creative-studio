import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router-dom'
import { LANGS, setLang } from '../i18n'

const TABS = [
  { to: '/', key: 'feed' },
  { to: '/create', key: 'create' },
  { to: '/tasks', key: 'tasks' },
  { to: '/mine', key: 'mine' },
] as const

export default function AppShell() {
  const { t, i18n } = useTranslation()
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
        <div className="ml-auto flex gap-1" role="group" aria-label={t('lang.label')}>
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              data-testid={`lang-${l}`}
              aria-pressed={i18n.language === l}
              onClick={() => setLang(l)}
              className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase ${
                i18n.language === l ? 'bg-primary-soft text-primary' : 'text-muted'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </header>
      <main className="px-4 py-6 md:px-8">
        <Outlet />
      </main>
    </div>
  )
}
