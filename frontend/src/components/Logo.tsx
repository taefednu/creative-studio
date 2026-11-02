import { useTranslation } from 'react-i18next'

export default function Logo() {
  const { t } = useTranslation()
  return (
    <div data-testid="logo" className="flex w-[110px] min-w-0 shrink flex-col items-center lg:w-auto lg:shrink-0 lg:flex-row lg:gap-3">
      <img src="/mentorium-logo.png" alt="Mentorium" className="h-auto w-full lg:w-[136px]" />
      <span className="-mt-0.5 text-[10px] font-bold leading-none text-primary lg:mt-0 lg:w-min lg:border-l lg:border-border lg:pl-3 lg:text-[13px] lg:font-extrabold lg:leading-[1.1]">{t('app.name')}</span>
    </div>
  )
}
