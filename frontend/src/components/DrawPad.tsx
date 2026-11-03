import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import Icon from './Icon'

const SIZE = 768
const COLORS = ['--color-heading', '--color-primary', '--color-heart', '--color-star', '--color-success', '--color-urgent']
const WIDTHS = [10, 26]
const UNDO_MAX = 12 // один шаг ~2 МБ памяти

export type DrawPadHandle = { toFile: () => Promise<File | null> }

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/** Рисование прямо на сайте: тот же файл PNG, что и фото, уходит на ту же загрузку и ту же проверку. */
const DrawPad = forwardRef<DrawPadHandle, { onDirty: (dirty: boolean) => void }>(function DrawPad({ onDirty }, ref) {
  const { t } = useTranslation()
  const canvas = useRef<HTMLCanvasElement>(null)
  const last = useRef<{ x: number; y: number } | null>(null)
  const history = useRef<ImageData[]>([])
  const [color, setColor] = useState(COLORS[0])
  const [width, setWidth] = useState(WIDTHS[0])
  const [steps, setSteps] = useState(0)

  const ctx = () => canvas.current?.getContext('2d', { willReadFrequently: true }) ?? null

  function wipe() {
    const g = ctx()
    if (!g) return
    g.fillStyle = css('--color-surface')
    g.fillRect(0, 0, SIZE, SIZE)
  }

  useEffect(wipe, [])

  useImperativeHandle(ref, () => ({
    toFile: () =>
      new Promise((done) => {
        canvas.current?.toBlob((b) => done(b ? new File([b], 'drawing.png', { type: 'image/png' }) : null), 'image/png')
      }),
  }))

  function changed(n: number) {
    setSteps(n)
    onDirty(n > 0)
  }

  function point(e: PointerEvent<HTMLCanvasElement>) {
    const b = e.currentTarget.getBoundingClientRect()
    return { x: ((e.clientX - b.left) / b.width) * SIZE, y: ((e.clientY - b.top) / b.height) * SIZE }
  }

  function line(from: { x: number; y: number }, to: { x: number; y: number }) {
    const g = ctx()
    if (!g) return
    g.strokeStyle = css(color)
    g.lineWidth = width
    g.lineCap = g.lineJoin = 'round'
    g.beginPath()
    g.moveTo(from.x, from.y)
    g.lineTo(to.x, to.y)
    g.stroke()
  }

  function down(e: PointerEvent<HTMLCanvasElement>) {
    if (last.current) return // второй палец во время штриха не рисует
    const g = ctx()
    if (!g) return
    e.currentTarget.setPointerCapture(e.pointerId)
    history.current = [...history.current.slice(-(UNDO_MAX - 1)), g.getImageData(0, 0, SIZE, SIZE)]
    const p = point(e)
    last.current = p
    line(p, p) // точка от одного касания
    changed(history.current.length)
  }

  function move(e: PointerEvent<HTMLCanvasElement>) {
    if (!last.current) return
    const p = point(e)
    line(last.current, p)
    last.current = p
  }

  function undo() {
    const prev = history.current.pop()
    if (prev) ctx()?.putImageData(prev, 0, 0)
    changed(history.current.length)
  }

  function clear() {
    wipe()
    history.current = []
    changed(0)
  }

  return (
    <div className="flex h-full w-full flex-col">
      <canvas
        ref={canvas}
        data-testid="draw-canvas"
        width={SIZE}
        height={SIZE}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={() => (last.current = null)}
        onPointerCancel={() => (last.current = null)}
        className="min-h-0 w-full flex-1 cursor-crosshair touch-none rounded-2xl bg-surface"
      />
      <div className="mt-2 flex shrink-0 items-center gap-1.5 px-1 sm:gap-2">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            data-testid={`draw-color-${c.slice(8)}`}
            aria-label={t('panel.drawColor')}
            aria-pressed={color === c}
            onClick={() => setColor(c)}
            style={{ background: `var(${c})` }}
            className={`h-8 w-8 shrink-0 rounded-full ring-offset-2 ring-offset-primary-soft ${color === c ? 'ring-[3px] ring-primary' : ''}`}
          />
        ))}
        <span className="flex-1" />
        {WIDTHS.map((w) => (
          <button
            key={w}
            type="button"
            aria-label={t('panel.drawWidth')}
            aria-pressed={width === w}
            onClick={() => setWidth(w)}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${width === w ? 'bg-surface' : ''}`}
          >
            <span className="block rounded-full bg-heading" style={{ width: w / 2 + 2, height: w / 2 + 2 }} />
          </button>
        ))}
        <button type="button" data-testid="draw-undo" disabled={!steps} aria-label={t('panel.drawUndo')} title={t('panel.drawUndo')} onClick={undo} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-heading disabled:opacity-40">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 7L4 12l5 5M4 12h11a5 5 0 010 10h-2" />
          </svg>
        </button>
        <button type="button" data-testid="draw-clear" disabled={!steps} aria-label={t('panel.drawClear')} title={t('panel.drawClear')} onClick={clear} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-heading disabled:opacity-40">
          <Icon name="close" />
        </button>
      </div>
    </div>
  )
})

export default DrawPad
