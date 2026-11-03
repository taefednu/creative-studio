import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

const DOCS = [
  { key: 'privacy', href: 'https://mentorium.uz/privacy/' },
  { key: 'consent', href: 'https://mentorium.uz/consent/' },
  { key: 'cookies', href: 'https://mentorium.uz/cookies/' },
] as const

const linkCls = 'text-[15px] text-footer-text transition-colors duration-150 hover:text-primary-fg'

function Col({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.1em] text-footer-muted">{title}</p>
      <ul className="mt-4 flex flex-col gap-3">{children}</ul>
    </div>
  )
}

function Promo({ testid, tint, art, title, text, cta, href, to }: { testid: string; tint: string; art: string; title: string; text: string; cta: string; href?: string; to?: string }) {
  const body = (
    <>
      <span className="block max-w-[70%] text-xl font-black leading-tight text-heading lg:text-[32px]">{title}</span>
      <span className="mt-2 block max-w-[62%] text-sm font-semibold leading-snug text-text lg:text-lg">{text}</span>
      <span className="mt-auto block pt-3 text-base font-extrabold text-primary">{cta} →</span>
      <img src={art} alt="" className="promo-art pointer-events-none absolute bottom-2 right-3 h-[92px] w-auto lg:bottom-auto lg:top-1/2 lg:h-[168px] lg:-translate-y-1/2" />
    </>
  )
  const cls = `promo relative flex min-h-[176px] flex-col overflow-hidden rounded-card p-5 lg:min-h-[248px] lg:p-8 ${tint}`
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" data-testid={testid} className={cls}>{body}</a>
  ) : (
    <Link to={to ?? '/'} data-testid={testid} className={cls}>{body}</Link>
  )
}

/** Подвал главной, как на mentorium.uz. Документы и контакты общие с Mentorium, поэтому ведут на его сайт. */
export default function SiteFooter({ guest }: { guest?: boolean }) {
  const { t } = useTranslation()
  const third = guest ? 'safe' : 'tasks'
  const external = { target: '_blank', rel: 'noopener noreferrer' }
  return (
    <>
    <section data-testid="home-promo" className="grid gap-2 px-4 pb-8 pt-4 md:px-8 lg:grid-cols-2 lg:gap-3 lg:pb-12">
      <Promo testid="home-coins" tint="bg-banner-sun" art="/art/coins-big.webp" title={t('home.coins.title')} text={t('home.coins.text')} cta={t('home.coins.cta')} href="https://mentorium.uz/" />
      <Promo testid={`home-${third}`} tint="bg-banner-sky" art={guest ? '/art/shield.webp' : '/art/clipboard.webp'} title={t(`home.${third}.title`)} text={t(`home.${third}.text`)} cta={t(`home.${third}.cta`)} to={guest ? '/login' : '/tasks'} />
    </section>
    <footer data-testid="site-footer" className="relative overflow-hidden bg-footer pt-12 text-footer-text lg:pt-[70px]">
      <div className="relative grid grid-cols-2 gap-x-2 gap-y-8 px-4 md:px-8 lg:grid-cols-5 lg:gap-x-3 xl:grid-cols-6">
        <div className="col-span-2 xl:col-span-3">
          <img src="/art/logo-on-dark.webp" alt="Mentorium" className="h-[30px] w-auto" />
          <p className="mt-4 max-w-[320px] text-[15px] leading-relaxed">{t('footer.brand')}</p>
          <p className="mt-2 text-[13px] text-footer-muted">{t('footer.city')}</p>
          <Link to={guest ? '/login' : '/create'} data-testid="footer-cta" className="mt-5 inline-flex h-11 items-center rounded-[14px] bg-primary px-5 text-[15px] font-extrabold text-primary-fg">
            {t('footer.cta')}
          </Link>
        </div>
        <Col title={t('footer.sections')}>
          <li><Link to="/" className={linkCls}>{t('nav.feed')}</Link></li>
          <li><Link to={guest ? '/login' : '/create'} className={linkCls}>{t('nav.create')}</Link></li>
          <li><Link to="/login" className={linkCls}>{t('footer.parents')}</Link></li>
          <li><Link to="/login" className={linkCls}>{t('footer.teachers')}</Link></li>
          <li><a href="https://mentorium.uz/" {...external} className={linkCls}>{t('footer.about')}</a></li>
        </Col>
        <Col title={t('footer.contacts')}>
          <li><a href="mailto:info@mentorium.uz" className={linkCls}>info@mentorium.uz</a></li>
          <li><a href="tel:+998995312345" className={linkCls}>+998 99 531 23 45</a></li>
          <li><a href="https://t.me/taefednu" {...external} className={linkCls}>Telegram</a></li>
        </Col>
        <Col title={t('footer.docs')}>
          {DOCS.map((d) => (
            <li key={d.key}><a href={d.href} {...external} data-testid={`footer-${d.key}`} className={linkCls}>{t(`footer.${d.key}`)}</a></li>
          ))}
        </Col>
      </div>
      <div className="relative mx-4 mt-10 flex flex-col items-start justify-between gap-4 border-t border-footer-line pt-6 sm:flex-row sm:items-center md:mx-8">
        <p className="text-[13px] text-footer-muted">{t('footer.copyright', { year: new Date().getFullYear() })}</p>
        <div className="flex w-full items-center justify-between gap-4 sm:w-auto">
          <p className="text-[13px] text-footer-muted">{t('footer.models')}</p>
          <button
            type="button"
            data-testid="footer-top"
            aria-label={t('footer.top')}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
      <div aria-hidden="true" className="relative mx-4 mt-8 pb-[84px] md:mx-8 lg:pb-6">
        <img src="/art/logo-on-dark.webp" alt="" className="footer-mark w-full opacity-[0.07]" />
        <img src="/art/robot-wave.webp" alt="" className="footer-robot absolute bottom-6 right-0 hidden h-[156px] w-auto lg:block" />
      </div>
    </footer>
    </>
  )
}
