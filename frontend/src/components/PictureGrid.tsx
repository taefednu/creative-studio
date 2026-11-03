import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PASSWORD_LENGTH, shuffledPictures } from '../features/auth/pictures'

type Props = { value: number[]; onChange: (v: number[]) => void }

/** Выбор 3 картинок по порядку. Слоты — точки, номеров на сетке нет: пароль не подсмотреть. */
export default function PictureGrid({ value, onChange }: Props) {
  const { t } = useTranslation()
  const [order, setOrder] = useState(() => shuffledPictures())
  const grid = useRef<HTMLDivElement>(null)

  function reshuffle() {
    setOrder(shuffledPictures())
    grid.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' })
  }

  return (
    <div>
      <div className="mb-2 flex h-10 items-center justify-center gap-2" data-testid="pic-slots" aria-live="polite">
        {Array.from({ length: PASSWORD_LENGTH }, (_, i) => (
          <span
            key={i}
            data-filled={i < value.length}
            className="flex h-10 flex-1 items-center justify-center rounded-2xl border-2 border-dashed border-border"
          >
            <span className={`h-4 w-4 rounded-full ${i < value.length ? 'bg-primary' : 'bg-primary-soft'}`} />
          </span>
        ))}
        <button
          type="button"
          data-testid="pic-clear"
          aria-label={t('auth.clear')}
          title={t('auth.clear')}
          onClick={() => {
            onChange([])
            reshuffle()
          }}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:text-primary ${value.length ? '' : 'invisible'}`}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v4.5h4.5" />
          </svg>
        </button>
      </div>
      <div ref={grid} data-testid="pic-grid" className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {order.map((id) => (
          <button
            key={id}
            type="button"
            data-testid={`pic-${id}`}
            aria-label={t('auth.picture')}
            onClick={() => {
              if (value.length >= PASSWORD_LENGTH) return
              onChange([...value, id])
              reshuffle()
            }}
            className="flex aspect-square items-center justify-center rounded-2xl border border-border bg-surface text-4xl shadow-card hover:bg-primary-soft active:bg-primary-soft sm:aspect-[4/3] sm:text-5xl"
          >
            <img src={`/art/pics/${id}.webp`} alt="" className="h-3/4 w-3/4 object-contain" draggable={false} />
          </button>
        ))}
      </div>
    </div>
  )
}
