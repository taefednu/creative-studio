import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import Icon from './Icon'
import type { ShareState } from './PublishBox'

/** Что с просьбой поделиться: ждём взрослого, ссылка готова или взрослый отказал. Пока просьбы не было, ничего не показываем. */
export default function ShareLink({ workId, state, onChange }: { workId: number; state: ShareState; onChange: (s: ShareState) => void }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  if (state.status === 'waiting' || state.status === 'refused') {
    return <p data-testid={`share-${state.status}`} className="rounded-2xl bg-primary-soft px-4 py-2.5 text-sm font-bold text-heading">{t(`publish.share.${state.status}`)}</p>
  }
  if (state.status !== 'live' || !state.path) return null
  const url = `${window.location.origin}${state.path}`
  return (
    <div data-testid="share-live" className="flex flex-col gap-1.5 rounded-2xl bg-primary-soft p-2.5">
      <div className="flex items-center gap-2">
        <input data-testid="share-url" readOnly value={url} aria-label={t('publish.share.live')} onFocus={(e) => e.currentTarget.select()} className="h-10 min-w-0 flex-1 rounded-full border border-border bg-surface px-3 text-sm font-bold text-heading outline-none" />
        <button
          type="button"
          data-testid="share-copy"
          onClick={() => {
            void navigator.clipboard?.writeText(url)
            setCopied(true)
          }}
          className="flex h-10 shrink-0 items-center gap-1 rounded-full bg-primary px-4 text-sm font-extrabold text-primary-fg"
        >
          {copied && <Icon name="check" className="h-4 w-4" />}
          {t(copied ? 'publish.share.copied' : 'publish.share.copy')}
        </button>
      </div>
      <button
        type="button"
        data-testid="share-stop"
        onClick={() => void api<ShareState>(`/api/works/${workId}/share`, 'DELETE').then(onChange)}
        className="self-start px-2 text-xs font-extrabold text-muted hover:text-heading"
      >
        {t('publish.share.stop')}
      </button>
    </div>
  )
}
