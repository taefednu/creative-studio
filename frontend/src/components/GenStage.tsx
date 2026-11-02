import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { Work } from '../features/works/works'

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Яркие цвета образца стиля с разными оттенками: сцена рисует красками выбранного стиля. */
function pigmentsOf(img: HTMLImageElement): string[] {
  const c = document.createElement('canvas')
  c.width = c.height = 24
  const g = c.getContext('2d', { willReadFrequently: true })
  if (!g) return []
  g.drawImage(img, 0, 0, 24, 24)
  const px = g.getImageData(0, 0, 24, 24).data
  const seen: { hue: number; sat: number }[] = []
  for (let i = 0; i < px.length; i += 4) {
    const [r, gr, b] = [px[i] / 255, px[i + 1] / 255, px[i + 2] / 255]
    const max = Math.max(r, gr, b)
    const d = max - Math.min(r, gr, b)
    if (d < 0.2) continue
    const h = max === r ? ((gr - b) / d + 6) % 6 : max === gr ? (b - r) / d + 2 : (r - gr) / d + 4
    seen.push({ hue: h * 60, sat: d })
  }
  const picked: number[] = []
  for (const { hue } of seen.sort((x, y) => y.sat - x.sat)) {
    const far = picked.every((p) => Math.min(Math.abs(p - hue), 360 - Math.abs(p - hue)) > 40)
    if (far) picked.push(hue)
    if (picked.length === 5) break
  }
  return picked.map((h) => `hsl(${Math.round(h)} 85% 65%)`)
}

/** Цветные пятна плывут, зерно и искры поверх: картинка будто рождается из шума. Шум стихает со временем, это не шкала прогресса. */
function useScene(
  blobsRef: React.RefObject<HTMLCanvasElement | null>,
  fxRef: React.RefObject<HTMLCanvasElement | null>,
  sample: string | undefined,
  calm: boolean,
) {
  const calmRef = useRef(calm)
  useEffect(() => {
    calmRef.current = calm
  }, [calm])
  useEffect(() => {
    const blobs = blobsRef.current
    const fx = fxRef.current
    const g = blobs?.getContext('2d')
    const f = fx?.getContext('2d')
    if (!blobs || !fx || !g || !f || reduced()) return
    const css = getComputedStyle(document.documentElement)
    const base = css.getPropertyValue('--color-primary-soft').trim()
    const star = css.getPropertyValue('--color-surface').trim()
    let inks = ['--color-primary', '--color-star', '--color-heart', '--color-primary-light'].map((v) => css.getPropertyValue(v).trim())
    if (sample) {
      const img = new Image()
      img.onload = () => {
        const p = pigmentsOf(img)
        if (p.length > 1) inks = p
      }
      img.src = sample
    }
    // Пятна считаем в малом холсте: растянутый браузером, он сам даёт мягкий градиент и почти ничего не стоит
    blobs.width = blobs.height = 160
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const box = fx.getBoundingClientRect()
    fx.width = box.width * dpr
    fx.height = box.height * dpr
    const noise = Array.from({ length: 3 }, () => {
      const c = document.createElement('canvas')
      c.width = c.height = 128
      const n = c.getContext('2d')
      if (n) {
        const d = n.createImageData(128, 128)
        for (let i = 0; i < d.data.length; i += 4) {
          const v = Math.random() * 255
          d.data[i] = d.data[i + 1] = d.data[i + 2] = v
          d.data[i + 3] = 255
        }
        n.putImageData(d, 0, 0)
      }
      return c
    })
    const sparks = Array.from({ length: window.innerWidth < 768 ? 28 : 48 }, () => ({
      x: Math.random(),
      y: Math.random(),
      s: 0.5 + Math.random(),
      p: Math.random() * 6.3,
    }))
    const start = performance.now()
    let raf = 0
    let last = start
    let clock = 0
    const frame = (now: number) => {
      clock += ((now - last) / 1000) * (calmRef.current ? 0.35 : 1)
      last = now
      const t = clock
      g.globalCompositeOperation = 'source-over'
      g.fillStyle = base
      g.fillRect(0, 0, 160, 160)
      inks.forEach((ink, i) => {
        const x = 80 + Math.sin(t * 0.5 + i * 2.1) * 55 + Math.cos(t * 0.23 + i) * 18
        const y = 80 + Math.cos(t * 0.4 + i * 1.3) * 55 + Math.sin(t * 0.31 + i * 3) * 18
        const r = 95 + Math.sin(t * 0.6 + i) * 20
        const grad = g.createRadialGradient(x, y, 0, x, y, r)
        grad.addColorStop(0, ink)
        grad.addColorStop(1, ink.startsWith('hsl') ? ink.replace(')', ' / 0)') : 'transparent')
        g.fillStyle = grad
        g.fillRect(0, 0, 160, 160)
      })
      f.clearRect(0, 0, fx.width, fx.height)
      // Шум стихает за ~18 с и дальше держится ровно
      f.globalAlpha = Math.max(0.05, 0.2 - ((now - start) / 18000) * 0.15)
      f.globalCompositeOperation = 'soft-light'
      f.fillStyle = f.createPattern(noise[Math.floor(now / 90) % 3], 'repeat') ?? 'transparent'
      f.fillRect(0, 0, fx.width, fx.height)
      f.globalCompositeOperation = 'source-over'
      f.fillStyle = star
      for (const sp of sparks) {
        const a = Math.sin(now / 500 + sp.p)
        if (a <= 0) continue
        f.globalAlpha = a
        const cx = ((sp.x + Math.sin(t * 0.2 + sp.p) * 0.03) * fx.width + fx.width) % fx.width
        const cy = ((sp.y - t * 0.012 * sp.s) % 1 + 1) % 1 * fx.height
        const r = 2.2 * sp.s * a * dpr
        f.beginPath()
        f.moveTo(cx, cy - r * 2.4)
        f.quadraticCurveTo(cx, cy, cx + r * 2.4, cy)
        f.quadraticCurveTo(cx, cy, cx, cy + r * 2.4)
        f.quadraticCurveTo(cx, cy, cx - r * 2.4, cy)
        f.quadraticCurveTo(cx, cy, cx, cy - r * 2.4)
        f.fill()
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [blobsRef, fxRef, sample])
}

/**
 * Экран рисования (work-progress). Стадии идут только от настоящих статусов работы:
 * checking → generating → generating с файлом (идёт проверка картинки). Процентов и таймера нет: их неоткуда взять.
 */
export default function GenStage({ work, sample, styleName, title: fixed }: { work: Work; sample?: string; styleName?: string; title?: string }) {
  const { t } = useTranslation()
  const blobs = useRef<HTMLCanvasElement>(null)
  const fx = useRef<HTMLCanvasElement>(null)
  const drawn = work.status === 'generating' && !!work.drawn
  const painting = work.status === 'generating'
  useScene(blobs, fx, sample, drawn)
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
      <div className="gen-stage relative mt-4 aspect-square w-[min(100%,calc(100dvh-260px))] min-w-[240px] overflow-hidden rounded-[28px] bg-primary-soft shadow-pop">
        <canvas ref={blobs} data-testid="gen-canvas" className="absolute inset-0 h-full w-full" />
        <canvas ref={fx} className="absolute inset-0 h-full w-full" />
        {!painting && <div className="gen-scan absolute inset-x-0 top-0 h-1/4" />}
        <div className="absolute inset-0 flex flex-wrap content-center items-center justify-center gap-2 p-6">
          {words.map((w, i) => (
            <span
              key={`${w}-${i}`}
              style={{ animationDelay: `${i * (painting ? 90 : 60)}ms` }}
              className={`rounded-full bg-surface px-3 py-1 text-base font-extrabold text-heading shadow-card ${painting ? 'gen-word-fall' : 'gen-word-in'}`}
            >
              {w}
            </span>
          ))}
        </div>
        {drawn && (
          <svg data-testid="gen-verify" viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden="true">
            <rect x="1" y="1" width="98" height="98" rx="7" pathLength="100" className="gen-ring" />
          </svg>
        )}
        <img src="/art/robot-brush.webp" alt="" className="gen-robot absolute bottom-2 right-2 h-20 w-auto lg:h-24" />
      </div>
      {work.rewrite_text && (
        <p data-testid="rewrite" className="mt-3 rounded-2xl bg-primary-soft px-4 py-2 text-base font-bold text-heading">
          {t('create.rewrite', { text: work.rewrite_text })}
        </p>
      )}
    </div>
  )
}
