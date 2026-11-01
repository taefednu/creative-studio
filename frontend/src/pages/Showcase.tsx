import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import CreatePanel from '../components/CreatePanel'
import FeedView from '../components/FeedView'
import LangSwitch from '../components/LangSwitch'
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
    <div className="min-h-screen bg-bg pb-4">
      <header
        data-testid="guest-header"
        className="flex h-[60px] items-center gap-1.5 border-b border-border bg-surface px-2 min-[380px]:gap-2 min-[380px]:px-3 lg:h-[87px] lg:gap-3 lg:px-8"
      >
        <Logo />
        <div className="ml-auto flex shrink-0 items-center gap-1.5 min-[380px]:gap-2 2xl:gap-4">
          <LangSwitch />
          <Link
            to="/login"
            data-testid="guest-login"
            className="flex h-10 items-center justify-center rounded-full bg-primary px-4 text-base font-extrabold uppercase text-primary-fg shadow-card lg:h-[55px] lg:min-w-[150px] lg:px-8 lg:text-xl"
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
