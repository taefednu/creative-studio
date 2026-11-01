import { useTranslation } from 'react-i18next'
import { PASSWORD_LENGTH, PICTURES } from '../features/auth/pictures'

type Props = { value: number[]; onChange: (v: number[]) => void }

/** Выбор 3 картинок по порядку. Слоты — точки, номеров на сетке нет: пароль не подсмотреть. */
export default function PictureGrid({ value, onChange }: Props) {
  const { t } = useTranslation()
  return (
    <div>
      <div className="mb-2 flex items-center gap-2" data-testid="pic-slots" aria-live="polite">
        {Array.from({ length: PASSWORD_LENGTH }, (_, i) => (
          <span
            key={i}
            data-filled={i < value.length}
            className={`h-4 w-4 rounded-full border-2 border-primary ${i < value.length ? 'bg-primary' : 'bg-surface'}`}
          />
        ))}
        <button
          type="button"
          data-testid="pic-clear"
          onClick={() => onChange([])}
          className="ml-2 text-xs font-bold text-muted underline"
        >
          {t('auth.clear')}
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {PICTURES.map((emoji, id) => (
          <button
            key={id}
            type="button"
            data-testid={`pic-${id}`}
            aria-label={t('auth.picture')}
            onClick={() => value.length < PASSWORD_LENGTH && onChange([...value, id])}
            className="flex aspect-square items-center justify-center rounded-2xl border border-border bg-surface text-3xl shadow-card hover:bg-primary-soft"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
