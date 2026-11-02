import { useTranslation } from 'react-i18next'
import { Link, useOutletContext } from 'react-router-dom'
import Icon from '../components/Icon'
import type { ShellContext } from '../components/AppShell'
import { isOpen, loadAssignments } from '../features/assignments/assignments'
import type { Assignment } from '../features/assignments/assignments'
import { sampleFor } from '../features/assignments/calendar'
import { dueLabel } from '../features/assignments/due'
import { loadTemplates } from '../features/works/works'
import { useLoad } from '../useLoad'

/** Вкладка «Задания»: открытые и сданные задания класса. Показываем только то, что отдал сервер. */
export default function Tasks() {
  const { t } = useTranslation()
  const { cls, ready } = useOutletContext<ShellContext>()
  const [list] = useLoad(loadAssignments)
  const [tpl] = useLoad(loadTemplates)
  if (!ready) return null
  const open = list?.filter(isOpen).length ?? 0
  return (
    <div>
      <h1 data-testid="tasks-title" className="w-fit text-3xl font-extrabold leading-9 text-heading md:text-[54px] md:leading-[50px]">
        {t('nav.tasks')}
      </h1>
      {!cls && (
        <p data-testid="tasks-no-class" className="mt-4 rounded-card border border-border bg-primary-soft p-4 font-bold text-heading">
          {t('task.noClass')}
        </p>
      )}
      {cls && list && list.length === 0 && (
        <p data-testid="tasks-empty" className="mt-4 text-text">
          {t('task.empty')}
        </p>
      )}
      {cls && list && list.length > 0 && (
        <div data-testid="tasks-hero" className="relative mt-3 flex min-h-[88px] items-center gap-3 rounded-card border border-border bg-surface pl-2 pr-4 shadow-card md:mt-4 md:h-[127px] md:gap-5">
          <img src="/art/robot-wave.webp" alt="" className="h-[84px] w-[84px] shrink-0 object-contain md:h-[124px] md:w-[124px]" />
          <p className="text-lg font-extrabold leading-6 text-heading md:text-[40px] md:leading-[44px]">
            {open > 0 ? t('tp.hero', { count: open }) : t('tp.allDone')}
          </p>
        </div>
      )}
      <div data-testid="tasks-grid" className="mt-4 grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cls && list?.map((a) => <TaskCard key={a.id} a={a} sample={sampleFor(a.id, tpl?.templates ?? [])} />)}
      </div>
    </div>
  )
}

function TaskCard({ a, sample }: { a: Assignment; sample: string | null }) {
  const { t } = useTranslation()
  const due = dueLabel(a.due_at)
  const sent = a.submissions.filter((s) => s.status !== 'rejected')
  const done = sent.some((s) => s.status === 'accepted')
  const img = sent.length ? `/api/works/${sent[0].work_id}/image` : sample
  return (
    <article data-testid="task-card" className="flex flex-col rounded-card border border-border bg-surface p-3 shadow-card">
      <div className="aspect-[1.8] overflow-hidden rounded-2xl bg-primary-soft">
        {img && <img data-testid="task-image" src={img} alt="" className="h-full w-full object-cover" />}
      </div>
      <h2 className="mt-3 px-1 text-xl font-extrabold leading-7 text-heading 2xl:text-[28px] 2xl:leading-9">{a.title}</h2>
      {a.description && <p className="mt-1 px-1 text-base leading-6 text-text 2xl:text-[22px] 2xl:leading-7">{a.description}</p>}
      {due && sent.length === 0 && (
        <p data-testid="task-left" className="mt-3 flex h-10 w-fit items-center gap-2 rounded-full bg-primary-soft px-4 text-sm font-extrabold text-primary 2xl:h-[46px] 2xl:text-xl">
          <Icon name="clock" className="h-5 w-5 2xl:h-7 2xl:w-7" />
          {t(due.key, { count: due.count })}
        </p>
      )}
      {sent.length > 0 && (
        <div data-testid="task-sent" className="mt-3 flex flex-col gap-3">
          <p
            className={`flex h-10 w-fit items-center gap-2 rounded-full px-4 text-sm font-extrabold 2xl:h-[46px] 2xl:text-xl ${done ? 'bg-success-soft text-success' : 'bg-primary-soft text-primary'}`}
          >
            <Icon name={done ? 'check' : 'clock'} className="h-5 w-5 2xl:h-7 2xl:w-7" />
            {t(done ? 'tp.handed' : 'tp.review')}
          </p>
          <div className="flex gap-2">
            {sent.map((s, i) => (
              <img
                key={s.work_id}
                src={`/api/works/${s.work_id}/image`}
                alt=""
                title={t(s.status === 'held' ? 'task.heldMark' : 'task.sentMark')}
                className={`h-14 w-14 rounded-xl border-2 border-surface object-cover shadow-card 2xl:h-[84px] 2xl:w-[84px] ${i % 2 ? 'rotate-3' : '-rotate-3'}`}
              />
            ))}
          </div>
        </div>
      )}
      <div className="min-h-3 flex-1" />
      {isOpen(a) && (
        <Link
          to={`/create?assignment=${a.id}`}
          data-testid="task-draw"
          className="mx-3 mb-1 flex h-[52px] items-center justify-center gap-3 rounded-full bg-primary text-lg font-extrabold uppercase text-primary-fg 2xl:h-[75px] 2xl:text-[28px]"
        >
          <Icon name="wand" className="h-7 w-7 2xl:h-10 2xl:w-10" />
          {t('task.draw')}
        </Link>
      )}
    </article>
  )
}
