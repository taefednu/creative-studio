import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import CreatePanel from '../components/CreatePanel'
import FeedView from '../components/FeedView'
import { HEADER_CLS, NAV_CLS } from '../components/headerStyles'
import HomeBanners from '../components/HomeBanners'
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
  const tpl = (templates?.some((x) => x.id === picked) ? picked : null) ?? templates?.[0]?.id ?? null
  return (
    <div className="min-h-dvh bg-bg">
      <header
        data-testid="guest-header"
        className={HEADER_CLS}
      >
        <Logo />
        <nav
          aria-label={t('shell.nav')}
          data-testid="guest-nav"
          className={NAV_CLS}
        >
          <TabPill to="/" end icon="feed" testid="tab-feed" label={t('nav.feed')} />
          <TabPill to="/create" icon="create" testid="tab-create" label={t('nav.create')} />
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 s380:gap-2 lg:justify-self-end big:gap-4">
          <LangSwitch />
          <Link
            to="/login"
            data-testid="guest-login"
            className="flex h-10 items-center justify-center rounded-[14px] bg-primary px-4 text-base font-extrabold text-primary-fg lg:h-11 lg:px-6"
          >
            {t('showcase.login')}
          </Link>
        </div>
      </header>
      <main className="px-4 pb-5 pt-1.5 md:px-8 md:pb-0 lg:pt-4">
        <HomeBanners guest templates={templates} />
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
  )
}
