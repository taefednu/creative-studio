import { useTranslation } from 'react-i18next'

/** Данные не пришли: это не «пусто». Ребёнок видит, что случилось, и может попробовать снова. */
export default function LoadFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div data-testid="load-failed" role="alert" className="err-in my-6 flex flex-wrap items-center gap-4">
      <img src="/art/robot-wave.webp" alt="" className="h-20 w-20 shrink-0 object-contain" />
      <p className="min-w-[8rem] flex-1 text-lg font-extrabold text-heading">{t('load.failed')}</p>
      <button type="button" data-testid="load-retry" onClick={onRetry} className="btn-press h-12 shrink-0 rounded-full bg-primary px-6 font-extrabold text-primary-fg">
        {t('load.retry')}
      </button>
    </div>
  )
}
