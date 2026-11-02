import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { TemplateInfo } from '../features/works/works'

const MENTORIUM_URL = 'https://mentorium.uz/'

type Side = { key: 'coins' | 'safe' | 'tasks'; art: string; tint: string; link: ReactNode }

function SideBanner({ title, text, art, tint, link, testid }: { title: string; text: string; art: string; tint: string; link: ReactNode; testid: string }) {
  return (
    <article data-testid={testid} className={`relative flex min-h-[168px] flex-col items-start overflow-hidden rounded-[24px] p-3 sm:p-4 lg:min-h-0 lg:rounded-[28px] lg:p-5 ${tint}`}>
      <h2 className="relative text-base font-extrabold leading-tight text-heading sm:max-w-[78%] sm:text-lg lg:text-[22px]">{title}</h2>
      <p className="relative mt-1.5 hidden max-w-[66%] text-sm font-semibold leading-snug text-text sm:block lg:max-w-[72%]">{text}</p>
      <div className="relative mt-auto pt-3">{link}</div>
      <img src={art} alt="" className="pointer-events-none absolute -bottom-2 -right-2 h-[64px] w-auto sm:h-[100px] lg:h-[116px]" />
    </article>
  )
}

const sideLink = 'inline-flex h-9 items-center rounded-full bg-surface px-3 text-[13px] font-extrabold text-primary shadow-card sm:px-3.5 sm:text-sm'

/** Верх главной: что это за продукт (главная фишка, монеты Mentorium, безопасность или задания) и ряд стилей. Ведут в настоящие экраны. */
export default function HomeBanners({ guest, templates }: { guest?: boolean; templates?: TemplateInfo[] }) {
  const { t } = useTranslation()
  const third: Side = guest
    ? { key: 'safe', art: '/art/shield.webp', tint: 'bg-banner-sky', link: <Link to="/login" className={sideLink}>{t('home.safe.cta')}</Link> }
    : { key: 'tasks', art: '/art/clipboard.webp', tint: 'bg-banner-sky', link: <Link to="/tasks" className={sideLink}>{t('home.tasks.cta')}</Link> }
  return (
    <>
      <section data-testid="home-banners" className="mt-1 grid grid-cols-2 gap-2 lg:h-[288px] lg:grid-cols-[2fr_1fr_1fr] lg:gap-3">
        <article data-testid="home-hero" className="relative flex min-h-[224px] flex-col items-start overflow-hidden rounded-[28px] bg-primary-grad p-5 col-span-2 lg:col-span-1 lg:min-h-0 lg:p-6">
          <p className="relative text-xs font-extrabold uppercase tracking-wider text-primary-fg lg:text-sm">{t('home.hero.kicker')}</p>
          <h1 className="relative mt-1.5 max-w-[62%] text-[28px] font-black leading-[1.05] text-primary-fg lg:text-[42px]">{t('home.hero.title')}</h1>
          <p className="relative mt-2 max-w-[58%] text-sm font-semibold leading-snug text-primary-fg lg:max-w-[54%] lg:text-base">{t('home.hero.text')}</p>
          <Link
            to={guest ? '/login' : '/create'}
            data-testid="home-hero-cta"
            className="relative mt-auto inline-flex h-11 shrink-0 items-center rounded-[14px] bg-surface px-5 text-base font-extrabold text-primary shadow-pop"
          >
            {t('home.hero.cta')}
          </Link>
          <img src="/art/banner-alive.webp" alt="" className="pointer-events-none absolute -right-4 bottom-1 w-[44%] max-w-[420px] lg:-right-3 lg:bottom-4 lg:w-[46%]" />
        </article>
        <SideBanner
          testid="home-coins"
          title={t('home.coins.title')}
          text={t('home.coins.text')}
          art="/art/coins-big.webp"
          tint="bg-banner-sun"
          link={<a href={MENTORIUM_URL} target="_blank" rel="noopener noreferrer" className={sideLink}>{t('home.coins.cta')}</a>}
        />
        <SideBanner testid={`home-${third.key}`} title={t(`home.${third.key}.title`)} text={t(`home.${third.key}.text`)} art={third.art} tint={third.tint} link={third.link} />
      </section>
      {templates && templates.length > 0 && (
        <section data-testid="home-styles" className="mt-4">
          <h2 className="text-2xl font-extrabold text-heading md:text-[32px] md:leading-[38px]">{t('home.styles')}</h2>
          <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 md:-mx-8 md:px-8 lg:mx-0 lg:grid lg:grid-cols-8 lg:overflow-visible lg:px-0">
            {templates.map((x) => (
              <Link
                key={x.id}
                to={guest ? '/login' : `/create?template=${x.id}`}
                data-testid={`home-style-${x.id}`}
                className="w-[132px] shrink-0 overflow-hidden rounded-2xl border border-border bg-surface shadow-card lg:w-auto"
              >
                <img src={x.image_url} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                <span className="block truncate px-2.5 py-1.5 text-[13px] font-extrabold text-heading">{t(`templates.${x.id}`)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
