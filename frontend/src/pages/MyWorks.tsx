import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api } from '../api'
import ChipSelect from '../components/ChipSelect'
import Icon from '../components/Icon'
import PublishBox from '../components/PublishBox'
import SubmitBox from '../components/SubmitBox'
import { isOpen, loadAssignments } from '../features/assignments/assignments'
import type { Assignment } from '../features/assignments/assignments'
import { filterWorks } from '../features/works/works'
import type { Work, WorkFilter } from '../features/works/works'
import { useLoad } from '../useLoad'

const loadWorks = () => api<Work[]>('/api/works/mine')
const loadRejected = () => api<{ id: number; item_type: string; text: string | null }[]>('/api/held/mine')
const FILTERS: WorkFilter[] = ['all', 'shared', 'waiting']

export default function MyWorks() {
  const { t } = useTranslation()
  const [works, reloadWorks] = useLoad(loadWorks)
  const [rejected] = useLoad(loadRejected)
  const [tasks, reloadTasks] = useLoad(loadAssignments)
  const [filter, setFilter] = useState<WorkFilter>('all')
  const open = tasks?.filter(isOpen) ?? []
  const shown = works ? filterWorks(works, filter) : []
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 data-testid="works-title" className="w-fit text-3xl font-extrabold leading-9 text-heading md:text-[54px] md:leading-[50px]">
          {t('myWorks.title')}
        </h1>
        {works && works.length > 0 && (
          <div role="group" aria-label={t('mw.filters')} data-testid="works-filters" className="flex w-full gap-1.5 md:w-auto md:gap-2">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                data-testid={`works-${f}`}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={`h-10 min-w-0 flex-1 rounded-full px-2 text-sm font-extrabold md:h-[42px] md:flex-none md:px-5 2xl:min-w-[123px] 2xl:text-xl ${
                  filter === f ? 'bg-primary text-primary-fg' : 'border border-border bg-surface text-heading'
                }`}
              >
                {t(`mw.${f}`)}
              </button>
            ))}
          </div>
        )}
      </div>
      {rejected?.map((r) => (
        <p key={r.id} data-testid="rejected-note" className="mt-3 flex items-center gap-3 rounded-card border border-border bg-primary-soft px-4 py-3 font-bold text-heading">
          <img src="/art/shield.webp" alt="" className="h-8 w-8 shrink-0 object-contain" />
          {r.text ? t('review.childRejected', { text: r.text }) : t('review.childRejectedNoText')}
        </p>
      ))}
      {works && works.length === 0 && (
        <div data-testid="works-empty" className="mt-6 flex flex-col items-center gap-3 rounded-card border border-border bg-surface p-8 text-center shadow-card">
          <img src="/art/robot-wave.webp" alt="" className="h-36 w-36 object-contain" />
          <p className="text-lg font-extrabold text-heading">{t('myWorks.empty')}</p>
          <Link to="/create" className="flex h-12 items-center gap-2 rounded-full bg-primary px-8 text-base font-extrabold uppercase text-primary-fg">
            <Icon name="wand" className="h-6 w-6" />
            {t('mw.draw')}
          </Link>
        </div>
      )}
      {works && works.length > 0 && shown.length === 0 && (
        <p data-testid="works-none" className="mt-6 text-center font-bold text-muted">
          {t('mw.none')}
        </p>
      )}
      <div data-testid="works-grid" className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
        {shown.map((w) => (
          <WorkCard key={w.id} w={w} open={open} onSubmitted={reloadTasks} onClosed={reloadWorks} />
        ))}
      </div>
    </div>
  )
}

/** Плитка без картинки: робот или текст по статусу. 🔴 support — только тёплый текст, без робота и подсказок. */
function Placeholder({ w }: { w: Work }) {
  const { t } = useTranslation()
  const robot = (src: string) => <img src={src} alt="" className="absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)] object-contain" />
  const area = 'relative flex aspect-[1.72] items-center justify-center overflow-hidden rounded-2xl bg-primary-soft p-2 text-center font-extrabold text-heading'
  if (w.status === 'refused') return <div className={area}>{robot('/art/robot-happy.webp')}</div>
  if (w.status === 'failed') return <div className={area}>{robot('/art/robot-brush.webp')}</div>
  if (w.status === 'held') return <div className={area}>{robot('/art/shield.webp')}</div>
  return <div className={`${area} text-lg`}>{t(`myWorks.status.${w.status}`)}</div>
}

function WorkCard({ w, open, onSubmitted, onClosed }: { w: Work; open: Assignment[]; onSubmitted: () => void; onClosed: () => void }) {
  const { t } = useTranslation()
  const [support, setSupport] = useState(false)
  const [form, setForm] = useState(false)
  const [modal, setModal] = useState(false)
  // выбранное задание запоминаем: после сдачи оно уходит из открытых, а итог на карточке остаётся
  const [task, setTask] = useState<Pick<Assignment, 'id' | 'title'> | null>(null)
  const cur = task ?? open[0]
  useEffect(() => {
    if (!modal) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  })
  function close() {
    setModal(false)
    onClosed()
  }
  // после публикации с тревожным текстом в карточке только тёплый ответ
  if (support) {
    return (
      <div data-testid="work-card" className="overflow-hidden rounded-card border border-border bg-surface p-3 shadow-card">
        <p data-testid="publish-support" className="text-sm font-extrabold text-heading">{t('publish.support')}</p>
      </div>
    )
  }
  const style = t(`templates.${w.template_id}`)
  const chips = [...new Map((w.shared ?? []).map((s) => [`${s.audience}-${s.status}`, s])).values()]
  // подпись под плиткой без картинки: призыв вместо стиля; support и прочее — стиль, как у остальных
  const cta = w.image_url ? null : w.status === 'refused' ? t('mw.retry') : w.status === 'failed' ? t('mw.failed') : w.status === 'held' ? t('mw.showAdult') : null
  return (
    <div data-testid="work-card" className="relative flex flex-col rounded-card border border-border bg-surface p-2 shadow-card">
      {w.image_url ? (
        <img src={w.image_url} alt={style} className="aspect-[1.72] w-full rounded-2xl object-cover" />
      ) : w.status === 'proposed' ? (
        <Link to={`/create?work=${w.id}`} className="contents">
          <Placeholder w={w} />
        </Link>
      ) : (
        <Placeholder w={w} />
      )}
      <div className="flex min-h-[64px] items-end justify-between gap-2 px-1 pb-0.5 pt-1.5">
        <div className="flex min-w-0 flex-col items-start gap-1">
          {cta ? (
            w.status === 'held' ? (
              <span className="text-base font-extrabold leading-5 text-heading 2xl:text-xl">{cta}</span>
            ) : (
              <Link to="/create" className="text-base font-extrabold leading-5 text-heading underline decoration-primary 2xl:text-xl">
                {cta}
              </Link>
            )
          ) : (
            <span className="max-w-full truncate text-base font-extrabold leading-5 text-heading 2xl:text-xl">{style}</span>
          )}
          {chips.map((s) => (
            <span
              key={`${s.audience}-${s.status}`}
              data-testid="work-chip"
              data-status={s.status}
              className={`rounded-full px-3 py-0.5 text-xs font-extrabold 2xl:text-base ${s.status === 'waiting' ? 'bg-primary-soft text-primary' : 'bg-success-soft text-success'}`}
            >
              {s.status === 'waiting' ? t('mw.waitingAdult') : t(s.audience === 'family' ? 'mw.inFamily' : 'mw.inClass')}
            </span>
          ))}
        </div>
        {w.status === 'ready' && (
          <button
            type="button"
            data-testid="work-share"
            aria-label={t('mw.share')}
            onClick={() => setModal(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-primary shadow-card 2xl:h-11 2xl:w-11"
          >
            <Icon name="share" className="h-5 w-5" />
          </button>
        )}
      </div>
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-scrim p-4">
          <div role="dialog" aria-label={t('mw.share')} data-testid="work-modal" className="my-auto w-full max-w-md rounded-card bg-surface p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-xl font-extrabold text-heading">{t('mw.share')}</h2>
              <button type="button" data-testid="work-modal-close" aria-label={t('mw.close')} onClick={close} className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-heading">
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>
            {w.image_url && <img src={w.image_url} alt={style} className="mb-3 aspect-[1.72] w-full rounded-2xl object-cover" />}
            <PublishBox workId={w.id} onSupport={() => setSupport(true)} />
            {cur && (
              <div className="mt-2 flex flex-col gap-2">
                <button
                  type="button"
                  data-testid="submit-from-works"
                  aria-expanded={form}
                  onClick={() => {
                    setForm((o) => !o)
                    setTask((x) => x ?? open[0] ?? null)
                  }}
                  className="h-11 w-full rounded-full border border-primary bg-surface px-4 text-sm font-extrabold uppercase text-primary"
                >
                  {t('task.submit')}
                </button>
                {form && (
                  <>
                    {open.length > 1 && (
                      <ChipSelect
                        testid="submit-pick"
                        label={t('task.pick')}
                        value={String(cur.id)}
                        onChange={(v) => setTask(open.find((x) => x.id === Number(v)) ?? null)}
                        options={open.map((x) => ({ value: String(x.id), label: x.title }))}
                      />
                    )}
                    <SubmitBox key={cur.id} workId={w.id} assignment={cur} onSupport={() => setSupport(true)} onDone={onSubmitted} />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
