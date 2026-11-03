import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useSession } from '../features/auth/session'
import type { Role } from '../features/auth/session'
import { CABINET_EVENT, useReviewCount } from '../features/review/review'
import { useLoad } from '../useLoad'
import { HEADER_CLS, NAV_CLS } from './headerStyles'
import LangSwitch from './LangSwitch'
import Logo from './Logo'
import TabPill from './TabPill'

type Tab = { to: string; icon: string; key: string; end?: boolean; review?: boolean }

const TABS: Record<'parent' | 'teacher', Tab[]> = {
  parent: [
    { to: '/parent', icon: 'kids.webp', key: 'kids', end: true, review: true },
    { to: '/parent/plans', icon: 'crown.webp', key: 'plans' },
  ],
  teacher: [
    { to: '/teacher', icon: 'shield.webp', key: 'review', end: true, review: true },
    { to: '/teacher/tasks', icon: 'tasks', key: 'tasks' },
    { to: '/teacher/classes', icon: 'classes.webp', key: 'classes' },
  ],
}

const loadKids = () => api<{ nick: string }[]>('/api/parent/children')
const loadRooms = () => api<{ id: number }[]>('/api/teacher/classes')

/** Шапка кабинета взрослого: те же Logo и TabPill, что у ребёнка; справа кружок с буквой и меню выхода. */
export default function CabinetHeader({ role }: { role: Exclude<Role, 'child'> }) {
  const { t } = useTranslation()
  const { refresh } = useSession()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const count = useReviewCount()
  const [kids, reloadKids] = useLoad(role === 'parent' ? loadKids : loadNone)
  const [rooms, reloadRooms] = useLoad(role === 'teacher' ? loadRooms : loadNone)
  const [menu, setMenu] = useState(false)
  useEffect(() => {
    const again = () => {
      reloadKids()
      reloadRooms()
    }
    window.addEventListener(CABINET_EVENT, again)
    return () => window.removeEventListener(CABINET_EVENT, again)
  }, [reloadKids, reloadRooms])
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const away = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [menu])

  async function logout() {
    await api('/api/logout', 'POST')
    await refresh()
    navigate('/login')
  }

  const first = (kids as { nick: string }[] | null)?.[0]
  const name =
    role === 'teacher' ? t('cab.meTeacher') : first ? t('cab.meParent', { nick: first.nick }) : t('cab.meParentNoKid')
  const classFeed = (rooms as { id: number }[] | null)?.[0]
  const tabs: Tab[] =
    role === 'teacher'
      ? [...TABS.teacher, { to: pathname.startsWith('/teacher/feed/') ? pathname : classFeed ? `/teacher/feed/${classFeed.id}` : '/teacher/classes', icon: 'feed', key: 'classfeed' }]
      : TABS.parent

  return (
    <header
      data-testid="cabinet-header"
      className={HEADER_CLS}
    >
      <Logo />
      <nav
        aria-label={t('cab.nav')}
        className={NAV_CLS}
      >
        {tabs.map((tab) => (
          <TabPill
            key={tab.key}
            to={tab.to}
            end={tab.end}
            icon={tab.icon}
            testid={`tab-${tab.key}`}
            label={t(`cab.tabs.${tab.key}`)}
            badge={tab.review ? count : null}
                      />
        ))}
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-1.5 s380:gap-2 lg:justify-self-end big:gap-4">
        <LangSwitch />
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            data-testid="me-adult"
            aria-haspopup="dialog"
            aria-expanded={menu}
            aria-label={t('cab.account')}
            onClick={() => setMenu((v) => !v)}
            className="flex items-center gap-2 rounded-full lg:h-11"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-lg font-extrabold text-primary lg:h-11 lg:w-11 lg:text-lg">
              {[...name][0]}
            </span>
            <span className="hidden text-base font-extrabold text-heading big:inline">{name}</span>
          </button>
          {menu && (
            <div
              role="dialog"
              aria-label={t('cab.account')}
              className="absolute right-0 top-full z-40 mt-2 w-60 rounded-card border border-border bg-surface p-4 shadow-card"
            >
              <p className="text-lg font-extrabold text-heading">{name}</p>
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
      </div>
    </header>
  )
}

const loadNone = () => Promise.resolve(null)
