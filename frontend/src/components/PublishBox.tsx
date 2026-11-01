import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOutletContext } from 'react-router-dom'
import { api } from '../api'
import type { ShellContext } from './AppShell'
import ErrorText, { errorKey } from './ErrorText'

type Result = { id: number; status: string; support: boolean }

/** «Опубликовать»: в класс или семье + подпись; итог — опубликовано / отправили взрослому / тёплый ответ. */
export default function PublishBox({ workId }: { workId: number }) {
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
      setRes(await api<Result>('/api/posts', 'POST', { work_id: workId, audience: chosen, caption: caption.trim() || null }))
    } catch (x) {
      setErr(errorKey(x))
    } finally {
      setBusy(false)
    }
  }

  if (res) {
    const key = res.support ? 'support' : res.status === 'published' ? 'done' : 'held'
    return (
      <p data-testid={`publish-${key}`} className="rounded-2xl bg-primary-soft px-4 py-3 font-extrabold text-heading">
        {t(`publish.${key}`)}
      </p>
    )
  }
  if (options.length === 0) {
    return (
      <p data-testid="publish-none" className="text-sm text-muted">
        {t('publish.noAudience')}
      </p>
    )
  }
  if (!open) {
    return (
      <button
        type="button"
        data-testid="publish-open"
        onClick={() => setOpen(true)}
        className="w-full rounded-full bg-primary px-4 py-3 font-extrabold uppercase text-primary-fg shadow-card"
      >
        {t('publish.button')}
      </button>
    )
  }
  return (
    <div data-testid="publish-form" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3">
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
        className="w-full rounded-full border border-border bg-bg px-4 py-3 text-heading outline-none focus:border-primary"
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
  )
}
