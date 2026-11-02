import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import ErrorText, { errorKey } from './ErrorText'

/** Кнопка под готовым героем: идея необязательна, цена из данных. */
export default function StoryForm({ heroId, price, onCreated }: { heroId: number; price: number | undefined; onCreated: (id: number) => void }) {
  const { t } = useTranslation()
  const [idea, setIdea] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [rid] = useState(() => crypto.randomUUID())
  async function go() {
    if (busy) return
    setBusy(true)
    setErr(null)
    try {
      const r = await api<{ id: number }>('/api/stories', 'POST', { hero_work_id: heroId, idea: idea.trim() || null, request_id: `${rid}-${idea.trim().length}` })
      onCreated(r.id)
    } catch (x) {
      setErr(errorKey(x))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div data-testid="story-form" className="flex flex-col gap-2 rounded-2xl bg-primary-soft p-3">
      <p className="font-extrabold text-heading">{t('story.formTitle')}</p>
      <input
        data-testid="story-idea"
        value={idea}
        maxLength={200}
        onChange={(e) => setIdea(e.target.value)}
        placeholder={t('story.ideaPlaceholder')}
        aria-label={t('story.ideaPlaceholder')}
        className="h-11 w-full rounded-full border border-border bg-surface px-4 text-heading outline-none focus:border-primary"
      />
      {err && <ErrorText code={err} />}
      <button type="button" data-testid="story-go" disabled={busy} onClick={() => void go()} className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary font-extrabold text-primary-fg disabled:opacity-60">
        {t('story.go')}
        {!!price && <><img src="/art/coin.webp" alt="" className="h-6 w-6" />{price}</>}
      </button>
    </div>
  )
}
