import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { ApiError, api } from '../api'
import type { ShellContext } from '../components/AppShell'
import StoryForm from '../components/StoryForm'
import UploadPopup from '../components/UploadPopup'
import CreatePanel from '../components/CreatePanel'
import ErrorText, { errorKey } from '../components/ErrorText'
import DrawingStage from '../components/DrawingStage'
import GenStage from '../components/GenStage'
import Icon from '../components/Icon'
import PublishBox from '../components/PublishBox'
import SubmitBox from '../components/SubmitBox'
import SupportCard from '../components/SupportCard'
import TeacherTask from '../components/TeacherTask'
import { loadAssignments, shownTask, submitTarget } from '../features/assignments/assignments'
import { BLURRED, POLLING, hintKey, loadTemplates } from '../features/works/works'
import type { TemplateInfo, Work } from '../features/works/works'
import { useSession } from '../features/auth/session'
import { useLoad } from '../useLoad'

// Своего стиля нет в витрине шаблонов: только здесь, стиль описывают текстом
const CUSTOM: TemplateInfo = { id: 'custom', image_url: '/art/custom-style.webp' }
const TILE = 'flex min-h-0 snap-start flex-col gap-1 rounded-2xl border-4 p-1 shadow-card md:rounded-3xl md:p-1.5'
const TILE_IMG = 'relative min-h-0 w-full flex-1 overflow-hidden rounded-xl md:rounded-2xl'
const TILE_TEXT = 'line-clamp-2 h-10 w-full shrink-0 px-1 text-center text-sm font-extrabold leading-5 md:line-clamp-1 md:h-auto md:text-base'

export default function Create() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { reloadMe } = useOutletContext<ShellContext>()
  const [tplData] = useLoad(loadTemplates)
  const templates = tplData?.templates
  const withCustom = templates && [...templates, CUSTOM]
  const price = tplData?.price
  const [params] = useSearchParams()
  const [selected, setSelected] = useState<string | null>(params.get('template'))
  const workParam = Number(params.get('work')) || null
  const paramTask = Number(params.get('assignment')) || null
  const [tasks] = useLoad(loadAssignments)
  // без параметра работает то задание, которое строка учителя показывает ребёнку: «Сдать» относится к нему
  const assignmentId = paramTask ?? shownTask(tasks, null)?.id ?? null
  const [loaded, setLoaded] = useState<Work | null>(null)
  const [retry, setRetry] = useState(0)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const { refresh } = useSession()
  const flow = useLocation().state as DrawingFlow | null

  const known = withCustom?.some((x) => x.id === selected)
  const tpl = (known ? selected : null) ?? templates?.[0]?.id ?? null
  const work = loaded?.id === workParam ? loaded : null
  const workId = work?.id ?? null
  const workStatus = work?.status ?? null

  // стиль из ссылки: на телефоне его плитка может быть за краем полосы
  const linked = params.get('template')
  useEffect(() => {
    if (linked && templates) document.querySelector(`[data-testid="tpl-${linked}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [linked, templates])

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
      ) : flow?.drawing ? (
        // между экранами фото не должно мигать: работа ещё едет, рисунок уже есть
        <DrawingStage src={flow.drawing} phase={flow.auto ? 'look' : 'glow'} title={t(flow.auto ? 'gen.readUpload' : 'gen.alive')} />
      ) : null
    }
    return (
      <WorkView
        work={work}
        onAgain={() => navigate(paramTask ? `/create?assignment=${paramTask}` : '/create')}
        onChoose={setLoaded}
        templates={withCustom}
        assignmentId={assignmentId}
        coinLine={t(work.status === 'refused' && work.reason_codes.includes('content_policy') ? 'create.coinBack' : 'create.coinKept')}
      />
    )
  }

  return (
    <div className="mx-auto flex -mb-7 h-[calc(100dvh-154px)] min-h-[520px] max-w-[1672px] flex-col lg:mb-0 lg:h-[calc(100dvh-104px)]">
      <h1 data-testid="create-title" className="text-balance text-center text-[34px] font-black leading-[38px] tracking-tight text-heading md:text-[52px] md:leading-[56px]">
        {t('create.title')}
      </h1>
      <div data-testid="teacher-task-slot" className="mt-3 empty:hidden">
        <TeacherTask assignmentId={assignmentId} />
      </div>
      {/* Телефон: два ряда листаются вбок, вертикального скролла нет. От md: все плитки видны сразу */}
      <div
        data-testid="templates"
        className="-mx-4 mt-2 grid min-h-0 w-[calc(100%+32px)] flex-1 auto-cols-[38vw] snap-x grid-flow-col grid-rows-[auto_1fr_1fr] gap-2 overflow-x-auto scroll-px-4 px-4 py-2 [scrollbar-width:none] md:mx-auto md:mt-4 md:w-full md:max-w-[1180px] md:grid-flow-row md:grid-cols-5 md:gap-x-4 md:gap-y-3 md:overflow-visible md:px-0 md:py-0"
      >
        {templates && (
          <UploadPopup
            boxClassName="col-start-1 row-span-2 row-start-1 mr-2 min-h-0 snap-start md:mr-6"
            className={`${TILE} h-full w-full border-transparent bg-primary-soft`}
            assignmentId={assignmentId}
            price={price}
            label={
              <>
                <span className={TILE_IMG}>
                  <img src="/art/my-drawing.webp" alt="" className="absolute inset-0 h-full w-full object-cover" />
                  <span className="absolute bottom-3 right-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-fg">
                    <Icon name="plus" />
                  </span>
                </span>
                <span className={`${TILE_TEXT} text-heading`}>{t('create.myDrawing')}</span>
              </>
            }
          />
        )}
        {templates && (
          <button
            type="button"
            data-testid="tpl-custom"
            aria-pressed={tpl === CUSTOM.id}
            onClick={() => setSelected(CUSTOM.id)}
            className={`${TILE} col-start-1 row-start-3 mr-2 bg-primary-soft md:mr-6 ${tpl === CUSTOM.id ? 'border-primary' : 'border-transparent'}`}
          >
            <span className={TILE_IMG}>
              <img src={CUSTOM.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
              {tpl === CUSTOM.id && (
                <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-fg">
                  <Icon name="check" />
                </span>
              )}
            </span>
            <span className={`${TILE_TEXT} ${tpl === CUSTOM.id ? 'text-primary' : 'text-heading'}`}>{t('templates.custom')}</span>
          </button>
        )}
        <h2 data-testid="style-heading" className="col-span-4 col-start-2 row-start-1 text-lg font-extrabold leading-6 text-heading md:text-xl">
          {t('create.chooseStyle')}
        </h2>
        {templates?.map((x) => (
          <button
            key={x.id}
            type="button"
            data-testid={`tpl-${x.id}`}
            aria-pressed={tpl === x.id}
            onClick={() => setSelected(x.id)}
            className={`${TILE} bg-surface ${tpl === x.id ? 'border-primary' : 'border-transparent'}`}
          >
            <span className={TILE_IMG}>
              <img src={x.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
              {tpl === x.id && (
                <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-fg">
                  <Icon name="check" />
                </span>
              )}
            </span>
            <span className={`${TILE_TEXT} ${tpl === x.id ? 'text-primary' : 'text-heading'}`}>{t(`templates.${x.id}`)}</span>
          </button>
        ))}
      </div>
      {withCustom && <CreatePanel templates={withCustom} price={price} tpl={tpl} onTpl={setSelected} assignmentId={assignmentId} />}
    </div>
  )
}

/** Состояние перехода: своё фото с этого устройства и «оживить сразу, как рисунок пройдёт проверку». */
type DrawingFlow = { drawing?: string; auto?: boolean }

const ICON = 'h-6 w-6 shrink-0 lg:h-9 lg:w-9'
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

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
  onChoose,
  coinLine,
  templates,
  assignmentId,
}: {
  work: Work
  onAgain: () => void
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
  // проявление только если на глазах ребёнка шло рисование: перезагрузка готовой работы её не запускает
  const [sawDrawing, setSawDrawing] = useState(false)
  const navigate = useNavigate()
  const { reloadMe } = useOutletContext<ShellContext>()
  const [tplData] = useLoad(loadTemplates)
  const price = tplData?.price
  const storyPrice = tplData?.story_price
  const [heroBusy, setHeroBusy] = useState(false)
  const [heroRid] = useState(() => crypto.randomUUID())
  const flow = useLocation().state as DrawingFlow | null
  const drawing = flow?.drawing
  const workId = work.id
  const bringAlive = useCallback(async (requestId: string) => {
    setHeroBusy(true)
    setErr(null)
    try {
      const r = await api<{ id: number }>(`/api/works/${workId}/alive`, 'POST', { request_id: requestId })
      reloadMe()
      // replace: «назад» не должен вернуть на экран, который оживляет рисунок сам
      navigate(`/create?work=${r.id}`, { replace: true, state: { drawing } })
    } catch (x) {
      setErr(errorKey(x))
    } finally {
      setHeroBusy(false)
    }
  }, [workId, drawing, navigate, reloadMe])
  // Оживление сразу после проверки: только рисунок, который её прошёл. Запрос привязан к работе: перезагрузка не спишет монету второй раз
  const auto = work.kind === 'upload' && s === 'ready' && !!flow?.auto && !err
  const started = useRef(false)
  useEffect(() => {
    if (!auto || started.current) return
    started.current = true
    void bringAlive(`auto-alive-${workId}`)
  }, [auto, workId, bringAlive])
  // Готовая картинка сначала проступает на том же месте, где только что светился рисунок
  const reveal = s === 'ready' && !!work.image_url && (work.kind === 'alive' ? !!drawing : work.kind !== 'upload' && sawDrawing)
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    if (!reveal || revealed) return
    const timer = setTimeout(() => setRevealed(true), 2200)
    return () => clearTimeout(timer)
  }, [reveal, revealed])
  if (POLLING.includes(s) && !sawDrawing) setSawDrawing(true)
  const upload = work.kind === 'upload'
  // что SAM спрятал на загрузке: коды blurred_<что>, текст из i18n по коду; оригинал ребёнку не показывается
  const blurred = work.reason_codes.filter((c) => c.startsWith('blurred_')).map((c) => c.slice(8)).filter((c) => BLURRED.includes(c))
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
        <h1 className="mt-1 text-[28px] font-extrabold leading-9 text-heading lg:mt-[15px] lg:w-fit lg:text-4xl lg:leading-10">{t('create.proposedTitle')}</h1>
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

  if (auto) return <DrawingStage src={drawing ?? null} phase="glow" title={t('gen.alive')} />
  if (reveal && !revealed) return <DrawingStage src={drawing ?? tpl?.image_url ?? null} cloud={!drawing} result={work.image_url} phase="reveal" title={t(work.kind === 'alive' ? 'create.aliveTitle' : 'create.readyTitle')} />
  if (drawing && (s === 'checking' || s === 'generating')) {
    const looking = work.kind === 'upload'
    return <DrawingStage src={drawing} phase={looking ? 'look' : 'glow'} title={t(looking ? 'gen.readUpload' : work.drawn ? 'gen.verify' : 'gen.alive')} />
  }
  if (s === 'checking' || s === 'generating') {
    return <GenStage work={work} sample={tpl?.image_url} styleName={tpl ? t(`templates.${tpl.id}`) : undefined} />
  }

  if (s === 'ready' && work.image_url) {
    return (
      <div data-testid="work-ready" className="mx-auto -mb-7 max-w-[1672px] lg:mb-0 lg:flex lg:items-center lg:justify-center lg:gap-10">
        <div data-testid="result-image" className="relative mt-1 overflow-hidden rounded-[28px] bg-surface shadow-pop lg:mt-0 lg:aspect-square lg:h-[calc(100dvh-112px)] lg:max-h-[700px] lg:shrink-0">
          <img data-testid="result-img" src={work.image_url} alt="" className={`aspect-square w-full object-cover lg:h-full ${sawDrawing && !revealed ? 'gen-reveal' : ''}`} />
          <span className={`absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-success-soft py-1 pl-2 pr-3 text-sm font-extrabold text-success lg:text-base ${sawDrawing ? 'gen-badge' : ''}`}><Icon name="check" />{t('create.checkedByAi')}</span>
          {work.hero_of_work_id && (
            <figure data-testid="hero-source" className="hero-source absolute right-3 top-3 w-[28%] rotate-3 overflow-hidden rounded-2xl border-4 border-surface bg-surface shadow-pop">
              <img src={`/api/works/${work.hero_of_work_id}/image?thumb=1`} alt={t('story.yourDrawing')} className="aspect-square w-full object-cover" />
              <figcaption className="px-1 py-0.5 text-center text-xs font-extrabold text-heading">{t('story.yourDrawing')}</figcaption>
            </figure>
          )}
        </div>
        <section data-testid="result-side" className="mt-3 flex min-w-0 flex-col gap-2 lg:mt-0 lg:w-[400px] lg:gap-3">
          <h1 data-testid="result-title" className="text-balance text-[28px] font-black leading-8 tracking-tight text-heading lg:mb-3 lg:text-5xl lg:leading-[52px]">{t(upload ? 'create.uploadReadyTitle' : work.kind === 'alive' ? 'create.aliveTitle' : 'create.readyTitle')}</h1>
          {work.rewrite_text && <p className="text-base text-muted lg:text-lg">{t('create.rewrite', { text: work.rewrite_text })}</p>}
          {blurred.map((c) => <p key={c} data-testid={`blurred-${c}`} className="text-base text-muted lg:text-lg">{t(`create.blurred.${c}`)}</p>)}
          {upload && (
            <button type="button" data-testid="hero-go" disabled={heroBusy} onClick={() => void bringAlive(heroRid)} className="btn-press flex h-14 items-center justify-center gap-2 rounded-2xl bg-primary text-lg font-extrabold text-primary-fg disabled:opacity-60">
              {t('story.hero')}
              <img src="/art/coin.webp" alt="" className="h-7 w-7" />
              {price}
            </button>
          )}
          {err && <ErrorText code={err} />}
          {task && <SubmitBox main workId={work.id} assignment={task} onSupport={() => setSupportFor(work.id)} />}
          <PublishBox main second={!!task} workId={work.id} onSupport={() => setSupportFor(work.id)} />
          {(work.kind === 'alive' || work.kind === 'image' || !work.kind) && (
            <StoryForm heroId={work.id} price={storyPrice} onCreated={(id) => navigate(`/story/${id}`)} />
          )}
          <button type="button" data-testid="draw-more" onClick={onAgain} className="py-2 text-base font-extrabold text-muted hover:text-heading">{t('create.drawMore')}</button>
        </section>
      </div>
    )
  }

  // Ребёнку, которому плохо, не «дружеская идея для рисунка» и не «нарисуй иначе»: только тёплый ответ без робота.
  if (s === 'support') {
    return <SupportCard testid="work-support" body={work.adult_notified === false ? 'create.supportTextNoAdult' : 'create.supportText'} onBack={onAgain} />
  }

  const title = {
    refused: t('create.refusedTitle'),
    held: t(upload ? 'create.uploadHeldTitle' : 'create.heldTitle'),
    failed: t('create.failedTitle'),
    ready: t('create.failedTitle'),
  }[s as 'refused']
  const body =
    s === 'refused' ? t(hintKey(work.reason_codes)) : s === 'held' ? t(upload ? 'create.uploadHeldText' : 'create.heldText') : t('create.failedText')
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
