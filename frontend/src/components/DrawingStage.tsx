export type DrawingPhase = 'look' | 'glow' | 'reveal'

type Props = { src: string | null; result?: string | null; phase: DrawingPhase; title: string }

/**
 * Оживление рисунка: фото ребёнка на месте, по нему идёт свет, пока проверка (look); размывается и светится, пока рисует модель (glow);
 * из размытия проступает картинка (reveal). Фото своё и только на этом устройстве; result приходит, только когда работа прошла проверку.
 */
export default function DrawingStage({ src, result, phase, title }: Props) {
  return (
    <div data-testid="drawing-stage" data-phase={phase} className="drawing-stage -mx-4 flex flex-col items-center overflow-clip px-4 pb-20 lg:pb-8 lg:[overflow-clip-margin:28px] text-center md:-mx-8 md:px-8">
      <p key={title} aria-live="polite" className="gen-title text-2xl font-extrabold text-heading lg:text-3xl">{title}</p>
      <div className="relative mt-4 aspect-square w-[min(100%,calc(100dvh-210px))] min-w-[240px] lg:w-[min(100%,calc(100dvh-200px))]">
        <div aria-hidden="true" className="drawing-aura absolute -inset-4 rounded-full lg:-inset-8" />
        <div className="absolute inset-0 overflow-hidden rounded-[28px] bg-surface shadow-pop">
          {src && <img src={src} alt="" data-testid="drawing-photo" className="drawing-photo absolute inset-0 h-full w-full object-contain" />}
          {phase === 'look' && <div aria-hidden="true" className="drawing-light absolute inset-0" />}
          {/* Цветное свечение и внутри рамки: тонкий рисунок на белом после размытия иначе становится пустым листом */}
          <div aria-hidden="true" className="drawing-wash absolute -inset-1/4 rounded-full" />
          {phase === 'glow' && <div aria-hidden="true" className="drawing-breath absolute inset-0" />}
          {result && <img src={result} alt="" data-testid="drawing-result" className="drawing-result absolute inset-0 h-full w-full object-cover" />}
        </div>
      </div>
    </div>
  )
}
