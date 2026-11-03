import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import CreatePanel from '../components/CreatePanel'
import FeedView from '../components/FeedView'
import { NAV_CLS } from '../components/headerStyles'
import HomeFilm from '../components/HomeFilm'
import LangSwitch from '../components/LangSwitch'
import SiteFooter from '../components/SiteFooter'
import TabPill from '../components/TabPill'
import Logo from '../components/Logo'
import { loadTemplates } from '../features/works/works'
import { useLoad } from '../useLoad'

/** Открытая витрина для гостя: только «Лучшее». Создавать и реагировать можно после входа. */
export default function Showcase() {
  const { t } = useTranslation()
  const [tplData] = useLoad(loadTemplates)
  const [picked, setPicked] = useState<string | null>(null)
  const templates = tplData?.templates
  const [overFilm, setOverFilm] = useState(true)
  useEffect(() => {
    const check = () => setOverFilm(window.scrollY < window.innerHeight - 80)
    check()
    window.addEventListener('scroll', check, { passive: true })
    window.addEventListener('resize', check)
    return () => {
      window.removeEventListener('scroll', check)
      window.removeEventListener('resize', check)
    }
  }, [])
  const tpl = (templates?.some((x) => x.id === picked) ? picked : null) ?? templates?.[0]?.id ?? null
  return (
    <div className="min-h-dvh bg-bg">
      <header
        data-testid="guest-header"
        className={`fixed inset-x-0 top-0 z-30 flex h-[60px] items-center gap-1.5 border-b px-2 transition-colors duration-200 s380:gap-2 s380:px-4 lg:h-[72px] lg:gap-8 lg:px-8 ${overFilm ? 'border-transparent' : 'border-border bg-bg'}`}
      >
        <Logo onFilm={overFilm} />
        <nav aria-label={t('shell.nav')} data-testid="guest-nav" className={`${NAV_CLS} ${overFilm ? 'lg:hidden' : 'nav-in'}`}>
          <TabPill to="/" end icon="feed" testid="tab-feed" label={t('nav.feed')} />
          <TabPill to="/create" icon="create" testid="tab-create" label={t('nav.create')} />
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 s380:gap-2 big:gap-4">
          <div className={overFilm ? 'rounded-full bg-surface lg:bg-transparent' : ''}>
            <LangSwitch />
          </div>
          <Link
            to="/login"
            data-testid="guest-login"
            className="flex h-10 items-center justify-center rounded-[14px] bg-primary px-4 text-base font-extrabold text-primary-fg lg:h-11 lg:px-6"
          >
            {t('showcase.login')}
          </Link>
        </div>
      </header>
      <HomeFilm feedId="home-feed" />
      <div id="home-feed" data-testid="home-sheet" className="home-sheet relative scroll-mt-0 rounded-t-[32px] bg-bg pt-[76px] shadow-pop lg:pt-[88px]">
        <main className="px-4 pb-5 md:px-8 md:pb-0">
          <FeedView
            kinds={['best']}
            title={t('showcase.title')}
            guest
            child={templates ? { templates, onStyle: setPicked } : undefined}
          />
          {templates && <CreatePanel guest floating templates={templates} price={tplData?.price} tpl={tpl} onTpl={setPicked} />}
        </main>
        <SiteFooter guest />
      </div>
    </div>
  )
}
