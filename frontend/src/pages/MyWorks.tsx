import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useOutletContext } from 'react-router-dom'
import { api } from '../api'
import type { ShellContext } from '../components/AppShell'
import Avatar from '../components/Avatar'
import LoadFailed from '../components/LoadFailed'
import ProfileWindow from '../components/ProfileWindow'
import ChipSelect from '../components/ChipSelect'
import Icon from '../components/Icon'
import NavIcon from '../components/NavIcon'
import PublishBox from '../components/PublishBox'
import SubmitBox from '../components/SubmitBox'
import { isOpen, loadAssignments, taskTitle } from '../features/assignments/assignments'
import { loadMyStories } from '../features/story/story'
import type { Story } from '../features/story/story'
import type { Assignment } from '../features/assignments/assignments'
import { createdLabel, createdTime } from '../features/feed/feed'
import { filterWorks, galleryOrder, loadTemplates, artistProgress, BADGES, styleAlbum, withoutHeroSources, withStories } from '../features/works/works'
import type { BadgeId, Work, WorkFilter } from '../features/works/works'
import { useLoad } from '../useLoad'

const loadWorks = () => api<Work[]>('/api/works/mine')
const FILTERS: WorkFilter[] = ['all', 'shared', 'waiting']

export default function MyWorks() {
  const { t } = useTranslation()
  const [works, reloadWorks, worksFailed] = useLoad(loadWorks)
  const [tasks, reloadTasks] = useLoad(loadAssignments)
  const [filter, setFilter] = useState<WorkFilter>('all')
  const open = tasks?.filter(isOpen) ?? []
  const { nick, needsAdult, reloadMe } = useOutletContext<ShellContext>()
  const [tplData] = useLoad(loadTemplates)
  const [stories] = useLoad(loadMyStories)
  const [style, setStyle] = useState<string | null>(null)
  const filtered = works ? filterWorks(withoutHeroSources(works), filter).filter((w) => !style || w.template_id === style) : []
  const [badge, setBadge] = useState<BadgeId | null>(null)
  const [picking, setPicking] = useState(false)
  const shown = galleryOrder(filtered)
  // Сказки в той же сетке; у них нет статуса показа и стиля, поэтому только во «Всех»
  const items = withStories(shown, filter === 'all' && !style ? (stories ?? []).filter((x) => x.status === 'ready') : [])
  const album = styleAlbum(tplData?.templates ?? [], works ?? [])
  const stylesDone = album.filter((a) => a.work).length
  const path = artistProgress(works ?? [], stories?.filter((x) => x.status === 'ready').length ?? 0, stylesDone, album.length)
  return (
    <div>
      {!works?.length && (
        <h1 data-testid="works-title" className="text-3xl font-black leading-10 tracking-tight text-heading md:text-5xl md:leading-[56px]">{t('myWorks.title')}</h1>
      )}
      {!!works?.length && (
        <div data-testid="artist-path" className="relative">
          <section className="relative flex min-h-[132px] items-center overflow-hidden rounded-[28px] bg-primary-soft p-4 pr-[132px] shadow-card md:h-[230px] md:items-start md:p-6">
            <img src="/art/level-banner.webp" alt="" className="absolute inset-y-0 right-0 h-full w-auto max-w-none [mask-image:linear-gradient(to_right,transparent,black_30%)]" />
            <div className="relative flex min-w-0 flex-1 items-center gap-3 md:items-start md:gap-6">
              <div className="relative shrink-0 rounded-full bg-primary p-1">
                <button type="button" data-testid="avatar-change" aria-expanded={picking} aria-label={t('mw.avatarPick')} title={t('mw.avatarPick')} onClick={() => setPicking((x) => !x)} className="block rounded-full">
                  {nick && <Avatar nick={nick} className="h-[60px] w-[60px] md:h-[150px] md:w-[150px]" />}
                </button>
                <span data-testid="artist-level" className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-primary text-sm font-black text-primary-fg md:bottom-1 md:right-1 md:h-11 md:w-11 md:border-4 md:text-xl">{path.level}</span>
              </div>
              <div className="min-w-0 flex-1 md:max-w-[520px]">
                <h1 data-testid="works-title" className="truncate text-xl font-black leading-7 tracking-tight text-heading md:text-[40px] md:leading-[48px]">{nick}</h1>
                <p data-testid="artist-rank" className="truncate text-sm font-extrabold text-primary md:text-xl">
                  {t('mw.level', { n: path.level })}<span className="hidden md:inline"> · {t(`mw.rank.${path.rank}`)}</span>
                </p>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface md:mt-2 md:h-3.5">
                  <div
                    data-testid="artist-bar"
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${path.next ? Math.round(((path.pictures - path.from) / (path.next.need - path.from)) * 100) : 100}%` }}
                  />
                </div>
                <p className="mt-1 truncate text-xs font-bold text-heading md:text-sm">
                  {path.next ? <><span className="md:hidden">{path.pictures} / {path.next.need}</span><span className="hidden md:inline">{t('mw.levelNext', { level: path.level + 1, n: path.pictures, need: path.next.need })}</span></> : t('mw.rankTop')}
                </p>
              </div>
            </div>
          </section>
          <div className="mt-2 flex justify-between gap-1 md:absolute md:bottom-4 md:left-[206px] md:mt-0 md:justify-start md:gap-2">
            {BADGES.map((id) => (
              <button
                key={id}
                type="button"
                data-testid={`badge-${id}`}
                data-earned={path.earned[id]}
                aria-pressed={badge === id}
                aria-label={`${t(`mw.badge.${id}.name`)}${path.earned[id] ? `: ${t('mw.badgeDone')}` : ''}`}
                title={t(`mw.badge.${id}.name`)}
                onClick={() => setBadge(badge === id ? null : id)}
                className={`h-12 w-12 shrink-0 rounded-full transition-transform duration-150 hover:-translate-y-0.5 motion-reduce:transition-none ${badge === id ? 'ring-[3px] ring-primary ring-offset-2 ring-offset-primary-soft' : ''}`}
              >
                <img src={`/art/badges/${id}.webp`} alt="" className={`h-full w-full object-contain ${path.earned[id] ? '' : 'opacity-60 grayscale'}`} />
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-2 flex md:mt-3 md:justify-end">
        {works && works.length > 0 && (
          <div role="group" aria-label={t('mw.filters')} data-testid="works-filters" className="flex w-full gap-1.5 md:ml-auto md:w-auto md:gap-2">
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
      {picking && nick && <ProfileWindow nick={nick} needsAdult={needsAdult} onChanged={reloadMe} onClose={() => setPicking(false)} />}
      {badge && badge !== 'styles' && (
        <p data-testid="badge-note" className="nav-in mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-primary-soft px-4 py-2.5 text-sm font-bold text-heading">
          <span className="font-black">{t(`mw.badge.${badge}.name`)}</span>
          <span className="min-w-0 flex-1">{t(path.earned[badge] ? 'mw.badgeDone' : `mw.badge.${badge}.how`)}</span>
          {!path.earned[badge] && <Link to="/create" data-testid="badge-go" className="font-extrabold text-primary underline">{t('mw.draw')}</Link>}
        </p>
      )}
      {badge === 'styles' && (
        <section data-testid="style-album" aria-label={t('mw.albumLabel')} className="stagger mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
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
        </section>
      )}
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
      {worksFailed && !works && <LoadFailed onRetry={reloadWorks} />}
      <div data-testid="works-grid" className="stagger mt-3 grid grid-flow-dense grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
        {items.map((x, i) =>
          x.story ? (
            <StoryCard key={`s${x.story.id}`} story={x.story} big={i % 7 === 0} />
          ) : (
            <WorkCard
              key={x.work.id}
              w={x.work}
              big={!!x.work.image_url && i % 7 === 0}
              cover={tplData?.templates.find((tpl) => tpl.id === x.work.template_id)?.image_url}
              open={open}
              onSubmitted={reloadTasks}
              onClosed={reloadWorks}
            />
          ),
        )}
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

/** Сказка в общей сетке: обложка, значок книжки и название; открывается как книжка. */
function StoryCard({ story, big }: { story: Story; big: boolean }) {
  const cover = story.pages.find((p) => p.ok)?.image_url
  return (
    <Link to={`/story/${story.id}`} data-testid="my-story" className={`feed-card group relative block overflow-hidden rounded-[22px] bg-primary-soft shadow-card ${big ? 'col-span-2 row-span-2' : ''}`}>
      {cover && <img src={`${cover}?thumb=1`} alt="" className="feed-img aspect-square h-full w-full object-cover group-hover:scale-105" loading="lazy" decoding="async" onLoad={(e) => e.currentTarget.classList.add('feed-img-on')} />}
      <span className="absolute left-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-fg">
        <NavIcon name="tasks" className="h-5 w-5" />
      </span>
      <span className="absolute inset-x-2 bottom-2 truncate rounded-xl bg-surface px-2 py-1 text-center text-xs font-extrabold leading-4 text-heading shadow-card md:text-sm">{story.title}</span>
    </Link>
  )
}

/** Плитка без картинки: робот или текст по статусу. 🔴 support — только тёплый текст, без робота и подсказок. */
function Placeholder({ w, cover }: { w: Work; cover?: string }) {
  const { t } = useTranslation()
  const area = 'relative flex aspect-square items-center justify-center overflow-hidden rounded-[22px] bg-primary-soft p-2 text-center font-extrabold text-heading'
  if (w.status === 'held') {
    // 🔴 Работа ещё не проверена: ни картинки, ни текста ребёнка. Узнаётся по стилю и времени.
    const day = w.created_at ? createdLabel(w.created_at) : ''
    const when = w.created_at ? `${day === 'today' || day === 'yesterday' ? t(`feed.${day}`) : day}, ${createdTime(w.created_at)}` : ''
    return (
      <div data-testid="work-held" className="relative flex aspect-square flex-col items-center gap-1 overflow-hidden rounded-[22px] bg-primary-soft p-2 text-center">
        {cover && <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30 blur-[2px]" />}
        <p className="relative text-xs font-extrabold leading-4 text-heading md:text-sm">{t('mw.showAdult')}</p>
        <img src="/art/shield.webp" alt="" className="relative min-h-0 flex-1 object-contain" />
        <p className="relative w-full rounded-xl bg-surface px-2 py-1 shadow-card">
          <span className="block truncate text-xs font-extrabold leading-4 text-heading md:text-sm">{w.template_id === 'upload' ? t('story.yourDrawing') : t(`templates.${w.template_id}`)}</span>
          <span className="block truncate text-xs font-semibold leading-4 text-muted">{when}</span>
        </p>
      </div>
    )
  }
  return <div className={`${area} text-lg`}>{t(`myWorks.status.${w.status}`)}</div>
}

function WorkCard({ w, big, cover, open, onSubmitted, onClosed }: { w: Work; big: boolean; cover?: string; open: Assignment[]; onSubmitted: () => void; onClosed: () => void }) {
  const { t, i18n } = useTranslation()
  const [support, setSupport] = useState(false)
  const [form, setForm] = useState(false)
  const [modal, setModal] = useState(false)
  // выбранное задание запоминаем: после сдачи оно уходит из открытых, а итог на карточке остаётся
  const [task, setTask] = useState<Pick<Assignment, 'id' | 'title' | 'text_i18n'> | null>(null)
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
  return (
    <div data-testid="work-card" className={`feed-card group relative ${big ? 'col-span-2 row-span-2' : ''}`}>
      {w.status === 'ready' && w.image_url ? (
        <button
          type="button"
          data-testid="work-share"
          aria-label={`${style}: ${t('publish.who')}`}
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
        <Placeholder w={w} cover={cover} />
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
        <div className="modal-bg fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-scrim p-4" onPointerDown={(e) => e.target === e.currentTarget && close()}>
          <div role="dialog" aria-label={t('publish.who')} data-testid="work-modal" className="modal-in my-auto w-full max-w-md rounded-card bg-surface p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-xl font-extrabold text-heading">{t('publish.who')}</h2>
              <button type="button" data-testid="work-modal-close" aria-label={t('mw.close')} onClick={close} className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-heading">
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>
            {w.image_url && <img src={w.image_url} alt={style} className="mb-3 h-[30dvh] w-full rounded-2xl bg-primary-soft object-contain" />}
            <PublishBox noTitle publicOk={w.kind === 'image' || w.kind === 'alive'} workId={w.id} onSupport={() => setSupport(true)} />
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
                        options={open.map((x) => ({ value: String(x.id), label: taskTitle(x, i18n.language) }))}
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
