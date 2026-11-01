import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { REACTIONS } from '../features/feed/feed'
import type { CommentResult, Post, PostComment, ReactionKey } from '../features/feed/feed'
import ErrorText, { errorKey } from './ErrorText'

type Props = { postId: number; onClose: () => void; onChanged: () => void }
type Suggest = { id: number; kinder: string }

/** Работа поверх ленты (docs/design/work.jpg) и «Скажи добрее?» (kinder.jpg). */
export default function PostModal({ postId, onClose, onChanged }: Props) {
  const { t } = useTranslation()
  const [post, setPost] = useState<Post | null>(null)
  const [tab, setTab] = useState<'about' | 'comments'>('about')
  const [comments, setComments] = useState<PostComment[]>([])
  const [text, setText] = useState('')
  const [suggest, setSuggest] = useState<Suggest | null>(null)
  const [note, setNote] = useState<'held' | 'support' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const loadPost = useCallback(async () => {
    setPost(await api<Post>(`/api/posts/${postId}`))
  }, [postId])
  const loadComments = useCallback(async () => {
    try {
      setComments(await api<PostComment[]>(`/api/posts/${postId}/comments`))
    } catch {
      setComments([])
    }
  }, [postId])

  useEffect(() => {
    let alive = true
    api<Post>(`/api/posts/${postId}`)
      .then((p) => alive && setPost(p))
      .catch(() => alive && onClose())
    api<PostComment[]>(`/api/posts/${postId}/comments`)
      .then((c) => alive && setComments(c))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [postId, onClose])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function react(k: ReactionKey) {
    if (!post || !post.can_react) return
    const had = post.mine.includes(k)
    const r = await api<{ reactions: Post['reactions']; mine: ReactionKey[] }>(
      `/api/posts/${post.id}/reactions/${k}`,
      had ? 'DELETE' : 'PUT',
    )
    setPost({ ...post, ...r })
    onChanged()
  }

  async function send(e?: FormEvent) {
    e?.preventDefault()
    if (!text.trim()) return
    setErr(null)
    setNote(null)
    try {
      const r = await api<CommentResult>(`/api/posts/${postId}/comments`, 'POST', { text })
      if (r.status === 'suggest') {
        setSuggest({ id: r.suggestion_id, kinder: r.kinder })
        return
      }
      setSuggest(null)
      setText('')
      if (r.status !== 'published') setNote(r.status)
      await loadComments()
      void loadPost()
      onChanged()
    } catch (x) {
      setErr(errorKey(x))
    }
  }

  async function acceptKind() {
    if (!suggest) return
    try {
      await api(`/api/comments/suggestions/${suggest.id}/accept`, 'POST')
      setSuggest(null)
      setText('')
      await loadComments()
      void loadPost()
      onChanged()
    } catch (x) {
      setErr(errorKey(x))
    }
  }

  async function cancelKind(clear: boolean) {
    if (!suggest) return
    await api(`/api/comments/suggestions/${suggest.id}/cancel`, 'POST').catch(() => {})
    setSuggest(null)
    if (clear) setText('')
  }

  async function remove() {
    if (!post || !window.confirm(t('feed.confirmDelete'))) return
    await api(`/api/posts/${post.id}`, 'DELETE')
    onChanged()
    onClose()
  }

  const tabCls = (on: boolean) =>
    `rounded-full px-4 py-2 text-sm font-extrabold ${on ? 'bg-primary text-primary-fg' : 'border border-border bg-surface text-heading'}`

  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-heading/40 p-3 md:items-center md:p-8"
      onClick={onClose}
      data-testid="post-modal-bg"
    >
      <div
        role="dialog"
        aria-modal="true"
        data-testid="post-modal"
        onClick={(e) => e.stopPropagation()}
        className="grid w-full max-w-[1160px] gap-4 rounded-3xl border border-border bg-surface p-3 shadow-card md:grid-cols-[1.4fr_1fr] md:p-5"
      >
        <div className="relative overflow-hidden rounded-2xl bg-primary-soft">
          {post && <img src={post.image_url} alt="" className="aspect-square w-full object-cover" data-testid="modal-image" />}
          <span className="absolute bottom-3 left-3 rounded-full bg-success-soft px-3 py-1 text-sm font-extrabold text-success">
            {t('create.checkedByAi')}
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-2xl font-extrabold text-heading">{post?.nick}</p>
              <p className="text-sm text-muted">{post ? t(`feed.audience.${post.audience}`) : ''}</p>
            </div>
            <button
              type="button"
              data-testid="modal-close"
              aria-label={t('feed.close')}
              onClick={onClose}
              className="h-10 w-10 rounded-full border border-border bg-surface text-xl font-extrabold text-heading"
            >
              ×
            </button>
          </div>
          {post?.status === 'held' && (
            <p data-testid="post-held" className="rounded-2xl bg-primary-soft px-3 py-2 text-sm font-bold text-heading">
              {t('feed.heldMark')}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={tabCls(tab === 'about')} onClick={() => setTab('about')} data-testid="tab-about">
              {t('feed.about')}
            </button>
            <button
              type="button"
              className={tabCls(tab === 'comments')}
              onClick={() => setTab('comments')}
              data-testid="tab-comments"
              disabled={post?.best}
            >
              {t('feed.comments')} {post?.comments ?? 0}
            </button>
          </div>
          {tab === 'about' && post && (
            <div data-testid="about">
              <p className="text-xs font-extrabold uppercase text-primary">{t('feed.idea')}</p>
              <p className="mt-1 text-2xl font-extrabold text-heading">
                {post.caption ?? (post.template_id ? t(`templates.${post.template_id}`) : '')}
              </p>
              {post.template_id && (
                <p className="mt-2 text-sm text-text">
                  {t('feed.style')}: <b className="text-heading">{t(`templates.${post.template_id}`)}</b>
                </p>
              )}
            </div>
          )}
          {tab === 'comments' && (
            <div data-testid="comments" className="flex max-h-[34vh] flex-col gap-2 overflow-y-auto">
              {comments.length === 0 && <p className="text-sm text-muted">{t('feed.noComments')}</p>}
              {comments.map((c) => (
                <div key={c.id} data-testid="comment" className="rounded-2xl border border-border bg-surface px-3 py-2">
                  <p className="text-sm font-extrabold text-heading">{c.nick}</p>
                  <p className="text-text">{c.text}</p>
                  {c.status === 'held' && (
                    <p data-testid="comment-held" className="mt-1 text-xs font-bold text-primary">
                      {t('feed.commentHeld')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2" data-testid="reactions">
            {REACTIONS.map((r) => {
              const on = post?.mine.includes(r.key)
              return (
                <button
                  key={r.key}
                  type="button"
                  data-testid={`react-${r.key}`}
                  aria-pressed={!!on}
                  disabled={!post?.can_react}
                  onClick={() => void react(r.key)}
                  className={`flex items-center gap-1 rounded-2xl border px-3 py-2 font-extrabold text-heading ${on ? 'border-primary bg-primary-soft' : 'border-border bg-surface'}`}
                >
                  <span aria-hidden="true">{r.emoji}</span>
                  <span data-testid={`count-${r.key}`}>{post?.reactions[r.key] ?? 0}</span>
                  <span className="sr-only">{t(`feed.reaction.${r.key}`)}</span>
                </button>
              )
            })}
          </div>
          {post?.template_id && (
            <Link
              to={`/create?template=${post.template_id}`}
              data-testid="draw-same"
              className="rounded-full bg-primary px-4 py-3 text-center font-extrabold uppercase text-primary-fg shadow-card"
            >
              {t('feed.drawSame')}
            </Link>
          )}
          {post?.can_delete && (
            <button
              type="button"
              data-testid="delete-post"
              onClick={() => void remove()}
              className="self-start text-sm font-bold text-danger underline"
            >
              {t(post.is_author ? 'feed.delete' : 'feed.hide')}
            </button>
          )}
          {post?.can_comment && tab === 'comments' && (
            <div className="relative mt-auto">
              {suggest && (
                <div data-testid="kinder" className="mb-2 rounded-2xl border border-border bg-surface p-3 shadow-card">
                  <p className="text-lg font-extrabold text-heading">{t('feed.kinderTitle')}</p>
                  <p data-testid="kinder-text" className="mt-1 rounded-xl bg-primary-soft px-3 py-2 text-text">
                    {suggest.kinder}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      data-testid="kinder-use"
                      onClick={() => void acceptKind()}
                      className="rounded-full bg-primary px-4 py-2 text-sm font-extrabold uppercase text-primary-fg"
                    >
                      {t('feed.kinderUse')}
                    </button>
                    <button
                      type="button"
                      data-testid="kinder-edit"
                      onClick={() => void cancelKind(false)}
                      className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-extrabold text-heading"
                    >
                      {t('feed.kinderEdit')}
                    </button>
                    <button
                      type="button"
                      data-testid="kinder-cancel"
                      onClick={() => void cancelKind(true)}
                      className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-extrabold text-heading"
                    >
                      {t('feed.kinderCancel')}
                    </button>
                  </div>
                </div>
              )}
              {note && (
                <p data-testid={`note-${note}`} className="mb-2 rounded-2xl bg-primary-soft px-3 py-2 text-sm font-bold text-heading">
                  {t(note === 'held' ? 'feed.commentSentToAdult' : 'create.supportText')}
                </p>
              )}
              <ErrorText code={err} />
              <form onSubmit={(e) => void send(e)} className="flex gap-2">
                <input
                  data-testid="comment-input"
                  value={text}
                  maxLength={300}
                  onChange={(e) => {
                    setText(e.target.value)
                    if (suggest) void cancelKind(false)
                  }}
                  placeholder={t('feed.commentPlaceholder')}
                  aria-label={t('feed.commentPlaceholder')}
                  className="min-w-0 flex-1 rounded-full border border-border bg-bg px-4 py-3 text-heading outline-none focus:border-primary"
                />
                <button
                  type="submit"
                  data-testid="comment-send"
                  disabled={!text.trim()}
                  className="rounded-full bg-primary px-5 py-3 font-extrabold uppercase text-primary-fg disabled:opacity-50"
                >
                  {t('feed.send')}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
