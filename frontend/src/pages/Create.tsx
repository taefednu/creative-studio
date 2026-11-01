import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { ApiError, api } from '../api'
import type { ShellContext } from '../components/AppShell'
import CreatePanel from '../components/CreatePanel'
import ErrorText, { errorKey } from '../components/ErrorText'
import PublishBox from '../components/PublishBox'
import SubmitBox from '../components/SubmitBox'
import SupportCard from '../components/SupportCard'
import TeacherTask from '../components/TeacherTask'
import { loadAssignments, submitTarget } from '../features/assignments/assignments'
import { POLLING, hintKey, loadTemplates } from '../features/works/works'
import type { TemplateInfo, Work } from '../features/works/works'
import { useSession } from '../features/auth/session'
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
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const { refresh } = useSession()

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
        setLoadErr(null)
        if (!POLLING.includes(w.status)) reloadMe()
      })
      .catch((x) => {
        if (!alive) return
        if (x instanceof ApiError && x.status === 404) navigate('/create', { replace: true })
        else if (x instanceof ApiError && x.status === 401) {
          // сессия кончилась: узнаём роль заново и уходим на вход
          void refresh()
          navigate('/login', { replace: true })
        } else {
          setLoadErr(errorKey(x))
          timer = setTimeout(() => setRetry((n) => n + 1), 1500)
        }
      })
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [workParam, navigate, reloadMe, refresh, retry])

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
    if (!work) {
      return loadErr ? (
        <div data-testid="work-load-error" className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3">
          <ErrorText code={loadErr} />
          <button type="button" onClick={() => setRetry((n) => n + 1)} className="rounded-full bg-primary px-6 py-2 font-extrabold text-primary-fg">
            {t('create.retry')}
          </button>
        </div>
      ) : null
    }
    return (
      <WorkView
        work={work}
        onAgain={() => navigate('/create')}
        onMine={() => navigate('/my-works')}
        onChoose={setLoaded}
        templates={templates}
        assignmentId={assignmentId}
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
      {templates && <CreatePanel templates={templates} price={price} tpl={tpl} onTpl={setSelected} assignmentId={assignmentId} />}
    </div>
  )
}

const ICON = 'h-6 w-6 shrink-0 lg:h-9 lg:w-9'
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
const btnOutline =
  'flex h-[52px] items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-3 text-base font-extrabold text-heading shadow-card lg:h-[85px] lg:gap-3 lg:text-[26px]'

/** Правая колонка: робот, подпись, заголовок, текст. Одна на готовую работу, «Давай так», отказ, задержку и сбой. */
function Side({ children }: { children: ReactNode }) {
  return (
    <aside data-testid="result-side" className="flex flex-col rounded-[28px] border border-border bg-surface p-5 shadow-card lg:p-[26px]">
      <img src="/art/robot-brush.webp" alt="" data-testid="side-robot" className="mx-auto h-[140px] w-[200px] object-contain lg:h-[225px] lg:w-[320px]" />
      {children}
    </aside>
  )
}

const Label = ({ children }: { children: ReactNode }) => (
  <p className="mt-3 text-sm font-extrabold uppercase text-primary lg:mt-4 lg:text-lg">{children}</p>
)
const SideTitle = ({ children, testid }: { children: ReactNode; testid?: string }) => (
  <h2 data-testid={testid} className="mt-1 text-2xl font-extrabold leading-tight text-heading lg:text-[34px]">
    {children}
  </h2>
)
const SideText = ({ children, testid }: { children: ReactNode; testid?: string }) => (
  <p data-testid={testid} className="mt-2 text-base text-muted lg:mt-3 lg:text-xl">
    {children}
  </p>
)

/** Образец стиля: картинка шаблона и его название; нет такого шаблона (ремикс) — блока нет. */
function StyleSample({ tpl, fill, children }: { tpl: TemplateInfo | undefined; fill?: boolean; children?: ReactNode }) {
  const { t } = useTranslation()
  if (!tpl) return null
  return (
    <figure data-testid="style-sample" className="flex min-w-0 flex-col overflow-hidden rounded-3xl border border-border bg-bg">
      {fill ? (
        <div className="relative min-h-[160px] flex-1 md:min-h-0">
          <img src={tpl.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        </div>
      ) : (
        <img src={tpl.image_url} alt="" className="aspect-square w-full object-cover" />
      )}
      <figcaption className="px-4 py-3">
        <p className="text-xs font-extrabold uppercase text-primary lg:text-base">{t('create.styleLabel')}</p>
        <p className="text-lg font-extrabold text-heading lg:text-2xl">{t(`templates.${tpl.id}`)}</p>
        {children}
      </figcaption>
    </figure>
  )
}

function WorkView({
  work,
  onAgain,
  onMine,
  onChoose,
  coinLine,
  templates,
  assignmentId,
}: {
  work: Work
  onAgain: () => void
  onMine: () => void
  onChoose: (w: Work) => void
  coinLine: string
  templates: TemplateInfo[] | undefined
  assignmentId: number | null
}) {
  const { t } = useTranslation()
  const [supportFor, setSupportFor] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [tasks] = useLoad(loadAssignments)
  const task = submitTarget(tasks, assignmentId)
  const s = work.status
  const tpl = templates?.find((x) => x.id === work.template_id)
  const wrap = 'mx-auto max-w-[1672px]'
  const grid = 'mt-3 grid gap-3 lg:mt-[22px] lg:grid-cols-[minmax(0,1155fr)_minmax(0,434fr)] lg:gap-[13px]'

  // публикация вернула «support»: на экране только тёплый ответ, как у work-support
  if (supportFor === work.id) return <SupportCard testid="publish-support" body="publish.support" onBack={onAgain} />

  if (s === 'proposed') {
    const answer = async (what: 'accept' | 'decline') => {
      setErr(null)
      try {
        onChoose(await api<Work>(`/api/works/${work.id}/${what}`, 'POST'))
        return true
      } catch (x) {
        setErr(errorKey(x))
        return false
      }
    }
    return (
      <div data-testid="work-proposed" className={wrap}>
        <h1 className="mt-1 text-[28px] font-extrabold leading-9 text-heading lg:mt-[15px] lg:w-fit lg:text-[52px] lg:leading-[55px]">{t('create.proposedTitle')}</h1>
        <div className={tpl ? grid : 'mx-auto mt-3 max-w-[434px]'}>
          {tpl && (
            <div data-testid="result-card" className="flex items-center justify-center rounded-[28px] border border-border bg-surface p-5 shadow-card lg:p-[26px]">
              <div className="w-full max-w-[560px]"><StyleSample tpl={tpl} /></div>
            </div>
          )}
          <Side>
            <Label>{t('create.friendly')}</Label>
            <SideTitle>{t('create.refusedTitle')}</SideTitle>
            <SideText testid="rewrite">{t('create.rewrite', { text: work.rewrite_text })}</SideText>
            <button
              type="button"
              data-testid="accept"
              onClick={() => void answer('accept')}
              className="mt-5 flex h-14 items-center justify-center gap-3 rounded-2xl bg-primary px-4 text-lg font-extrabold uppercase text-primary-fg shadow-card lg:h-[82px] lg:text-[28px]"
            >
              <svg viewBox="0 0 24 24" className={ICON} {...stroke} aria-hidden="true">
                <path d="M4 20L15 9" /><path d="M13 7l4 4" />
                <path d="M18 2v4M16 4h4M21 9v3M19.5 10.5h3M6 3v3M4.5 4.5h3" />
              </svg>
              {t('create.accept')}
            </button>
            <button
              type="button"
              data-testid="decline"
              onClick={() => void answer('decline').then((done) => done && onAgain())}
              className="mt-3 rounded-full px-4 py-2 text-base font-extrabold text-muted underline"
            >
              {t('create.decline')}
            </button>
            <ErrorText code={err} />
            <p data-testid="coin-line" className="mt-2 text-center text-base text-primary lg:text-xl">{coinLine}</p>
          </Side>
        </div>
      </div>
    )
  }

  if (s === 'checking' || s === 'generating') {
    return (
      <div data-testid="work-progress" className="mx-auto mt-6 flex max-w-xl flex-col items-center text-center lg:mt-10">
        <img src="/art/robot-brush.webp" alt="" className="h-[140px] w-auto lg:h-[200px]" />
        <p className="mt-3 animate-pulse text-3xl font-extrabold text-heading">
          {t(s === 'checking' ? 'create.checking' : 'create.generating')}
        </p>
        {work.rewrite_text && (
          <p data-testid="rewrite" className="mt-4 rounded-2xl bg-primary-soft px-4 py-3 text-lg font-bold text-heading">
            {t('create.rewrite', { text: work.rewrite_text })}
          </p>
        )}
        <div className="mt-5 w-full max-w-[280px]"><StyleSample tpl={tpl} /></div>
      </div>
    )
  }

  if (s === 'ready' && work.image_url) {
    return (
      <div data-testid="work-ready" className={wrap}>
        <h1 data-testid="result-title" className="mt-1 text-[28px] font-extrabold leading-9 text-heading lg:mt-[15px] lg:w-fit lg:text-[52px] lg:leading-[55px]">
          {t('create.readyTitle')}
        </h1>
        <div className={grid}>
          <div
            data-testid="result-card"
            className="grid grid-cols-2 gap-3 rounded-[28px] border border-border bg-surface p-3 shadow-card md:grid-cols-[480fr_277fr_310fr] md:gap-x-[17px] lg:p-[22px] lg:pb-[29px]"
          >
            <div className={`col-span-2 grid gap-3 md:col-span-3 lg:mb-[17px] ${tpl ? 'md:grid-cols-[543fr_532fr] md:gap-[26px]' : 'md:mx-auto md:w-full md:max-w-[543px]'}`}>
              <div data-testid="result-image" className="relative overflow-hidden rounded-3xl border-4 border-primary bg-surface">
                <img src={work.image_url} alt="" className="aspect-square w-full object-cover md:aspect-[543/532]" />
                <span className="absolute left-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-fg lg:left-auto lg:right-2">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke} strokeWidth={3} aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </span>
                <span className="absolute bottom-3 left-3 rounded-full bg-success-soft px-3 py-1 text-sm font-extrabold text-success lg:bottom-4 lg:left-4 lg:text-xl">
                  {t('create.checkedByAi')}
                </span>
              </div>
              <StyleSample tpl={tpl} fill>
                {work.rewrite_text && <p className="mt-2 text-sm text-muted lg:text-lg">{t('create.rewrite', { text: work.rewrite_text })}</p>}
              </StyleSample>
            </div>
            {task && <SubmitBox big workId={work.id} assignment={task} onSupport={() => setSupportFor(work.id)} />}
            <PublishBox workId={work.id} grid onSupport={() => setSupportFor(work.id)} />
            <button type="button" data-testid="draw-more" onClick={onAgain} className={btnOutline}>
              <svg viewBox="0 0 24 24" className={`${ICON} text-primary`} {...stroke} aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.5-5.8" /><path d="M20 4v5h-5" /></svg>
              {t('create.drawMore')}
            </button>
            <button type="button" data-testid="to-mine" onClick={onMine} className={btnOutline}>
              <svg viewBox="0 0 24 24" className={`${ICON} text-primary`} {...stroke} aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z" /></svg>
              {t('create.toMine')}
            </button>
          </div>
          <Side>
            {work.rewrite_text ? (
              <>
                <Label>{t('create.friendly')}</Label>
                <SideTitle>{t('create.refusedTitle')}</SideTitle>
                <SideText>{t('create.rewrite', { text: work.rewrite_text })}</SideText>
              </>
            ) : (
              <>
                <SideTitle>{t('create.sideReadyTitle')}</SideTitle>
                <SideText>{t('create.sideReadyText')}</SideText>
              </>
            )}
          </Side>
        </div>
      </div>
    )
  }

  // Ребёнку, которому плохо, не «дружеская идея для рисунка» и не «нарисуй иначе»: только тёплый ответ без робота.
  if (s === 'support') {
    return <SupportCard testid="work-support" body={work.adult_notified === false ? 'create.supportTextNoAdult' : 'create.supportText'} onBack={onAgain} />
  }

  const title = {
    refused: t('create.refusedTitle'),
    held: t('create.heldTitle'),
    failed: t('create.failedTitle'),
    ready: t('create.failedTitle'),
  }[s as 'refused']
  const body =
    s === 'refused' ? t(hintKey(work.reason_codes)) : s === 'held' ? t('create.heldText') : t('create.failedText')
  return (
    <div data-testid={`work-${s}`} className={wrap}>
      <div className={tpl ? grid : 'mx-auto mt-3 max-w-[434px]'}>
        {tpl && (
          <div data-testid="result-card" className="flex items-center justify-center rounded-[28px] border border-border bg-surface p-5 shadow-card lg:p-[26px]">
            <div className="w-full max-w-[560px]"><StyleSample tpl={tpl} /></div>
          </div>
        )}
        <Side>
          {s === 'refused' && <Label>{t('create.friendly')}</Label>}
          <SideTitle testid="work-title">{title}</SideTitle>
          <SideText testid="work-body">{body}</SideText>
          {s === 'refused' && <p className="mt-2 font-bold text-primary">{coinLine}</p>}
          <button
            type="button"
            data-testid="try-again"
            onClick={onAgain}
            className="mt-5 rounded-2xl bg-primary px-8 py-4 text-lg font-extrabold uppercase text-primary-fg shadow-card"
          >
            {t('create.tryAgain')}
          </button>
        </Side>
      </div>
    </div>
  )
}
