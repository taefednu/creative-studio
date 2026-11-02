import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

const DOCS = [
  { key: 'privacy', href: 'https://mentorium.uz/privacy/' },
  { key: 'consent', href: 'https://mentorium.uz/consent/' },
  { key: 'cookies', href: 'https://mentorium.uz/cookies/' },
] as const

const linkCls = 'text-[15px] text-footer-text hover:text-primary-fg'

function Col({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.1em] text-footer-muted">{title}</p>
      <ul className="mt-4 flex flex-col gap-3">{children}</ul>
    </div>
  )
}

/** Подвал главной, как на mentorium.uz. Документы и контакты общие с Mentorium, поэтому ведут на его сайт. */
export default function SiteFooter({ guest }: { guest?: boolean }) {
  const { t } = useTranslation()
  const external = { target: '_blank', rel: 'noopener noreferrer' }
  return (
    <footer data-testid="site-footer" className="relative overflow-hidden bg-footer pt-12 text-footer-text lg:pt-[70px]">
      <div className="relative mx-auto grid max-w-[1264px] gap-8 px-5 sm:grid-cols-2 lg:grid-cols-[1.45fr_1fr_1fr_1fr] lg:px-8">
        <div>
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
      <div className="relative mx-auto mt-10 flex max-w-[1264px] flex-col items-start justify-between gap-4 border-t border-footer-line px-5 pt-6 sm:flex-row sm:items-center lg:px-8">
        <p className="text-[13px] text-footer-muted">{t('footer.copyright', { year: new Date().getFullYear() })}</p>
        <div className="flex items-center gap-4">
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
      <div aria-hidden="true" className="relative mt-6 flex h-[156px] justify-center overflow-hidden sm:h-[200px] lg:h-[176px]">
        <img src="/art/logo-on-dark.webp" alt="" className="h-[150px] w-auto max-w-none opacity-[0.07] sm:h-[220px] lg:h-[244px]" />
        <img src="/art/robot-wave.webp" alt="" className="absolute bottom-2 right-[7%] hidden h-[156px] w-auto lg:block" />
      </div>
    </footer>
  )
}
