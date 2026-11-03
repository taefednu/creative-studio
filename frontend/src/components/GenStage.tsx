import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Work } from '../features/works/works'

// Кисть идёт змейкой сверху вниз и закрывает весь холст
const BRUSH = 'M40 80C300 30 700 130 960 70C1010 140 1010 150 960 230C700 180 300 280 40 240C-10 300 -10 320 40 400C300 350 700 450 960 390C1010 460 1010 470 960 550C700 500 300 600 40 560C-10 620 -10 640 40 720C300 670 700 770 960 710C1010 780 1010 790 960 870C700 820 300 920 40 880C-10 940 -10 960 40 1040'
// Сначала быстро, потом всё медленнее: сколько рисует модель, заранее неизвестно, а холст не должен закончиться раньше неё
const PAINT = { dur: '40s', fill: 'freeze', calcMode: 'spline', keyTimes: '0;1', keySplines: '0.15 0.6 0.25 1' } as const
const BRISTLES = [-118, -96, 96, 118]

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Образец стиля, сжатый до пятен цвета: растянутый браузером, он сам становится мягкой краской и почти ничего не стоит. */
function usePaint(sample: string) {
  const [paint, setPaint] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = c.height = 40
      c.getContext('2d')?.drawImage(img, 0, 0, 40, 40)
      if (alive) setPaint(c.toDataURL('image/png'))
    }
    img.src = sample
    return () => {
      alive = false
    }
  }, [sample])
  return paint
}

/** Холст: мазки открывают краску в цветах стиля, робот ведёт кисть. Кисть и мазок на одном пути и с одной кривой, поэтому не расходятся. */
function Canvas({ paint, filled }: { paint: string; filled: boolean }) {
  const stroke = { fill: 'none', stroke: 'white', strokeLinecap: 'round', pathLength: 100, strokeDasharray: 100 } as const
  const reveal = <animate attributeName="stroke-dashoffset" from="100" to="0" {...PAINT} />
  return (
    <svg data-testid="gen-canvas" viewBox="0 0 1000 1000" className="absolute inset-0 h-full w-full" aria-hidden="true">
      <mask id="gen-paint" maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000">
        <path d={BRUSH} {...stroke} strokeWidth="190">{reveal}</path>
        {BRISTLES.map((y) => (
          <path key={y} d={BRUSH} {...stroke} strokeWidth="9" transform={`translate(0 ${y})`}>{reveal}</path>
        ))}
        {filled && <rect width="1000" height="1000" fill="white" className="gen-fill" />}
      </mask>
      <image href={paint} width="1000" height="1000" preserveAspectRatio="none" mask="url(#gen-paint)" />
      {!filled && (
        <g>
          <animateMotion path={BRUSH} keyPoints="0;1" {...PAINT} />
          <image href="/art/robot-brush.webp" x="-40" y="-250" width="330" height="330" className="gen-painter" />
        </g>
      )}
    </svg>
  )
}

/**
 * Экран рисования (work-progress). Стадии идут только от настоящих статусов работы:
 * checking → generating → generating с файлом (идёт проверка картинки). Процентов и таймера нет: их неоткуда взять.
 * Краска на холсте из образца стиля, а не из картинки ребёнка: готовую работу показываем только после проверки.
 */
export default function GenStage({ work, sample = '/art/custom-style.webp', styleName, title: fixed }: { work: Work; sample?: string; styleName?: string; title?: string }) {
  const { t } = useTranslation()
  const paint = usePaint(sample)
  const drawn = work.status === 'generating' && !!work.drawn
  const painting = work.status === 'generating'
  const upload = work.kind === 'upload'
  const words = (work.idea || styleName || '').split(/\s+/).filter(Boolean).slice(0, 8)
  const title = fixed ?? (drawn
    ? t('gen.verify')
    : painting
      ? work.kind === 'alive' ? t('gen.alive') : t('gen.draw', { style: styleName ?? '', interpolation: { escapeValue: false } })
      : t(upload ? 'gen.readUpload' : 'gen.read'))

  return (
    <div data-testid="work-progress" className="mx-auto flex max-w-xl flex-col items-center text-center">
      <p key={title} aria-live="polite" className="gen-title text-2xl font-extrabold text-heading lg:text-3xl">{title}</p>
      <div className="gen-stage relative mt-4 aspect-square w-[min(100%,calc(100dvh-260px))] min-w-[240px] overflow-hidden rounded-[28px] border border-border bg-surface shadow-pop">
        {painting && paint && <Canvas paint={paint} filled={drawn || reduced()} />}
        {!painting && <img src="/art/robot-brush.webp" alt="" className="gen-robot absolute inset-0 m-auto h-1/2 w-auto" />}
        <div className="absolute inset-x-0 top-0 flex flex-wrap items-center justify-center gap-2 p-5">
          {words.map((w, i) => (
            <span
              key={`${w}-${i}`}
              style={{ animationDelay: `${i * (painting ? 40 : 70)}ms` }}
              className={`rounded-full bg-bg px-3 py-1 text-base font-extrabold text-heading ${painting ? 'gen-word-fall' : 'gen-word-in'}`}
            >
              {w}
            </span>
          ))}
        </div>
        {drawn && (
          <div data-testid="gen-verify" className="absolute inset-0 flex items-center justify-center">
            <svg viewBox="0 0 120 120" className="gen-lens h-1/3 w-1/3" fill="none" strokeLinecap="round" aria-hidden="true">
              <circle cx="50" cy="50" r="36" className="fill-surface/40 stroke-surface" strokeWidth="10" />
              <path d="M78 78l30 30" className="stroke-surface" strokeWidth="14" />
            </svg>
          </div>
        )}
      </div>
      {work.rewrite_text && (
        <p data-testid="rewrite" className="mt-3 rounded-2xl bg-primary-soft px-4 py-2 text-base font-bold text-heading">
          {t('create.rewrite', { text: work.rewrite_text })}
        </p>
      )}
    </div>
  )
}
