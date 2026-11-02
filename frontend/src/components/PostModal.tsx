import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, api } from '../api'
import { REACTIONS, createdLabel, drawSameKind } from '../features/feed/feed'
import type { CommentResult, Post, PostComment, ReactionKey } from '../features/feed/feed'
import { loadTemplates } from '../features/works/works'
import { useLoad } from '../useLoad'
import Avatar from './Avatar'
import ChipSelect from './ChipSelect'
import ErrorText, { errorKey } from './ErrorText'

type Props = { postId: number; isChild: boolean; guest?: boolean; onClose: () => void; onChanged: () => void }
type Suggest = { id: number; kinder: string }

/** Работа поверх ленты (docs/design/work.jpg) и «Скажи добрее?» (kinder.jpg). Ссылка «Ремикс работы» открывает исходный пост. */
export default function PostModal({ postId, isChild, guest, onClose, onChanged }: Props) {
  const [pid, setPid] = useState(postId)
  // key: состояние окна не переезжает с поста на пост
  return <PostBody key={pid} postId={pid} isChild={isChild} guest={guest} onOpen={setPid} onClose={onClose} onChanged={onChanged} />
}

const drawBtn =
  'flex h-[56px] items-center justify-center gap-3 rounded-2xl bg-primary px-4 text-center text-base font-extrabold uppercase text-primary-fg shadow-card lg:h-[67px] lg:text-2xl'

/** Ремикс: идея и/или стиль, цена из /api/templates; после ответа — на экран работы. */
function RemixBox({ postId }: { postId: number }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [tplData] = useLoad(loadTemplates)
  const [text, setText] = useState('')
  const [style, setStyle] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const requestId = useRef<string | null>(null)

  // тот же запрос с теми же полями — тот же request_id (двойной клик, сеть); правка полей — новый запрос
  useEffect(() => {
    requestId.current = null
  }, [text, style])

  async function go() {
    if (sending || (!style && !text.trim())) return
    setSending(true)
    setErr(null)
    requestId.current ??= crypto.randomUUID()
    try {
      const r = await api<{ id: number }>(`/api/posts/${postId}/remix`, 'POST', {
        template_id: style || null,
        text: text.trim() || null,
        request_id: requestId.current,
      })
      navigate(`/create?work=${r.id}`)
    } catch (x) {
      setErr(errorKey(x))
      // 4xx — сервер запрос отверг; сеть и 5xx — работа могла создаться, id оставляем
      if (x instanceof ApiError && x.status >= 400 && x.status < 500) requestId.current = null
    } finally {
      setSending(false)
    }
  }

  return (
    <div data-testid="remix-box" className="flex flex-col gap-3 rounded-2xl border border-border bg-bg p-3">
      <input
        data-testid="remix-text"
        value={text}
        maxLength={200}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('feed.remixText')}
        aria-label={t('feed.remixText')}
        className="w-full rounded-full border border-border bg-surface px-4 py-3 text-heading outline-none focus:border-primary"
      />
      <ChipSelect
        testid="remix-style"
        label={t('panel.style')}
        value={style}
        onChange={setStyle}
        options={[
          { value: '', label: t('feed.remixNoStyle') },
          ...(tplData?.templates ?? []).map((x) => ({ value: x.id, label: t(`templates.${x.id}`), thumb: x.image_url })),
        ]}
        className="h-11"
      />
      <ErrorText code={err} />
      <button
        type="button"
        data-testid="remix-go"
        disabled={sending || (!style && !text.trim())}
        onClick={() => void go()}
        className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-4 font-extrabold uppercase text-primary-fg disabled:opacity-60"
      >
        {t('feed.remixGo')}
        <img src="/art/coin.webp" alt="" className="h-6 w-6" />
        <span data-testid="remix-price">{tplData?.price ?? ''}</span>
      </button>
    </div>
  )
}

function PostBody({ postId, isChild, guest, onOpen, onClose, onChanged }: Props & { onOpen: (id: number) => void }) {
  const { t, i18n } = useTranslation()
  const [post, setPost] = useState<Post | null>(null)
  const [tab, setTab] = useState<'about' | 'comments'>('about')
  const [comments, setComments] = useState<PostComment[]>([])
  const [text, setText] = useState('')
  const [suggest, setSuggest] = useState<Suggest | null>(null)
  const [note, setNote] = useState<'held' | 'support' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [remixOpen, setRemixOpen] = useState(false)
  const [allowErr, setAllowErr] = useState<string | null>(null)
  const [actErr, setActErr] = useState<string | null>(null)
  const [hint, setHint] = useState(false) // гость нажал на реакцию
  const [busy, setBusy] = useState(false) // отправка комментария и «Использовать»: двойной клик не шлёт второй запрос

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
    // гостю комментарии закрыты (401): не спрашиваем
    if (!guest) {
      api<PostComment[]>(`/api/posts/${postId}/comments`)
        .then((c) => alive && setComments(c))
        .catch(() => {})
    }
    return () => {
      alive = false
    }
  }, [postId, onClose, guest])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function react(k: ReactionKey) {
    if (guest) return setHint(true)
    if (!post || !post.can_react) return
    const had = post.mine.includes(k)
    setActErr(null)
    try {
      const r = await api<{ reactions: Post['reactions']; mine: ReactionKey[] }>(
        `/api/posts/${post.id}/reactions/${k}`,
        had ? 'DELETE' : 'PUT',
      )
      setPost({ ...post, ...r })
      onChanged()
    } catch (x) {
      setActErr(errorKey(x))
    }
  }

  async function send(e?: FormEvent) {
    e?.preventDefault()
    if (!text.trim() || busy) return
    setBusy(true)
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
    } finally {
      setBusy(false)
    }
  }

  async function acceptKind() {
    if (!suggest || busy) return
    setBusy(true)
    try {
      await api(`/api/comments/suggestions/${suggest.id}/accept`, 'POST')
      setSuggest(null)
      setText('')
      await loadComments()
      void loadPost()
      onChanged()
    } catch (x) {
      setErr(errorKey(x))
    } finally {
      setBusy(false)
    }
  }

  async function cancelKind(clear: boolean) {
    if (!suggest) return
    await api(`/api/comments/suggestions/${suggest.id}/cancel`, 'POST').catch(() => {})
    setSuggest(null)
    if (clear) setText('')
  }

  // автор включает и выключает ремиксы: переключатель меняется сразу, при ошибке возвращается
  async function setAllowed(allowed: boolean) {
    if (!post) return
    setAllowErr(null)
    setPost({ ...post, remix_allowed: allowed })
    try {
      await api(`/api/posts/${post.id}/remix-allowed`, 'POST', { allowed })
      onChanged()
    } catch (x) {
      setPost((p) => (p ? { ...p, remix_allowed: !allowed } : p))
      setAllowErr(errorKey(x))
    }
  }

  async function remove() {
    if (!post || !window.confirm(t('feed.confirmDelete'))) return
    setActErr(null)
    try {
      await api(`/api/posts/${post.id}`, 'DELETE')
    } catch (x) {
      setActErr(errorKey(x))
      return
    }
    onChanged()
    onClose()
  }

  const tabCls = (on: boolean) =>
    `h-11 rounded-full text-base font-extrabold lg:h-[47px] lg:text-xl ${on ? 'bg-primary text-primary-fg' : 'border border-border bg-surface text-heading'}`
  const raw = post ? drawSameKind(post, isChild) : null
  const kind = guest && raw !== 'link' ? null : raw
  const styleName = post?.template_id && i18n.exists(`templates.${post.template_id}`) ? t(`templates.${post.template_id}`) : null
  const made = post ? createdLabel(post.created_at) : ''
  const row = (k: string, v: ReactNode) => (
    <p className="flex gap-3 text-base text-muted lg:text-xl">
      <span className="w-[72px] shrink-0 lg:w-[104px]">{k}</span>
      <span aria-hidden="true">—</span>
      <span className="min-w-0 font-bold text-heading">{v}</span>
    </p>
  )

  return (
    <div
      className="fixed inset-0 z-30 flex items-start justify-center bg-scrim p-2 pt-[68px] backdrop-blur-sm lg:p-8 lg:pt-[14.5dvh]"
      onClick={onClose}
      data-testid="post-modal-bg"
    >
      <div
        role="dialog"
        aria-modal="true"
        data-testid="post-modal"
        onClick={(e) => e.stopPropagation()}
        className="relative grid max-h-[calc(100dvh-76px)] w-full max-w-[1167px] content-start gap-2 overflow-y-auto rounded-3xl border border-border bg-bg p-2 shadow-card lg:h-[737px] lg:max-h-[calc(85.5dvh-16px)] lg:grid-cols-[663fr_447fr] lg:grid-rows-[minmax(0,1fr)] lg:gap-[13px] lg:overflow-hidden lg:py-[27px] lg:pl-[27px] lg:pr-[17px]"
      >
        <button
          type="button"
          data-testid="modal-close"
          aria-label={t('feed.close')}
          onClick={onClose}
          className="sticky top-2 z-10 -mb-[48px] mr-2 mt-2 h-10 w-10 justify-self-end rounded-full border border-border bg-surface text-xl font-extrabold text-heading lg:absolute lg:right-[38px] lg:top-[30px] lg:m-0"
        >
          ×
        </button>
        <div className="relative overflow-hidden rounded-2xl bg-primary-soft lg:min-h-0">
          {post && <img src={post.image_url} alt="" className="aspect-square w-full object-cover lg:aspect-auto lg:h-full" data-testid="modal-image" />}
          <span className="absolute bottom-3 left-3 rounded-full bg-success-soft px-3 py-1 text-sm font-extrabold text-success lg:bottom-4 lg:left-4 lg:text-xl">
            {t('create.checkedByAi')}
          </span>
        </div>
        <div
          data-testid="modal-side"
          className="flex min-h-0 min-w-0 flex-col gap-3 rounded-2xl border border-border bg-surface p-3 lg:gap-4 lg:overflow-y-auto lg:p-[18px]"
        >
          <div className="flex items-center gap-3 pr-10">
            {post && (
              <span data-testid="modal-author" className="flex shrink-0">
                <Avatar nick={post.nick} className="h-14 w-14 lg:h-[85px] lg:w-[85px]" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-2xl font-extrabold text-heading lg:text-[30px]">{post?.nick}</p>
              <p className="text-sm text-muted lg:text-xl">{post ? t(`feed.audience.${post.audience}`) : ''}</p>
            </div>
          </div>
          {post?.status === 'held' && !post.support && (
            <p data-testid="post-held" className="rounded-2xl bg-primary-soft px-3 py-2 text-sm font-bold text-heading">
              {t('feed.heldMark')}
            </p>
          )}
          {!guest && (
          <div className="grid grid-cols-2 gap-[14px] lg:gap-[13px]">
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
          )}
          {tab === 'about' && post && (
            <>
              <div data-testid="about" className="flex flex-col gap-2">
                <p className="text-sm font-extrabold uppercase text-primary lg:text-lg">{t('feed.idea')}</p>
                <p className="text-2xl font-extrabold leading-tight text-heading lg:text-[32px]">
                  {post.caption ?? styleName ?? ''}
                </p>
                <div className="mt-2 flex flex-col gap-2 border-t border-border pt-3 lg:gap-3 lg:pt-4">
                  {styleName && row(t('feed.style'), styleName)}
                  {row(t('feed.model'), t('panel.model'))}
                  {row(t('feed.made'), made === 'today' || made === 'yesterday' ? t(`feed.${made}`) : made)}
                  {post.remix_of && (
                    <p className="text-base text-muted lg:text-xl">
                      <button
                        type="button"
                        data-testid="remix-of"
                        onClick={() => post.remix_of && onOpen(post.remix_of.post_id)}
                        className="text-left font-bold text-primary underline"
                      >
                        {t('feed.remixOf', { nick: post.remix_of.nick })}
                      </button>
                    </p>
                  )}
                </div>
              </div>
              <div className="border-t border-border" />
              <ErrorText code={actErr} />
              {hint && (
                <p data-testid="guest-hint" role="status" className="rounded-2xl bg-primary-soft px-3 py-2 text-sm font-bold text-heading">
                  {t('showcase.reactHint')}{' '}
                  <Link to="/login" className="text-primary underline">{t('showcase.login')}</Link>
                </p>
              )}
              <div className="grid grid-cols-4 gap-2 lg:gap-3" data-testid="reactions">
                {REACTIONS.map((r) => {
                  const on = post.mine.includes(r.key)
                  return (
                    <button
                      key={r.key}
                      type="button"
                      data-testid={`react-${r.key}`}
                      aria-pressed={on}
                      disabled={!post.can_react && !guest}
                      onClick={() => void react(r.key)}
                      className={`flex h-[52px] items-center justify-center gap-1.5 rounded-2xl border font-extrabold text-heading lg:h-[58px] lg:gap-2 ${on ? 'border-primary bg-primary-soft' : 'border-border bg-surface'}`}
                    >
                      <span aria-hidden="true" className="text-2xl lg:text-[32px]">{r.emoji}</span>
                      <span data-testid={`count-${r.key}`} className="text-base lg:text-xl">{post.reactions[r.key] ?? 0}</span>
                      <span className="sr-only">{t(`feed.reaction.${r.key}`)}</span>
                    </button>
                  )
                })}
              </div>
              {kind === 'remix' && (
                <>
                  <button
                    type="button"
                    data-testid="draw-same"
                    aria-expanded={remixOpen}
                    onClick={() => setRemixOpen((o) => !o)}
                    className={drawBtn}
                  >
                    {t('feed.drawSame')}
                  </button>
                  {remixOpen && <RemixBox postId={post.id} />}
                </>
              )}
              {kind === 'allow' && (
                <div className="flex flex-col gap-2">
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-border bg-bg px-4 py-3 font-extrabold text-heading">
                    {t('feed.remixAllow')}
                    <button
                      type="button"
                      role="switch"
                      data-testid="remix-allow"
                      aria-checked={post.remix_allowed}
                      onClick={() => void setAllowed(!post.remix_allowed)}
                      className={`relative h-7 w-12 shrink-0 rounded-full border border-border transition-colors ${post.remix_allowed ? 'bg-primary' : 'bg-primary-soft'}`}
                    >
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow-card transition-all ${post.remix_allowed ? 'left-[26px]' : 'left-0.5'}`} />
                    </button>
                  </label>
                  <ErrorText code={allowErr} />
                </div>
              )}
              {kind === 'link' && (
                <Link to={guest ? '/login' : `/create?template=${post.template_id}`} data-testid="draw-same" className={drawBtn}>
                  {t('feed.drawSame')}
                </Link>
              )}
            </>
          )}
          {tab === 'comments' && (
            <div data-testid="comments" className="flex flex-col gap-3 lg:max-h-[320px] lg:overflow-y-auto">
              {comments.length === 0 && <p className="text-sm text-muted">{t('feed.noComments')}</p>}
              {comments.map((c) => (
                <div key={c.id} data-testid="comment" className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-3 lg:px-4 lg:py-4">
                  <Avatar nick={c.nick} className="h-12 w-12 lg:h-16 lg:w-16" />
                  <div className="min-w-0">
                    <p className="text-base font-extrabold text-heading lg:text-xl">{c.nick}</p>
                    <p className="break-words text-text lg:text-xl">{c.text}</p>
                    {c.status === 'held' && !c.support && (
                      <p data-testid="comment-held" className="mt-1 text-xs font-bold text-primary">
                        {t('feed.commentHeld')}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {tab === 'comments' && <ErrorText code={actErr} />}
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
            <div className="mt-auto">
              {suggest && (
                <div
                  data-testid="kinder"
                  className="-mx-[13px] mb-2 rounded-3xl border border-border bg-surface p-3 shadow-card lg:absolute lg:left-[57.1%] lg:top-[57.7%] lg:z-20 lg:mx-0 lg:mb-0 lg:w-[42.2%] lg:p-[17px]"
                >
                  <div className="flex items-start gap-3">
                    <img src="/art/robot-wave.webp" alt="" className="h-20 w-auto shrink-0 lg:-ml-1 lg:h-[96px]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-extrabold leading-7 text-heading lg:text-2xl">{t('feed.kinderTitle')}</p>
                      <p data-testid="kinder-text" className="mt-1 rounded-xl bg-primary-soft px-3 py-2 text-text lg:text-base">
                        {suggest.kinder}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2 lg:mt-[14px] lg:gap-[11px]">
                    <button
                      type="button"
                      data-testid="kinder-use"
                      disabled={busy}
                      onClick={() => void acceptKind()}
                      className="h-12 min-w-0 flex-[150] rounded-2xl bg-primary px-1 text-sm font-extrabold uppercase text-primary-fg lg:h-[52px] lg:flex-[227] lg:text-base"
                    >
                      {t('feed.kinderUse')}
                    </button>
                    <button
                      type="button"
                      data-testid="kinder-edit"
                      onClick={() => void cancelKind(false)}
                      className="h-12 min-w-0 flex-[84] rounded-2xl border border-border bg-surface px-1 text-sm font-extrabold text-heading lg:h-[52px] lg:flex-[99] lg:text-base"
                    >
                      {t('feed.kinderEdit')}
                    </button>
                    <button
                      type="button"
                      data-testid="kinder-cancel"
                      onClick={() => void cancelKind(true)}
                      className="h-12 min-w-0 flex-[84] rounded-2xl border border-border bg-surface px-1 text-sm font-extrabold text-heading lg:h-[52px] lg:flex-[102] lg:text-base"
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
              <form onSubmit={(e) => void send(e)} className="flex gap-2 lg:-mx-[10px] lg:gap-3">
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
                  className="h-[52px] min-w-0 flex-1 rounded-full border border-border bg-bg px-4 text-heading outline-none focus:border-primary lg:h-[58px] lg:text-xl"
                />
                <button
                  type="submit"
                  data-testid="comment-send"
                  disabled={!text.trim() || busy}
                  className="h-[52px] w-[86px] rounded-2xl bg-primary px-0 font-extrabold uppercase text-primary-fg disabled:opacity-50 lg:h-[58px] lg:w-[110px] lg:text-xl"
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
