import { useState } from 'react'
import type { CSSProperties } from 'react'

const SHIMMER_MS = 1500

/** Заглушка с переливом. Фаза по общим часам: новая заглушка подхватывает волну, а не начинает её заново. */
export function Skeleton({ className, style, ...rest }: { className?: string; style?: CSSProperties; 'data-testid'?: string; 'data-wait'?: boolean }) {
  const [phase] = useState(() => -(performance.now() % SHIMMER_MS))
  return <span aria-hidden="true" {...rest} className={`skeleton ${className ?? ''}`} style={{ ...style, '--shimmer': `${phase}ms` } as CSSProperties} />
}

type Props = { src: string; alt: string; eager?: boolean; className: string; testid?: string; preview?: string }

/** Картинка ленты: заглушка стоит под ней, пока картинка не проявится полностью. Родитель задаёт размер и relative. */
export default function FeedImage({ src, alt, eager, className, testid, preview }: Props) {
  const [state, setState] = useState<'wait' | 'show' | 'done' | 'bad'>('wait')
  return (
    <>
      {(state === 'wait' || state === 'show') && <Skeleton data-testid="image-wait" data-wait={state === 'wait'} className="absolute inset-0" />}
      {/* превью уже есть из ленты: окно не пустое, пока идёт большая картинка */}
      {preview && <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <img
        src={src}
        alt={alt}
        data-testid={testid}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className={`feed-img ${state === 'show' || state === 'done' ? 'feed-img-on' : ''} ${className}`}
        onLoad={(e) => {
          // показываем уже разобранную картинку: иначе первый кадр проявления теряется
          const show = () => setState('show')
          e.currentTarget.decode().then(show, show)
        }}
        onError={() => setState('bad')}
        onTransitionEnd={(e) => e.propertyName === 'opacity' && setState('done')}
      />
    </>
  )
}
