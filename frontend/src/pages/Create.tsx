import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { api } from '../api'
import type { ShellContext } from '../components/AppShell'
import Coin from '../components/Coin'
import ErrorText, { errorKey } from '../components/ErrorText'
import TeacherTask from '../components/TeacherTask'
import { POLLING, hintKey } from '../features/works/works'
import type { TemplateInfo, Work } from '../features/works/works'
import { useLoad } from '../useLoad'

const loadTemplates = () => api<{ price: number; templates: TemplateInfo[] }>('/api/templates')

const FAN_IDS = ['castle', 'superhero', 'watercolor', 'space_pet']
const FAN_STYLE = [
  'rotate-[-9deg] translate-y-3',
  'rotate-[-3deg] -translate-y-1',
  'rotate-[3deg] translate-y-0',
  'rotate-[9deg] translate-y-4',
]

function Spark({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`absolute ${className}`} aria-hidden="true">
      <path d="M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z" fill="currentColor" />
    </svg>
  )
}

function Fan({ templates }: { templates: TemplateInfo[] }) {
  const items = FAN_IDS.map((id) => templates.find((x) => x.id === id)).filter(
    (x): x is TemplateInfo => !!x,
  )
  return (
    <div
      data-testid="fan"
      className="relative mx-auto flex h-[150px] items-center justify-center sm:h-[200px] md:h-[245px]"
    >
      <Spark className="left-[8%] top-[20%] h-6 w-6 text-star md:left-[22%] md:h-8 md:w-8" />
      <Spark className="right-[8%] top-[28%] h-5 w-5 text-primary md:right-[22%] md:h-7 md:w-7" />
      <Spark className="right-[4%] top-[8%] h-4 w-4 text-star md:right-[18%] md:h-6 md:w-6" />
      {items.map((it, i) => (
        <img
          key={it.id}
          src={it.image_url}
          alt=""
          className={`-ml-5 h-[90px] w-[90px] sm:h-[120px] sm:w-[120px] rounded-2xl border-4 border-surface bg-surface object-cover shadow-card first:ml-0 md:-ml-3 md:h-[205px] md:w-[205px] md:rounded-3xl ${FAN_STYLE[i]}`}
        />
      ))}
    </div>
  )
}

type Phase = { kind: 'idle' } | { kind: 'work'; work: Work }

export default function Create() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { reloadMe } = useOutletContext<ShellContext>()
  const [tplData] = useLoad(loadTemplates)
  const templates = tplData?.templates
  const price = tplData?.price
  const [selected, setSelected] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const requestId = useRef<string | null>(null)

  const tpl = selected ?? templates?.[0]?.id ?? null
  const workId = phase.kind === 'work' ? phase.work.id : null
  const workStatus = phase.kind === 'work' ? phase.work.status : null

  // опрос, пока работа не дошла до конечного статуса
  useEffect(() => {
    if (workId === null || !workStatus || !POLLING.includes(workStatus)) return
    const timer = setInterval(() => {
      api<Work>(`/api/works/${workId}`)
        .then((w) => {
          setPhase({ kind: 'work', work: w })
          if (!POLLING.includes(w.status)) reloadMe()
        })
        .catch(() => {})
    }, 1500)
    return () => clearInterval(timer)
  }, [workId, workStatus, reloadMe])

  const draw = useCallback(async () => {
    if (!tpl || sending) return
    setSending(true)
    setErr(null)
    requestId.current ??= crypto.randomUUID()
    try {
      const r = await api<{ id: number }>('/api/works', 'POST', {
        template_id: tpl,
        text: text.trim() || null,
        request_id: requestId.current,
      })
      const w = await api<Work>(`/api/works/${r.id}`)
      setPhase({ kind: 'work', work: w })
      reloadMe()
    } catch (x) {
      setErr(errorKey(x))
      requestId.current = null
    } finally {
      setSending(false)
    }
  }, [tpl, sending, text, reloadMe])

  function again() {
    requestId.current = null
    setPhase({ kind: 'idle' })
    setErr(null)
  }

  if (phase.kind === 'work') {
    const w = phase.work
    return (
      <WorkView
        work={w}
        onAgain={again}
        onMine={() => navigate('/my-works')}
        onChoose={(w2) => setPhase({ kind: 'work', work: w2 })}
        coinLine={t(w.status === 'refused' && w.reason_codes.includes('content_policy') ? 'create.coinBack' : 'create.coinKept')}
      />
    )
  }

  return (
    <div className="mx-auto max-w-[1672px]">
      {templates && <Fan templates={templates} />}
      <h1
        data-testid="create-title"
        className="mt-1 text-center text-3xl font-extrabold text-heading md:mt-0 md:h-[50px] md:text-[44px] md:leading-[50px]"
      >
        {t('create.title')}
      </h1>
      <p className="mt-2 text-center md:mt-[5px]">
        <span className="inline-block rounded-full bg-primary-soft px-5 py-1 text-sm font-bold text-muted md:text-lg">
          {t('create.sub')}
        </span>
      </p>
      <div data-testid="teacher-task-slot" className="mt-4 md:mt-[15px] md:min-h-[55px]">
        <TeacherTask />
      </div>
      <h2 className="mt-3 text-sm font-extrabold uppercase text-primary md:mt-[18px] md:text-lg">
        {t('create.chooseStyle')}
      </h2>
      <div
        data-testid="templates"
        className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 md:mt-[6px] md:grid-cols-8 md:gap-[11px]"
      >
        {templates?.map((x) => (
          <button
            key={x.id}
            type="button"
            data-testid={`tpl-${x.id}`}
            aria-pressed={tpl === x.id}
            onClick={() => setSelected(x.id)}
            className={`flex flex-col items-center gap-1 rounded-2xl border-4 bg-surface p-1.5 text-center shadow-card md:min-h-[225px] ${
              tpl === x.id ? 'border-primary' : 'border-transparent'
            }`}
          >
            <img src={x.image_url} alt="" className="aspect-square w-full rounded-xl object-cover" />
            <span className="px-1 text-sm font-extrabold leading-tight text-heading md:text-base">
              {t(`templates.${x.id}`)}
            </span>
          </button>
        ))}
      </div>
      <div className="mx-auto mt-4 w-full max-w-[833px] sticky bottom-[84px] z-[5] rounded-3xl border border-border bg-surface p-3 shadow-card md:static md:mt-[18px] md:h-[122px]">
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <div className="flex flex-col gap-2">
            <input
              data-testid="prompt-input"
              value={text}
              maxLength={200}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('create.placeholder')}
              aria-label={t('create.placeholder')}
              className="w-full rounded-full border border-border bg-bg px-4 py-3 text-heading outline-none focus:border-primary"
            />
            <button
              type="button"
              disabled
              title={t('create.voiceSoon')}
              aria-label={t('create.voiceSoon')}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface text-primary opacity-50"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <rect x="9" y="3" width="6" height="12" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </button>
          </div>
          <button
            type="button"
            data-testid="draw"
            disabled={!tpl || sending}
            onClick={() => void draw()}
            className="flex min-w-[130px] flex-col items-center justify-center gap-1 rounded-2xl bg-primary px-4 text-lg font-extrabold uppercase text-primary-fg shadow-card disabled:opacity-60 md:min-w-[168px] md:text-xl"
          >
            {t('create.draw')}
            <span className="flex items-center gap-1">
              <Coin className="h-6 w-6" />
              <span data-testid="price">{price ?? ''}</span>
            </span>
          </button>
        </div>
      </div>
      <div className="mx-auto mt-3 max-w-[833px]">
        <ErrorText code={err} />
      </div>
    </div>
  )
}

function WorkView({
  work,
  onAgain,
  onMine,
  onChoose,
  coinLine,
}: {
  work: Work
  onAgain: () => void
  onMine: () => void
  onChoose: (w: Work) => void
  coinLine: string
}) {
  const { t } = useTranslation()
  const s = work.status

  if (s === 'proposed') {
    const answer = (what: 'accept' | 'decline') =>
      api<Work>(`/api/works/${work.id}/${what}`, 'POST').then(onChoose)
    return (
      <div data-testid="work-proposed" className="mx-auto mt-6 max-w-xl rounded-3xl border border-border bg-surface p-6 text-center shadow-card">
        <p data-testid="rewrite" className="text-2xl font-extrabold text-heading">
          {t('create.rewrite', { text: work.rewrite_text })}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            data-testid="accept"
            onClick={() => void answer('accept')}
            className="rounded-full bg-primary px-4 py-3 font-extrabold text-primary-fg shadow-card"
          >
            {t('create.accept')}
          </button>
          <button
            type="button"
            data-testid="decline"
            onClick={() => void answer('decline').then(onAgain)}
            className="rounded-full border border-border bg-surface px-4 py-3 font-extrabold text-heading"
          >
            {t('create.decline')}
          </button>
        </div>
      </div>
    )
  }

  if (s === 'checking' || s === 'generating') {
    return (
      <div data-testid="work-progress" className="mx-auto mt-10 max-w-xl text-center">
        <p className="animate-pulse text-3xl font-extrabold text-heading">
          {t(s === 'checking' ? 'create.checking' : 'create.generating')}
        </p>
        {work.rewrite_text && (
          <p data-testid="rewrite" className="mt-4 rounded-2xl bg-primary-soft px-4 py-3 text-lg font-bold text-heading">
            {t('create.rewrite', { text: work.rewrite_text })}
          </p>
        )}
      </div>
    )
  }

  if (s === 'ready' && work.image_url) {
    return (
      <div data-testid="work-ready" className="mx-auto max-w-xl">
        <h1 className="text-3xl font-extrabold text-heading">{t('create.readyTitle')}</h1>
        {work.rewrite_text && (
          <p className="mt-2 rounded-2xl bg-primary-soft px-4 py-2 font-bold text-heading">
            {t('create.rewrite', { text: work.rewrite_text })}
          </p>
        )}
        <div className="relative mt-4 overflow-hidden rounded-3xl border-4 border-primary bg-surface shadow-card">
          <img data-testid="result-image" src={work.image_url} alt="" className="aspect-square w-full object-cover" />
          <span className="absolute bottom-3 left-3 rounded-full bg-success-soft px-3 py-1 text-sm font-extrabold text-success">
            {t('create.checkedByAi')}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            data-testid="draw-more"
            onClick={onAgain}
            className="rounded-full bg-primary px-4 py-3 font-extrabold text-primary-fg shadow-card"
          >
            {t('create.drawMore')}
          </button>
          <button
            type="button"
            data-testid="to-mine"
            onClick={onMine}
            className="rounded-full border border-border bg-surface px-4 py-3 font-extrabold text-heading"
          >
            {t('create.toMine')}
          </button>
        </div>
      </div>
    )
  }

  const soft = s === 'refused'
  const title = {
    refused: t('create.refusedTitle'),
    held: t('create.heldTitle'),
    support: t('create.supportTitle'),
    failed: t('create.failedTitle'),
    ready: t('create.failedTitle'),
  }[s as 'refused']
  const body =
    s === 'refused'
      ? t(hintKey(work.reason_codes))
      : s === 'held'
        ? t('create.heldText')
        : s === 'support'
          ? t('create.supportText')
          : t('create.failedText')
  return (
    <div data-testid={`work-${s}`} className="mx-auto mt-6 max-w-xl rounded-3xl border border-border bg-surface p-6 text-center shadow-card">
      <p className="text-sm font-extrabold uppercase text-primary">{t('create.friendly')}</p>
      <h1 data-testid="work-title" className="mt-2 text-3xl font-extrabold text-heading">
        {title}
      </h1>
      <p data-testid="work-body" className="mt-3 text-lg text-text">
        {body}
      </p>
      {soft && <p className="mt-3 font-bold text-primary">{coinLine}</p>}
      <button
        type="button"
        data-testid="try-again"
        onClick={onAgain}
        className="mt-5 rounded-full bg-primary px-8 py-3 text-lg font-extrabold uppercase text-primary-fg shadow-card"
      >
        {t('create.tryAgain')}
      </button>
    </div>
  )
}
