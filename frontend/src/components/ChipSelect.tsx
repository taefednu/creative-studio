import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type ChipOption = { value: string; label: string; thumb?: string; icon?: ReactNode }

type Props = {
  value: string
  onChange: (v: string) => void
  options: ChipOption[]
  testid: string
  label: string
  className?: string
}

const GAP = 8
const EDGE = 8

type Pos = { left: number; top: number; width: number; maxHeight: number; up: boolean }

function Lead({ o, size }: { o: ChipOption; size: string }) {
  if (o.thumb) return <img src={o.thumb} alt="" className={`${size} shrink-0 rounded-xl object-cover`} />
  if (o.icon) return <span className={`${size} flex shrink-0 items-center justify-center text-primary`}>{o.icon}</span>
  return null
}

/**
 * Свой выпадающий список (макет menus.jpg): кнопка-пилюля и попап в портале, чтобы его не резал overflow родителя.
 * Высоту кнопки задаёт вызывающий через className. Попап открывается вверх, если внизу тесно.
 */
export default function ChipSelect({ value, onChange, options, testid, label, className = 'h-11' }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<Pos | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const listId = useId()
  const sel = options.find((o) => o.value === value)

  const close = useCallback((refocus: boolean) => {
    setOpen(false)
    setPos(null)
    if (refocus) btn.current?.focus()
  }, [])

  const place = useCallback(() => {
    const b = btn.current
    const p = pop.current
    if (!b || !p) return
    const r = b.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const natural = p.scrollHeight
    const below = vh - r.bottom - GAP - EDGE
    const above = r.top - GAP - EDGE
    const up = below < natural && above > below
    const space = Math.max(up ? above : below, 96)
    const width = Math.min(Math.max(r.width, 200), vw - EDGE * 2)
    const left = Math.min(Math.max(r.left, EDGE), vw - width - EDGE)
    const h = Math.min(natural, space)
    setPos({ left, width, maxHeight: space, up, top: up ? r.top - GAP - h : r.bottom + GAP })
  }, [])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, place, options.length])

  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => {
      const n = e.target as Node
      if (!btn.current?.contains(n) && !pop.current?.contains(n)) close(false)
    }
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    document.addEventListener('pointerdown', down)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      document.removeEventListener('pointerdown', down)
    }
  }, [open, place, close])

  useEffect(() => {
    if (open) pop.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, pos])

  function openList() {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)))
    setOpen(true)
  }

  function choose(i: number) {
    const o = options[i]
    if (o) onChange(o.value)
    close(true)
  }

  function onKey(e: KeyboardEvent) {
    const n = options.length
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openList()
      }
      return
    }
    if (e.key === 'ArrowDown') setActive((i) => (i + 1) % n)
    else if (e.key === 'ArrowUp') setActive((i) => (i - 1 + n) % n)
    else if (e.key === 'Home') setActive(0)
    else if (e.key === 'End') setActive(n - 1)
    else if (e.key === 'Enter' || e.key === ' ') choose(active)
    else if (e.key === 'Escape') {
      e.stopPropagation() // Esc закрывает только список, а не окно под ним
      close(true)
    }
    else if (e.key === 'Tab') return close(false)
    else return
    e.preventDefault()
  }

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        ref={btn}
        type="button"
        data-testid={testid}
        data-value={value}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onKey}
        className={`flex h-full w-full min-w-0 cursor-pointer items-center gap-2 rounded-full border bg-surface pr-9 text-left text-sm font-extrabold text-heading outline-none md:text-base ${
          sel?.thumb || sel?.icon ? 'pl-2' : 'pl-4'
        } ${open ? 'border-primary' : 'border-border'}`}
      >
        {sel && <Lead o={sel} size="h-7 w-7 md:h-8 md:w-8" />}
        <span className="min-w-0 truncate">{sel?.label}</span>
      </button>
      <svg
        viewBox="0 0 24 24"
        className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-heading transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
      {open &&
        createPortal(
          <div
            ref={pop}
            id={listId}
            role="listbox"
            aria-label={label}
            data-testid={`${testid}-list`}
            data-up={pos?.up ? 'true' : 'false'}
            className="chip-pop fixed z-[60] overflow-y-auto overscroll-contain rounded-[20px] border border-border bg-surface p-1.5 shadow-pop"
            style={
              pos
                ? { left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight, transformOrigin: pos.up ? 'bottom' : 'top' }
                : { left: 0, top: 0, visibility: 'hidden' }
            }
          >
            {options.map((o, i) => {
              const on = o.value === value
              return (
                <div
                  key={o.value}
                  id={`${listId}-${i}`}
                  data-idx={i}
                  role="option"
                  aria-selected={on}
                  data-testid={`${testid}-opt-${o.value}`}
                  onClick={() => choose(i)}
                  onMouseMove={() => active !== i && setActive(i)}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl px-2 text-base font-extrabold text-heading ${
                    o.thumb ? 'min-h-[56px] py-1.5' : 'min-h-[44px] py-1.5'
                  } ${on ? 'bg-primary-soft' : i === active ? 'bg-bg' : ''}`}
                >
                  <Lead o={o} size="h-11 w-11" />
                  <span className="min-w-0 flex-1 truncate px-1">{o.label}</span>
                  {on && (
                    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-primary" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </div>
              )
            })}
          </div>,
          document.body,
        )}
    </span>
  )
}
