import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import ErrorText, { errorKey } from './ErrorText'

/** Кнопка под готовым героем: поле для идеи появляется по нажатию, идея необязательна, цена из данных. */
export default function StoryForm({ heroId, price, onCreated }: { heroId: number; price: number | undefined; onCreated: (id: number) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
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
  const label = (
    <>
      {t('story.go')}
      {!!price && <><img src="/art/coin.webp" alt="" className="h-7 w-7" />{price}</>}
    </>
  )
  if (!open) {
    return (
      <button type="button" data-testid="story-open" onClick={() => setOpen(true)} className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-border bg-surface text-lg font-extrabold text-heading">
        {label}
      </button>
    )
  }
  return (
    <div data-testid="story-form" className="chip-pop flex flex-col gap-2">
      <input
        data-testid="story-idea"
        value={idea}
        maxLength={200}
        autoFocus={window.matchMedia('(pointer: fine)').matches}
        onChange={(e) => setIdea(e.target.value)}
        placeholder={t('story.ideaPlaceholder')}
        aria-label={t('story.ideaPlaceholder')}
        className="h-14 w-full rounded-full border border-border bg-surface px-5 text-lg text-heading outline-none focus:border-primary"
      />
      {err && <ErrorText code={err} />}
      <button type="button" data-testid="story-go" disabled={busy} onClick={() => void go()} className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-border bg-surface text-lg font-extrabold text-heading disabled:opacity-60">
        {label}
      </button>
    </div>
  )
}
