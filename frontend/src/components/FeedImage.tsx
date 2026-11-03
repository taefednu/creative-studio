import { useState } from 'react'

type Props = { src: string; alt: string; eager?: boolean; className: string; testid?: string; preview?: string }

/** Картинка ленты: пока грузится, на её месте перелив; готовая проявляется, а не выскакивает. Родитель задаёт размер и relative. */
export default function FeedImage({ src, alt, eager, className, testid, preview }: Props) {
  const [state, setState] = useState<'wait' | 'ok' | 'bad'>('wait')
  return (
    <>
      {state === 'wait' && <span data-testid="image-wait" aria-hidden="true" className="skeleton absolute inset-0" />}
      {/* превью уже есть из ленты: окно не пустое, пока идёт большая картинка */}
      {preview && <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover" />}
      <img
        src={src}
        alt={alt}
        data-testid={testid}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className={`feed-img ${state === 'ok' ? 'feed-img-on' : ''} ${className}`}
        onLoad={() => setState('ok')}
        onError={() => setState('bad')}
      />
    </>
  )
}
