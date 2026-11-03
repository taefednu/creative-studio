import { useTranslation } from 'react-i18next'
import { Link, useOutletContext } from 'react-router-dom'
import ErrorText from '../components/ErrorText'
import Icon from '../components/Icon'
import type { ShellContext } from '../components/AppShell'
import { isOpen, loadAssignments, taskDescription, taskTitle, visibleSent } from '../features/assignments/assignments'
import type { Assignment } from '../features/assignments/assignments'
import { dueLabel } from '../features/assignments/due'
import { useLoad } from '../useLoad'

/** Вкладка «Задания»: открытые и сданные задания класса. Показываем только то, что отдал сервер. */
export default function Tasks() {
  const { t } = useTranslation()
  const { cls, ready } = useOutletContext<ShellContext>()
  const [list, reload, failed] = useLoad(loadAssignments)
  if (!ready) return null
  const open = list?.filter(isOpen).length ?? 0
  return (
    <div>
      <h1 data-testid="tasks-title" className="w-fit text-3xl font-extrabold leading-9 text-heading md:text-4xl md:leading-10">
        {t('nav.tasks')}
      </h1>
      {!cls && (
        <p data-testid="tasks-no-class" className="mt-4 rounded-card border border-border bg-primary-soft p-4 font-bold text-heading">
          {t('task.noClass')}
        </p>
      )}
      {cls && failed && !list && (
        <div data-testid="tasks-load-error" className="mt-4 flex flex-col items-start gap-2">
          <ErrorText code="generic" />
          <button type="button" data-testid="tasks-retry" onClick={reload} className="h-10 rounded-full bg-primary px-6 font-extrabold text-primary-fg">
            {t('create.retry')}
          </button>
        </div>
      )}
      {cls && list && list.length === 0 && (
        <p data-testid="tasks-empty" className="mt-4 text-text">
          {t('task.empty')}
        </p>
      )}
      {cls && list && list.length > 0 && (
        <div data-testid="tasks-hero" className="relative mt-3 flex min-h-[88px] items-center gap-3 rounded-card border border-border bg-surface pl-2 pr-4 shadow-card md:mt-3 md:h-[72px] md:gap-3">
          <img src="/art/robot-wave.webp" alt="" className="h-[84px] w-[84px] shrink-0 object-contain md:h-[68px] md:w-[68px]" />
          <p className="text-lg font-extrabold leading-6 text-heading md:text-2xl md:leading-8">
            {open > 0 ? t('tp.hero', { count: open }) : t('tp.allDone')}
          </p>
        </div>
      )}
      <div data-testid="tasks-grid" className="mt-4 grid items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cls && list?.map((a) => <TaskCard key={a.id} a={a} />)}
      </div>
    </div>
  )
}

function TaskCard({ a }: { a: Assignment }) {
  const { t, i18n } = useTranslation()
  const description = taskDescription(a, i18n.language)
  const due = dueLabel(a.due_at)
  const sent = visibleSent(a) // срочная сдача здесь как будто её нет: ни «на проверке», ни «отправили учителю»
  const done = sent.some((s) => s.status === 'accepted')
  const img = sent.length ? `/api/works/${sent[0].work_id}/image` : a.cover_url
  return (
    <article data-testid="task-card" className="flex flex-col rounded-card border border-border bg-surface p-3 shadow-card">
      <div className="aspect-[1.8] short:aspect-[2.4] overflow-hidden rounded-2xl bg-primary-soft">
        {img && <img data-testid="task-image" src={img} alt="" className="h-full w-full object-cover" />}
      </div>
      <h2 className="mt-3 px-1 text-xl font-extrabold leading-7 text-heading big:text-[28px] big:leading-9">{taskTitle(a, i18n.language)}</h2>
      {description && <p className="mt-1 px-1 text-base leading-6 text-text big:text-[22px] big:leading-7">{description}</p>}
      {due && sent.length === 0 && (
        <p data-testid="task-left" className="mt-3 flex h-10 w-fit items-center gap-2 rounded-full bg-primary-soft px-4 text-sm font-extrabold text-primary big:h-[46px] big:text-xl">
          <Icon name="clock" className="h-5 w-5 big:h-7 big:w-7" />
          {t(due.key, { count: due.count })}
        </p>
      )}
      {sent.length > 0 && (
        <div data-testid="task-sent" className="mt-3 flex flex-col gap-3">
          <p
            className={`flex h-10 w-fit items-center gap-2 rounded-full px-4 text-sm font-extrabold big:h-[46px] big:text-xl ${done ? 'bg-success-soft text-success' : 'bg-primary-soft text-primary'}`}
          >
            <Icon name={done ? 'check' : 'clock'} className="h-5 w-5 big:h-7 big:w-7" />
            {t(done ? 'tp.handed' : 'tp.review')}
          </p>
          <div className="flex gap-2">
            {sent.map((s, i) => (
              <img
                key={s.work_id}
                src={`/api/works/${s.work_id}/image`}
                alt=""
                title={t(s.status === 'held' ? 'task.heldMark' : 'task.sentMark')}
                className={`h-14 w-14 rounded-xl border-2 border-surface object-cover shadow-card big:h-[84px] big:w-[84px] ${i % 2 ? 'rotate-3' : '-rotate-3'}`}
              />
            ))}
          </div>
        </div>
      )}
      <div className="min-h-3 flex-1" />
      {isOpen(a) && (
        <Link
          to={`/create?assignment=${a.id}${a.cover_template ? `&template=${a.cover_template}` : ''}`}
          data-testid="task-draw"
          className="mx-3 mb-1 flex h-[52px] items-center justify-center gap-3 rounded-full bg-primary text-lg font-extrabold uppercase text-primary-fg big:h-[75px] big:text-[28px]"
        >
          <Icon name="wand" className="h-7 w-7 big:h-10 big:w-10" />
          {t('task.draw')}
        </Link>
      )}
    </article>
  )
}
