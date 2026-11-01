import { useRef, useState } from 'react'
import type { ClipboardEvent, FormEvent, KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../api'

const LEN = 6
const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

/** Код «покажи родителю» от ребёнка Mentorium: 6 клеток, вставка из буфера раскладывается по клеткам. */
export default function LinkCard({ onLinked }: { onLinked: () => void }) {
  const { t } = useTranslation()
  const [cells, setCells] = useState<string[]>(Array(LEN).fill(''))
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const refs = useRef<(HTMLInputElement | null)[]>([])

  const fill = (from: number, text: string) => {
    const chars = [...clean(text)].slice(0, LEN - from)
    if (!chars.length) return
    const next = [...cells]
    chars.forEach((c, i) => (next[from + i] = c))
    setCells(next)
    refs.current[Math.min(from + chars.length, LEN - 1)]?.focus()
  }
  const onKey = (i: number, e: KeyboardEvent) => {
    if (e.key !== 'Backspace' && e.key !== 'Delete') return
    e.preventDefault()
    // заполненная клетка стирается, потом шаг назад; пустая — стирает предыдущую
    const at = cells[i] || i === 0 ? i : i - 1
    const next = [...cells]
    next[at] = ''
    setCells(next)
    refs.current[Math.max(at - (cells[i] ? 1 : 0), 0)]?.focus()
  }
  const onPaste = (i: number, e: ClipboardEvent) => {
    e.preventDefault()
    fill(i, e.clipboardData.getData('text'))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    setDone(null)
    try {
      const r = await api<{ child: { nick: string } }>('/api/parent/link-child', 'POST', { code: cells.join('') })
      setCells(Array(LEN).fill(''))
      setDone(r.child.nick)
      onLinked()
    } catch (x) {
      setErr(x instanceof ApiError ? x.code : 'generic')
    } finally {
      setBusy(false)
    }
  }

  const errKey = err && `cab.link.err.${err}`
  return (
    <form onSubmit={(e) => void submit(e)} data-testid="link-card" className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 shadow-card">
      <h2 className="text-3xl font-extrabold text-heading">{t('cab.link.title')}</h2>
      <p className="text-muted">{t('cab.link.hint')}</p>
      <div className="grid grid-cols-6 gap-2" data-testid="link-code">
        {cells.map((c, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el
            }}
            data-testid={`link-cell-${i}`}
            aria-label={t('cab.link.cell', { n: i + 1 })}
            value={c}
            maxLength={LEN}
            autoComplete="off"
            inputMode="text"
            onChange={(e) => fill(i, e.target.value)}
            onKeyDown={(e) => onKey(i, e)}
            onPaste={(e) => onPaste(i, e)}
            onFocus={(e) => e.target.select()}
            className="aspect-[3/4] min-w-0 rounded-xl border border-border bg-surface text-center text-2xl font-extrabold uppercase text-heading outline-none focus:border-primary"
          />
        ))}
      </div>
      {err && (
        <p role="alert" data-testid="link-error" className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-bold text-danger">
          {t(errKey as string, { defaultValue: t('errors.generic') })}
        </p>
      )}
      {done && (
        <p role="status" data-testid="link-done" className="rounded-xl bg-primary-soft px-3 py-2 text-sm font-bold text-primary">
          {t('cab.link.done', { nick: done })}
        </p>
      )}
      <button
        type="submit"
        data-testid="link-submit"
        disabled={busy || cells.join('').length !== LEN}
        className="h-[52px] rounded-full lg:h-[67px] bg-primary px-6 text-2xl font-extrabold uppercase text-primary-fg disabled:opacity-50"
      >
        {t('cab.link.submit')}
      </button>
    </form>
  )
}
