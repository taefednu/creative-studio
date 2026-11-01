import { useTranslation } from 'react-i18next'
import { Link, useOutletContext } from 'react-router-dom'
import type { ShellContext } from '../components/AppShell'
import { isOpen, loadAssignments } from '../features/assignments/assignments'
import type { Assignment } from '../features/assignments/assignments'
import { dueLabel } from '../features/assignments/due'
import { loadMine } from '../features/works/works'
import { useLoad } from '../useLoad'

/** Вкладка «Задания»: открытые и сданные задания класса. Показываем только то, что отдал сервер. */
export default function Tasks() {
  const { t } = useTranslation()
  const { cls, ready } = useOutletContext<ShellContext>()
  const [list] = useLoad(loadAssignments)
  const [works] = useLoad(loadMine)
  if (!ready) return null
  return (
    <div>
      <h1 data-testid="tasks-title" className="w-fit text-3xl font-extrabold leading-9 text-heading md:text-[44px] md:leading-[42px]">
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
      <div data-testid="tasks-grid" className="mt-4 grid gap-4 md:mt-6 md:grid-cols-2 lg:grid-cols-3">
        {cls && list?.map((a) => <TaskCard key={a.id} a={a} imgs={new Map(works?.map((w) => [w.id, w.image_url]))} />)}
      </div>
    </div>
  )
}

function TaskCard({ a, imgs }: { a: Assignment; imgs: Map<number, string | null> }) {
  const { t } = useTranslation()
  const due = dueLabel(a.due_at)
  const sent = a.submissions.filter((s) => s.status !== 'rejected')
  return (
    <article data-testid="task-card" className="flex min-h-[250px] flex-col rounded-card border border-border bg-surface p-4 shadow-card">
      <h2 className="line-clamp-1 text-xl font-extrabold leading-7 text-heading">{a.title}</h2>
      {a.description && <p className="mt-1 line-clamp-2 text-base leading-6 text-text">{a.description}</p>}
      {due && (
        <p data-testid="task-left" className="mt-2 text-sm font-extrabold text-primary">
          {t(due.key, { count: due.count })}
        </p>
      )}
      {sent.length > 0 && (
        <div data-testid="task-sent" className="mt-2 flex items-center gap-2">
          {sent.map((s) => {
            const src = imgs.get(s.work_id)
            return src ? (
              <img key={s.work_id} src={src} alt="" title={t(s.status === 'held' ? 'task.heldMark' : 'task.sentMark')} className="h-12 w-12 rounded-xl border border-border object-cover" />
            ) : null
          })}
          <span className="text-sm font-bold text-muted">{t(sent.some((s) => s.status === 'accepted') ? 'task.sentMark' : 'task.heldMark')}</span>
        </div>
      )}
      {isOpen(a) && (
        <Link
          to={`/create?assignment=${a.id}`}
          data-testid="task-draw"
          className="mt-auto flex h-[45px] items-center justify-center rounded-full bg-primary text-base font-extrabold uppercase text-primary-fg shadow-card"
        >
          {t('task.draw')}
        </Link>
      )}
    </article>
  )
}
