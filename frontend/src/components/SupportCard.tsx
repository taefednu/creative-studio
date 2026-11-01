import { useTranslation } from 'react-i18next'

/** Тёплый ответ ребёнку, которому плохо: никакого робота-идеи, монет, отказа и «нарисуй иначе». Один на экран работы и публикацию. */
export default function SupportCard({ testid, body, onBack }: { testid: string; body: string; onBack?: () => void }) {
  const { t } = useTranslation()
  return (
    <div data-testid={testid} className="mx-auto mt-6 max-w-xl rounded-3xl border border-border bg-surface p-6 text-center shadow-card">
      <h1 data-testid="work-title" className="text-3xl font-extrabold text-heading">{t('create.supportTitle')}</h1>
      <p data-testid="work-body" className="mt-3 text-lg text-text">{t(body)}</p>
      {onBack && (
        <button
          type="button"
          data-testid="try-again"
          onClick={onBack}
          className="mt-5 rounded-full bg-primary px-8 py-3 text-lg font-extrabold uppercase text-primary-fg shadow-card"
        >
          {t('create.supportBack')}
        </button>
      )}
    </div>
  )
}
