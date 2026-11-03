import { useTranslation } from 'react-i18next'

export default function Logo({ onFilm }: { onFilm?: boolean }) {
  const { t } = useTranslation()
  return (
    <div data-testid="logo" className="flex w-[110px] min-w-0 shrink flex-col items-center lg:w-auto lg:shrink-0 lg:flex-row lg:gap-3">
      <span className="relative block w-full lg:w-[136px]">
        <img src="/mentorium-logo.png" alt="Mentorium" className={`h-auto w-full transition-opacity duration-200 ${onFilm ? 'opacity-0' : ''}`} />
        {onFilm !== undefined && <img src="/art/logo-on-dark.webp" alt="" className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-200 ${onFilm ? '' : 'opacity-0'}`} />}
      </span>
      <span className={`-mt-0.5 text-[10px] font-bold leading-none transition-colors duration-200 ${onFilm ? 'text-primary-fg' : 'text-primary'} lg:mt-0 lg:w-min lg:border-l lg:border-border lg:pl-3 lg:text-[13px] lg:font-extrabold lg:leading-[1.1]`}>{t('app.name')}</span>
    </div>
  )
}
