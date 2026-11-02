import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { TemplateInfo } from '../features/works/works'

const sideCls = 'relative flex min-h-[148px] flex-col items-start overflow-hidden rounded-card p-3 lg:col-span-2 lg:min-h-0 lg:px-5 lg:py-3'

function SideBody({ title, text, cta, art }: { title: string; text: string; cta: string; art: string }) {
  return (
    <>
      <span className="relative block text-base font-extrabold leading-tight text-heading lg:max-w-[72%] lg:text-xl">{title}</span>
      <span className="relative mt-1 hidden text-sm font-semibold leading-snug text-text lg:block lg:max-w-[72%]">{text}</span>
      <span className="relative mt-1.5 text-sm font-extrabold text-primary lg:mt-auto">{cta} →</span>
      <img src={art} alt="" className="pointer-events-none absolute bottom-1 right-1 h-[60px] w-auto lg:bottom-auto lg:right-3 lg:top-1/2 lg:h-[92px] lg:-translate-y-1/2" />
    </>
  )
}

/** Подпись и карточка стиля в одну колонку ленты; что не влезло в ряд, ведёт в «Все стили». */
const styleVisible = (i: number) => (i < 4 ? '' : i === 4 ? 'lg:hidden xl:block' : 'lg:hidden')

/** Верх главной на сетке ленты: что это за продукт и ряд стилей. Края блоков совпадают с краями колонок ленты. */
export default function HomeBanners({ guest, templates }: { guest?: boolean; templates?: TemplateInfo[] }) {
  const { t } = useTranslation()
  const third = guest ? 'safe' : 'tasks'
  const side = (key: string): ReactNode => (
    <SideBody title={t(`home.${key}.title`)} text={t(`home.${key}.text`)} cta={t(`home.${key}.cta`)} art={key === 'coins' ? '/art/coins-big.webp' : key === 'safe' ? '/art/shield.webp' : '/art/clipboard.webp'} />
  )
  return (
    <>
      <section data-testid="home-banners" className="grid grid-cols-2 gap-2 lg:h-[256px] lg:grid-cols-5 lg:grid-rows-2 lg:gap-3 xl:grid-cols-6">
        <article data-testid="home-hero" className="relative col-span-2 flex min-h-[224px] flex-col items-start overflow-hidden rounded-card bg-primary-grad p-4 lg:col-span-3 lg:row-span-2 lg:min-h-0 lg:p-6 xl:col-span-4">
          <p className="relative text-xs font-extrabold uppercase tracking-wider text-primary-fg lg:text-sm">{t('home.hero.kicker')}</p>
          <h1 className="relative mt-1 max-w-[64%] text-[28px] font-black leading-[1.05] text-primary-fg lg:max-w-[60%] lg:text-[40px]">{t('home.hero.title')}</h1>
          <p className="relative mb-3 mt-2 max-w-[58%] text-sm font-semibold leading-snug text-primary-fg lg:text-base">{t('home.hero.text')}</p>
          <Link
            to={guest ? '/login' : '/create'}
            data-testid="home-hero-cta"
            className="relative mt-auto inline-flex h-11 shrink-0 items-center rounded-[14px] bg-surface px-5 text-base font-extrabold text-primary shadow-pop"
          >
            {t('home.hero.cta')}
          </Link>
          <img src="/art/banner-alive.webp" alt="" className="pointer-events-none absolute bottom-1 right-1 w-[42%] lg:bottom-auto lg:right-2 lg:top-1/2 lg:-translate-y-1/2" />
        </article>
        <a href="https://mentorium.uz/" target="_blank" rel="noopener noreferrer" data-testid="home-coins" className={`${sideCls} bg-banner-sun`}>
          {side('coins')}
        </a>
        <Link to={guest ? '/login' : '/tasks'} data-testid={`home-${third}`} className={`${sideCls} bg-banner-sky`}>
          {side(third)}
        </Link>
      </section>
      {templates && templates.length > 0 && (
        <section data-testid="home-styles" className="mt-6">
          <h2 className="text-2xl font-extrabold text-heading md:text-[28px] md:leading-[34px]">{t('home.styles')}</h2>
          <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:-mx-8 md:px-8 lg:mx-0 lg:grid lg:grid-cols-5 lg:gap-3 lg:overflow-visible lg:px-0 lg:pb-0 xl:grid-cols-6">
            {templates.map((x, i) => (
              <Link
                key={x.id}
                to={guest ? '/login' : `/create?template=${x.id}`}
                data-testid={`home-style-${x.id}`}
                className={`w-[132px] shrink-0 overflow-hidden rounded-card border border-border bg-surface shadow-card lg:w-auto ${styleVisible(i)}`}
              >
                <img src={x.image_url} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                <span className="block truncate px-3 py-1.5 text-[13px] font-extrabold text-heading">{t(`templates.${x.id}`)}</span>
              </Link>
            ))}
            <Link
              to={guest ? '/login' : '/create'}
              data-testid="home-style-all"
              className="hidden flex-col items-center justify-center gap-1 rounded-card bg-primary-soft text-[15px] font-extrabold text-primary lg:flex"
            >
              <img src="/art/tab-create.webp" alt="" className="h-12 w-12" />
              {t('panel.allStyles')}
            </Link>
          </div>
        </section>
      )}
    </>
  )
}
