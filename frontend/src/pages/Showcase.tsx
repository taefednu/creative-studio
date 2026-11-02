import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import CreatePanel from '../components/CreatePanel'
import FeedView from '../components/FeedView'
import LangSwitch from '../components/LangSwitch'
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
    <div className="min-h-dvh bg-bg pb-24 lg:pb-4">
      <header
        data-testid="guest-header"
        className="flex h-[60px] items-center gap-1.5 border-b border-border bg-surface px-2 s380:gap-2 s380:px-3 lg:sticky lg:top-0 lg:z-30 lg:grid lg:h-16 lg:grid-cols-[1fr_auto_1fr] lg:gap-3 lg:px-8"
      >
        <Logo />
        <nav
          aria-label={t('shell.nav')}
          data-testid="guest-nav"
          className="fixed inset-x-0 bottom-0 z-30 flex h-[72px] items-stretch gap-1 border-t border-border bg-surface px-1 py-1 lg:static lg:z-auto lg:h-auto lg:justify-center lg:justify-self-center lg:gap-1 lg:rounded-full lg:border-0 lg:bg-primary-soft lg:p-1"
        >
          <TabPill to="/" end icon="feed" testid="tab-feed" label={t('nav.feed')} />
          <TabPill to="/create" icon="create" testid="tab-create" label={t('nav.create')} />
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 s380:gap-2 lg:justify-self-end big:gap-4">
          <LangSwitch />
          <Link
            to="/login"
            data-testid="guest-login"
            className="flex h-10 items-center justify-center rounded-full bg-primary px-4 text-base font-extrabold uppercase text-primary-fg shadow-card lg:h-11 lg:min-w-[150px] lg:px-8 lg:text-xl"
          >
            {t('showcase.login')}
          </Link>
        </div>
      </header>
      <main className="px-4 py-5 md:px-[35px] md:pb-0 pt-1.5 lg:pt-[17px]">
        <FeedView
          kinds={['best']}
          title={t('showcase.title')}
          guest
          child={templates ? { templates, onStyle: setPicked } : undefined}
        />
        {templates && <CreatePanel guest floating templates={templates} price={tplData?.price} tpl={tpl} onTpl={setPicked} />}
      </main>
    </div>
  )
}
