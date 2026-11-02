import { useTranslation } from 'react-i18next'
import { PASSWORD_LENGTH, PICTURES } from '../features/auth/pictures'

type Props = { value: number[]; onChange: (v: number[]) => void }

/** Выбор 3 картинок по порядку. Слоты — точки, номеров на сетке нет: пароль не подсмотреть. */
export default function PictureGrid({ value, onChange }: Props) {
  const { t } = useTranslation()
  return (
    <div>
      <div className="mb-2 flex items-center justify-center gap-2 lg:h-[66px] lg:gap-3 short:h-10" data-testid="pic-slots" aria-live="polite">
        {Array.from({ length: PASSWORD_LENGTH }, (_, i) => (
          <span
            key={i}
            data-filled={i < value.length}
            className="flex h-10 flex-1 items-center justify-center rounded-2xl border-2 border-dashed border-border lg:h-full lg:max-w-[155px]"
          >
            <span className={`h-4 w-4 rounded-full ${i < value.length ? 'bg-primary' : 'bg-primary-soft'}`} />
          </span>
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
      <div data-testid="pic-grid" className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {PICTURES.map((_, id) => (
          <button
            key={id}
            type="button"
            data-testid={`pic-${id}`}
            aria-label={t('auth.picture')}
            onClick={() => value.length < PASSWORD_LENGTH && onChange([...value, id])}
            className="flex aspect-square items-center justify-center rounded-2xl border border-border bg-surface text-4xl shadow-card hover:bg-primary-soft active:bg-primary-soft sm:aspect-[4/3] sm:text-5xl"
          >
            <img src={`/art/pics/${id}.webp`} alt="" className="h-3/4 w-3/4 object-contain" draggable={false} />
          </button>
        ))}
      </div>
    </div>
  )
}
