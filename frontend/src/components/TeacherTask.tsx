import { useTranslation } from 'react-i18next'
import { loadAssignments, shownTask } from '../features/assignments/assignments'
import { dueLabel } from '../features/assignments/due'
import { useLoad } from '../useLoad'

type Props = { assignmentId?: number | null }

/** Строка задания учителя на «Создать». */
export default function TeacherTask({ assignmentId }: Props) {
  const { t } = useTranslation()
  const [list] = useLoad(loadAssignments)
  // заданный, но не найденный id не подменяем другим заданием; сданное задание из строки уходит
  const a = shownTask(list, assignmentId ?? null)
  if (!a) return null

  const due = dueLabel(a.due_at)
  const leftText = due && t(due.key, { count: due.count })

  return (
    <div
      data-testid="task-strip"
      className="flex min-h-[60px] items-center md:min-h-[56px] gap-3 rounded-card border border-border bg-surface px-3 py-[7px] shadow-card"
    >
      <img src="/art/robot-face.webp" alt="" className="h-10 w-10 shrink-0" />
      <p className="line-clamp-2 min-w-0 flex-1 text-sm font-bold text-heading md:text-base">
        <span className="font-extrabold uppercase text-primary">{t('create.teacherTask')}</span>
        <span aria-hidden="true"> · </span>
        <span data-testid="task-title">{a.title}</span>
        {leftText && <span className="font-semibold text-muted"> · {leftText}</span>}
      </p>
    </div>
  )
}
