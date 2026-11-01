import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { ApiError, api } from '../api'
import type { ShellContext } from '../components/AppShell'
import CreatePanel from '../components/CreatePanel'
import PublishBox from '../components/PublishBox'
import TeacherTask from '../components/TeacherTask'
import { POLLING, hintKey, loadTemplates } from '../features/works/works'
import type { TemplateInfo, Work } from '../features/works/works'
import { useLoad } from '../useLoad'

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
      className="relative mx-auto flex h-[140px] max-w-[835px] items-center justify-center sm:h-[200px] lg:h-[245px]"
    >
      <Spark className="left-[8%] top-[20%] h-6 w-6 text-star md:left-[22%] md:h-8 md:w-8" />
      <Spark className="right-[8%] top-[28%] h-5 w-5 text-primary md:right-[22%] md:h-7 md:w-7" />
      <Spark className="right-[4%] top-[8%] h-4 w-4 text-star md:right-[18%] md:h-6 md:w-6" />
      {items.map((it, i) => (
        <img
          key={it.id}
          src={it.image_url}
          alt=""
          className={`-ml-5 h-[90px] w-[90px] sm:h-[120px] sm:w-[120px] rounded-2xl border-4 border-surface bg-surface object-cover shadow-card first:ml-0 md:-ml-3 md:h-[160px] md:w-[160px] md:rounded-3xl lg:h-[205px] lg:w-[205px] ${FAN_STYLE[i]}`}
        />
      ))}
    </div>
  )
}

export default function Create() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { reloadMe } = useOutletContext<ShellContext>()
  const [tplData] = useLoad(loadTemplates)
  const templates = tplData?.templates
  const price = tplData?.price
  const [params] = useSearchParams()
  const [selected, setSelected] = useState<string | null>(params.get('template'))
  const workParam = Number(params.get('work')) || null
  const assignmentId = Number(params.get('assignment')) || null
  const [loaded, setLoaded] = useState<Work | null>(null)
  const [retry, setRetry] = useState(0)

  const known = templates?.some((x) => x.id === selected)
  const tpl = (known ? selected : null) ?? templates?.[0]?.id ?? null
  const work = loaded?.id === workParam ? loaded : null
  const workId = work?.id ?? null
  const workStatus = work?.status ?? null

  // работа по ссылке /create?work=<id>: чужая или несуществующая (404) — на «Создать»; сбой сети — повтор
  useEffect(() => {
    if (workParam === null) return
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    api<Work>(`/api/works/${workParam}`)
      .then((w) => {
        if (!alive) return
        setLoaded(w)
        if (!POLLING.includes(w.status)) reloadMe()
      })
      .catch((x) => {
        if (!alive) return
        if (x instanceof ApiError && x.status === 404) navigate('/create', { replace: true })
        else timer = setTimeout(() => setRetry((n) => n + 1), 1500)
      })
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [workParam, navigate, reloadMe, retry])

  // опрос, пока работа не дошла до конечного статуса
  useEffect(() => {
    if (workId === null || !workStatus || !POLLING.includes(workStatus)) return
    let alive = true
    const timer = setInterval(() => {
      api<Work>(`/api/works/${workId}`)
        .then((w) => {
          if (!alive) return
          setLoaded(w)
          if (!POLLING.includes(w.status)) reloadMe()
        })
        .catch(() => {})
    }, 1500)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [workId, workStatus, reloadMe])

  if (workParam !== null) {
    if (!work) return null
    return (
      <WorkView
        work={work}
        onAgain={() => navigate('/create')}
        onMine={() => navigate('/my-works')}
        onChoose={setLoaded}
        coinLine={t(work.status === 'refused' && work.reason_codes.includes('content_policy') ? 'create.coinBack' : 'create.coinKept')}
      />
    )
  }

  return (
    <div className="mx-auto max-w-[1672px] md:mt-[6px]">
      {templates && <Fan templates={templates} />}
      <div className="mt-1 text-center md:mt-0">
        <h1
          data-testid="create-title"
          className="inline-block text-2xl font-extrabold leading-[34px] text-heading md:h-[48px] md:text-[44px] md:leading-[48px]"
        >
          {t('create.title')}
        </h1>
      </div>
      <p className="mt-1 text-center md:mt-[5px]">
        <span data-testid="create-sub" className="inline-block rounded-full bg-primary-soft px-5 py-1 text-sm font-bold text-muted md:py-0.5 md:text-lg">
          {t('create.sub')}
        </span>
      </p>
      <div data-testid="teacher-task-slot" className="mt-3 md:mt-[15px] md:min-h-[55px]">
        <TeacherTask assignmentId={assignmentId} />
      </div>
      <h2 data-testid="style-heading" className="mt-3 w-fit text-sm font-extrabold uppercase leading-5 text-primary md:mt-[18px] md:text-lg md:leading-5">
        {t('create.chooseStyle')}
      </h2>
      <div
        data-testid="templates"
        className="mt-2 grid grid-cols-4 gap-2 md:mt-[6px] md:grid-cols-8 md:gap-[11px]"
      >
        {templates?.map((x) => (
          <button
            key={x.id}
            type="button"
            data-testid={`tpl-${x.id}`}
            aria-pressed={tpl === x.id}
            onClick={() => setSelected(x.id)}
            className={`flex flex-col items-center gap-1 rounded-2xl border-4 bg-surface p-1.5 text-center shadow-card h-[137px] md:h-[225px] ${
              tpl === x.id ? 'border-primary' : 'border-transparent'
            }`}
          >
            <img src={x.image_url} alt="" className="min-h-0 w-full flex-1 rounded-xl object-cover" />
            <span className="line-clamp-2 px-0.5 text-[11px] font-extrabold leading-tight text-heading md:px-1 md:text-base">
              {t(`templates.${x.id}`)}
            </span>
          </button>
        ))}
      </div>
      {templates && <CreatePanel templates={templates} price={price} tpl={tpl} onTpl={setSelected} />}
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
        <div className="mt-4"><PublishBox workId={work.id} /></div>
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
          ? t(work.adult_notified === false ? 'create.supportTextNoAdult' : 'create.supportText')
          : t('create.failedText')
  return (
    <div data-testid={`work-${s}`} className="mx-auto mt-6 max-w-xl rounded-3xl border border-border bg-surface p-6 text-center shadow-card">
      {/* Ребёнку, которому плохо, не «дружеская идея для рисунка» и не «нарисуй иначе». */}
      {s !== 'support' && <p className="text-sm font-extrabold uppercase text-primary">{t('create.friendly')}</p>}
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
        {t(s === 'support' ? 'create.supportBack' : 'create.tryAgain')}
      </button>
    </div>
  )
}
