import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useOutletContext } from 'react-router-dom'
import { api } from '../api'
import { allRow, postRow } from '../features/works/publish'
import type { RowState, ShareState, ShownPost } from '../features/works/publish'
import type { ShellContext } from './AppShell'
import ErrorText, { errorKey } from './ErrorText'
import Icon from './Icon'
import ShareLink from './ShareLink'

type Result = { status: string; support: boolean }
type Audience = 'class' | 'family'

/** «Кому показать?»: одна строка на адресата, один клик, строка сама говорит, что сейчас с работой. */
export default function PublishBox({ workId, main, second, publicOk, noTitle, onSupport }: { workId: number; main?: boolean; second?: boolean; publicOk?: boolean; noTitle?: boolean; onSupport?: () => void }) {
  const { t } = useTranslation()
  const { cls, hasParent } = useOutletContext<ShellContext>()
  const [share, setShare] = useState<ShareState>({ status: 'none', path: null })
  const [posts, setPosts] = useState<ShownPost[]>([])
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [support, setSupport] = useState(false)

  useEffect(() => {
    let alive = true
    api<ShareState>(`/api/works/${workId}/share`)
      .then((x) => {
        if (!alive) return
        setShare(x)
        setPosts(x.posts ?? [])
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [workId])

  async function run(key: string, action: () => Promise<void>) {
    if (busy) return
    setBusy(key)
    setErr(null)
    try {
      await action()
    } catch (x) {
      setErr(errorKey(x))
    } finally {
      setBusy(null)
    }
  }

  const post = (audience: Audience) =>
    run(audience, async () => {
      const r = await api<Result>('/api/posts', 'POST', { work_id: workId, audience, caption: caption.trim() || null })
      if (r.support) {
        setSupport(true)
        onSupport?.() // родитель заменяет экран или карточку тёплым ответом
        return
      }
      setPosts((x) => [...x, { audience, status: r.status === 'published' ? 'published' : 'waiting' }])
      setCaption('')
    })
  const askAll = () => run('public', async () => setShare(await api<ShareState>(`/api/works/${workId}/share`, 'POST')))

  if (support && !onSupport) return <p data-testid="publish-support" className="rounded-2xl bg-primary-soft px-4 py-3 font-extrabold text-heading">{t('publish.support')}</p>
  if (!cls && !hasParent) return <p data-testid="publish-none" className="text-sm text-muted">{t('publish.noAudience')}</p>

  const rows: { key: string; label: string; done: string; state: RowState; sub?: string; act: () => void }[] = [
    ...(cls ? [{ key: 'class', label: t('publish.toClass'), done: t('publish.doneClass'), state: postRow(posts, 'class'), act: () => void post('class') }] : []),
    ...(hasParent ? [{ key: 'family', label: t('publish.toFamily'), done: t('publish.doneFamily'), state: postRow(posts, 'family'), act: () => void post('family') }] : []),
    ...(publicOk ? [{ key: 'public', label: t('publish.toAll'), done: t('publish.doneAll'), state: allRow(share.status), sub: t('publish.allNote'), act: () => void askAll() }] : []),
  ]
  const first = rows.find((r) => r.state === 'free')?.key
  const canCaption = rows.some((r) => r.key !== 'public' && r.state === 'free')

  return (
    <div data-testid="publish-box" className="flex flex-col gap-2">
      {!noTitle && <h2 className="text-lg font-black tracking-tight text-heading">{t('publish.who')}</h2>}
      {canCaption && (
        <input
          data-testid="caption-input"
          value={caption}
          maxLength={200}
          onChange={(e) => setCaption(e.target.value)}
          placeholder={t('publish.caption')}
          aria-label={t('publish.caption')}
          className="h-11 w-full rounded-2xl border border-border bg-bg px-4 text-heading outline-none focus:border-primary"
        />
      )}
      {rows.map((r) =>
        r.state === 'free' ? (
          <button
            key={r.key}
            type="button"
            data-testid={`publish-${r.key}`}
            disabled={busy !== null}
            onClick={r.act}
            className={`flex min-h-14 items-center justify-between gap-3 rounded-2xl px-4 py-1.5 text-left font-extrabold disabled:opacity-60 ${main && !second && r.key === first ? 'bg-primary text-primary-fg' : 'border border-border bg-surface text-heading'}`}
          >
            <span className="min-w-0">
              <span className="block text-base leading-5">{r.label}</span>
              {r.sub && <span className={`block text-xs font-bold leading-4 ${main && !second && r.key === first ? 'text-primary-fg' : 'text-muted'}`}>{r.sub}</span>}
            </span>
            {busy === r.key ? <span className="text-sm">…</span> : <Icon name="plus" className="h-5 w-5 shrink-0" />}
          </button>
        ) : (
          <p
            key={r.key}
            data-testid={`publish-${r.key}`}
            data-state={r.state}
            className={`flex min-h-14 items-center gap-2 rounded-2xl px-4 py-1.5 text-base font-extrabold leading-5 ${r.state === 'done' ? 'bg-success-soft text-success' : r.state === 'waiting' ? 'bg-primary-soft text-primary' : 'bg-primary-soft text-muted'}`}
          >
            <Icon name={r.state === 'done' ? 'check' : r.state === 'waiting' ? 'clock' : 'close'} className="h-5 w-5 shrink-0" />
            {r.state === 'done' ? r.done : r.state === 'waiting' ? t(r.key === 'public' ? 'publish.waitingAll' : 'publish.waiting') : t('publish.refusedAll')}
          </p>
        ),
      )}
      <ShareLink workId={workId} state={share} onChange={setShare} />
      <ErrorText code={err} />
    </div>
  )
}
