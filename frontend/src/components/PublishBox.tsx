import { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOutletContext } from 'react-router-dom'
import { api } from '../api'
import type { ShellContext } from './AppShell'
import ErrorText, { errorKey } from './ErrorText'

type Result = { id: number; status: string; support: boolean }

/** «Показать классу»: в класс или семье + подпись; итог — опубликовано / отправили взрослому / тёплый ответ. */
export default function PublishBox({ workId, grid, onSupport }: { workId: number; grid?: boolean; onSupport?: () => void }) {
  const { t } = useTranslation()
  const { cls, hasParent } = useOutletContext<ShellContext>()
  const [open, setOpen] = useState(false)
  const [audience, setAudience] = useState<'class' | 'family' | null>(null)
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [res, setRes] = useState<Result | null>(null)

  const options = [
    ...(cls ? [{ key: 'class' as const, label: t('publish.toClass') }] : []),
    ...(hasParent ? [{ key: 'family' as const, label: t('publish.toFamily') }] : []),
  ]
  const chosen = audience ?? options[0]?.key ?? null

  async function submit() {
    if (!chosen || busy) return
    setBusy(true)
    setErr(null)
    try {
      const r = await api<Result>('/api/posts', 'POST', { work_id: workId, audience: chosen, caption: caption.trim() || null })
      setRes(r)
      if (r.support) onSupport?.() // родитель заменяет весь экран или карточку тёплым ответом
    } catch (x) {
      setErr(errorKey(x))
    } finally {
      setBusy(false)
    }
  }

  // Родитель — сетка карточки результата: кнопка встаёт в свою колонку, форма раскрывается над рядом кнопок.
  const slot = grid ? 'col-span-2 md:col-span-1' : ''
  if (res) {
    if (res.support && onSupport) return null
    const key = res.support ? 'support' : res.status === 'published' ? 'done' : 'held'
    return (
      <p data-testid={`publish-${key}`} className={`${slot} flex items-center rounded-2xl bg-primary-soft px-4 py-3 text-sm font-extrabold text-heading md:text-base`}>
        {t(`publish.${key}`)}
      </p>
    )
  }
  if (options.length === 0) {
    return (
      <p data-testid="publish-none" className={`${slot} text-sm text-muted`}>
        {t('publish.noAudience')}
      </p>
    )
  }
  const Wrap = grid ? Fragment : 'div'
  return (
    <Wrap {...(grid ? {} : { className: 'flex flex-col gap-2' })}>
      {open && (
        <div data-testid="publish-form" className={`flex flex-col gap-3 rounded-2xl border border-border bg-bg p-3 ${grid ? 'col-span-2 md:col-span-3' : ''}`}>
          <div className="flex flex-wrap gap-2">
            {options.map((o) => (
              <button
                key={o.key}
                type="button"
                data-testid={`audience-${o.key}`}
                aria-pressed={chosen === o.key}
                onClick={() => setAudience(o.key)}
                className={`rounded-full px-4 py-2 text-sm font-extrabold ${
                  chosen === o.key ? 'bg-primary text-primary-fg' : 'border border-border bg-surface text-heading'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <input
            data-testid="caption-input"
            value={caption}
            maxLength={200}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={t('publish.caption')}
            aria-label={t('publish.caption')}
            className="w-full rounded-full border border-border bg-surface px-4 py-3 text-heading outline-none focus:border-primary"
          />
          <ErrorText code={err} />
          <button
            type="button"
            data-testid="publish-send"
            disabled={busy}
            onClick={() => void submit()}
            className="rounded-full bg-primary px-4 py-3 font-extrabold uppercase text-primary-fg disabled:opacity-60"
          >
            {t('publish.send')}
          </button>
        </div>
      )}
      <button
        type="button"
        data-testid="publish-class"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`${slot} flex items-center justify-center gap-3 rounded-2xl bg-primary px-4 font-extrabold uppercase text-primary-fg shadow-card ${grid ? 'h-[52px] text-base lg:h-[85px] lg:text-[28px]' : 'h-11 w-full text-sm'}`}
      >
        <svg viewBox="0 0 24 24" className={grid ? 'h-6 w-6 lg:h-9 lg:w-9' : 'h-5 w-5'} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
          <path d="M8.6 10.7l6.8-4.4M8.6 13.3l6.8 4.4" />
        </svg>
        {t(cls ? 'publish.showClass' : 'publish.button')}
      </button>
    </Wrap>
  )
}
