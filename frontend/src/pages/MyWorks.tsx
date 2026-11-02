import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useOutletContext } from 'react-router-dom'
import { api } from '../api'
import type { ShellContext } from '../components/AppShell'
import Avatar from '../components/Avatar'
import ChipSelect from '../components/ChipSelect'
import Icon from '../components/Icon'
import PublishBox from '../components/PublishBox'
import SubmitBox from '../components/SubmitBox'
import { isOpen, loadAssignments } from '../features/assignments/assignments'
import { loadMyStories } from '../features/story/story'
import type { Assignment } from '../features/assignments/assignments'
import { filterWorks, galleryOrder, loadTemplates, styleAlbum } from '../features/works/works'
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
  const { nick } = useOutletContext<ShellContext>()
  const [tplData] = useLoad(loadTemplates)
  const [stories] = useLoad(loadMyStories)
  const [style, setStyle] = useState<string | null>(null)
  const filtered = works ? filterWorks(works, filter).filter((w) => !style || w.template_id === style) : []
  const shown = galleryOrder(filtered)
  const album = styleAlbum(tplData?.templates ?? [], works ?? [])
  const ready = works?.filter((w) => w.image_url).length ?? 0
  const published = works?.filter((w) => (w.shared ?? []).some((x) => x.status === 'published')).length ?? 0
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {nick && <Avatar nick={nick} className="h-14 w-14 shrink-0 lg:h-[72px] lg:w-[72px]" />}
          <div className="min-w-0">
            <h1 data-testid="works-title" className="w-fit text-3xl font-extrabold leading-9 text-heading md:text-4xl md:leading-10">
              {nick ? t('mw.gallery', { nick, interpolation: { escapeValue: false } }) : t('myWorks.title')}
            </h1>
            {!!works?.length && <p data-testid="works-counts" className="text-sm font-bold text-muted">{t('mw.counts', { n: ready, s: published })}</p>}
          </div>
        </div>
        {works && works.length > 0 && (
          <div role="group" aria-label={t('mw.filters')} data-testid="works-filters" className="flex w-full gap-1.5 md:w-auto md:gap-2">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                data-testid={`works-${f}`}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={`h-10 min-w-0 flex-1 rounded-full px-2 text-sm font-extrabold md:h-[42px] md:flex-none md:px-5 big:min-w-[123px] big:text-xl ${
                  filter === f ? 'bg-primary-soft text-primary' : 'text-heading hover:bg-primary-soft'
                }`}
              >
                {t(`mw.${f}`)}
              </button>
            ))}
          </div>
        )}
      </div>
      {!!works?.length && album.length > 0 && (
        <section data-testid="style-album" aria-label={t('mw.albumLabel')} className="mt-3">
          <p className="text-sm font-extrabold text-heading">
            {t('mw.album', { n: album.filter((a) => a.work).length, total: album.length })}
          </p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {album.map(({ tpl, work }) =>
              work ? (
                <button
                  key={tpl.id}
                  type="button"
                  data-testid={`album-${tpl.id}`}
                  aria-pressed={style === tpl.id}
                  aria-label={t(`templates.${tpl.id}`)}
                  title={t(`templates.${tpl.id}`)}
                  onClick={() => setStyle(style === tpl.id ? null : tpl.id)}
                  className={`h-16 w-16 shrink-0 overflow-hidden rounded-2xl transition-transform duration-150 hover:-translate-y-0.5 motion-reduce:transition-none ${style === tpl.id ? 'ring-4 ring-primary ring-inset' : ''}`}
                >
                  <img src={`${work.image_url}?thumb=1`} alt="" className="h-full w-full object-cover" />
                </button>
              ) : (
                <Link
                  key={tpl.id}
                  to={`/create?template=${tpl.id}`}
                  data-testid={`album-${tpl.id}`}
                  aria-label={t(`templates.${tpl.id}`)}
                  title={t('mw.albumEmpty', { style: t(`templates.${tpl.id}`), interpolation: { escapeValue: false } })}
                  className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border-2 border-dashed border-border transition-transform duration-150 hover:-translate-y-0.5 motion-reduce:transition-none"
                >
                  <img src={tpl.image_url} alt="" className="h-full w-full object-cover opacity-50 grayscale" />
                </Link>
              ),
            )}
          </div>
        </section>
      )}
      {!!stories?.filter((x) => x.status === 'ready').length && (
        <section data-testid="my-stories" aria-label={t('story.mine')} className="mt-3">
          <p className="text-sm font-extrabold text-heading">{t('story.mine')}</p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {stories.filter((x) => x.status === 'ready').map((x) => (
              <Link key={x.id} to={`/story/${x.id}`} data-testid="my-story" className="w-40 shrink-0 overflow-hidden rounded-2xl bg-surface shadow-card transition-transform duration-150 hover:-translate-y-0.5 motion-reduce:transition-none">
                <img src={`${x.pages[0]?.image_url}?thumb=1`} alt="" className="aspect-[4/3] w-full object-cover" />
                <p className="truncate px-2 py-1.5 text-sm font-extrabold text-heading">{x.title}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
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
      <div data-testid="works-grid" className="mt-3 grid grid-flow-dense grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
        {shown.map((w, i) => (
          <WorkCard
            key={w.id}
            w={w}
            big={!!w.image_url && i % 7 === 0}
            open={open}
            onSubmitted={reloadTasks}
            onClosed={reloadWorks}
          />
        ))}
        {!!works?.length && filter === 'all' && !style && (
          <Link
            to="/create"
            data-testid="works-add"
            aria-label={t('mw.draw')}
            className="feed-card flex aspect-square flex-col items-center justify-center gap-1 rounded-[22px] border-2 border-dashed border-primary bg-surface text-sm font-extrabold text-primary transition-transform duration-150 hover:-translate-y-0.5 motion-reduce:transition-none"
          >
            <Icon name="plus" className="h-8 w-8" />
            {t('mw.draw')}
          </Link>
        )}
      </div>
    </div>
  )
}

/** Плитка без картинки: робот или текст по статусу. 🔴 support — только тёплый текст, без робота и подсказок. */
function Placeholder({ w }: { w: Work }) {
  const { t } = useTranslation()
  const robot = (src: string) => <img src={src} alt="" className="absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)] object-contain" />
  const area = 'relative flex aspect-square items-center justify-center overflow-hidden rounded-[22px] bg-primary-soft p-2 text-center font-extrabold text-heading'
  if (w.status === 'refused') return <div className={area}>{robot('/art/robot-happy.webp')}</div>
  if (w.status === 'failed') return <div className={area}>{robot('/art/robot-brush.webp')}</div>
  if (w.status === 'held') return <div className={area}>{robot('/art/shield.webp')}</div>
  return <div className={`${area} text-lg`}>{t(`myWorks.status.${w.status}`)}</div>
}

function WorkCard({ w, big, open, onSubmitted, onClosed }: { w: Work; big: boolean; open: Assignment[]; onSubmitted: () => void; onClosed: () => void }) {
  const { t } = useTranslation()
  const [support, setSupport] = useState(false)
  const [form, setForm] = useState(false)
  const [modal, setModal] = useState(false)
  // выбранное задание запоминаем: после сдачи оно уходит из открытых, а итог на карточке остаётся
  const [task, setTask] = useState<Pick<Assignment, 'id' | 'title'> | null>(null)
  const [sentTo, setSentTo] = useState<number | null>(null)
  // задания, которого уже нет среди открытых, не держим (иначе 404 на сдаче); только что сданное оставляем ради итога
  const cur = task && (task.id === sentTo || open.some((x) => x.id === task.id)) ? task : open[0]
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
      <div data-testid="work-card" className="col-span-2 overflow-hidden rounded-[22px] border border-border bg-surface p-3 shadow-card">
        <p data-testid="publish-support" className="text-sm font-extrabold text-heading">{t('publish.support')}</p>
      </div>
    )
  }
  const style = t(`templates.${w.template_id}`)
  const chips = [...new Map((w.shared ?? []).map((s) => [`${s.audience}-${s.status}`, s])).values()]
  // подпись под плиткой без картинки: призыв вместо стиля; support и прочее — стиль, как у остальных
  const cta = w.image_url ? null : w.status === 'refused' ? t('mw.retry') : w.status === 'failed' ? t('mw.failed') : w.status === 'held' ? t('mw.showAdult') : null
  return (
    <div data-testid="work-card" className={`feed-card group relative ${big ? 'col-span-2 row-span-2' : ''}`}>
      {w.status === 'ready' && w.image_url ? (
        <button
          type="button"
          data-testid="work-share"
          aria-label={`${style}: ${t('mw.share')}`}
          onClick={() => setModal(true)}
          className="block aspect-square w-full overflow-hidden rounded-[22px] bg-primary-soft shadow-card"
        >
          <img src={`${w.image_url}?thumb=1`} alt={style} className="feed-img h-full w-full object-cover group-hover:scale-105" loading="lazy" decoding="async" onLoad={(e) => e.currentTarget.classList.add('feed-img-on')} />
        </button>
      ) : w.status === 'proposed' ? (
        <Link to={`/create?work=${w.id}`} className="contents">
          <Placeholder w={w} />
        </Link>
      ) : (
        <Placeholder w={w} />
      )}
      {cta && (
        <div className="pointer-events-none absolute inset-x-2 bottom-2 rounded-xl bg-surface px-2 py-1 text-center text-xs font-extrabold leading-4 text-heading shadow-card">
          {w.status === 'held' ? cta : <Link to="/create" className="pointer-events-auto underline decoration-primary">{cta}</Link>}
        </div>
      )}
      <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1">
        {chips.map((s) => (
          <span
            key={`${s.audience}-${s.status}`}
            data-testid="work-chip"
            data-status={s.status}
            className={`rounded-full px-2 py-0.5 text-xs font-extrabold shadow-card ${s.status === 'waiting' ? 'bg-primary-soft text-primary' : 'bg-success-soft text-success'}`}
          >
            {s.status === 'waiting' ? t('mw.waitingAdult') : t(s.audience === 'family' ? 'mw.inFamily' : 'mw.inClass')}
          </span>
        ))}
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
            {w.image_url && <img src={w.image_url} alt={style} className="mb-3 aspect-square max-h-[50dvh] w-full rounded-2xl object-cover" />}
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
                    <SubmitBox key={cur.id} workId={w.id} assignment={cur} onSupport={() => setSupport(true)} onDone={() => {
                      setSentTo(cur.id)
                      onSubmitted()
                    }} />
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
