import { useTranslation } from 'react-i18next'

export default function Logo() {
  const { t } = useTranslation()
  return (
    <div data-testid="logo" className="flex w-[110px] min-w-0 shrink flex-col items-center lg:w-[205px] lg:shrink-0">
      <img src="/mentorium-logo.png" alt="Mentorium" className="h-auto w-full" />
      <span className="-mt-0.5 text-[10px] font-bold leading-none text-primary lg:text-sm">{t('app.name')}</span>
    </div>
  )
}
