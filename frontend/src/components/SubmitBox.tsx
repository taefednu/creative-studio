import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import { outcome, submitErrorCode } from '../features/assignments/assignments'
import type { Assignment, SubmitResult } from '../features/assignments/assignments'
import ErrorText, { errorKey } from './ErrorText'

type Props = {
  workId: number
  assignment: Pick<Assignment, 'id' | 'title'>
  /** Срочный ответ сервера: родитель заменяет экран тёплым ответом, здесь ничего больше не рисуем. */
  onSupport: () => void
  /** Сдано (принято или у учителя на проверке): список заданий пора перечитать. */
  onDone?: () => void
  /** Большая кнопка на экране результата (в сетке карточки) или компактная в «Мои работы». */
  big?: boolean
  /** Экран результата: одна главная кнопка, подпись можно добавить из «Мои работы». */
  main?: boolean
}

/** «Сдать в задание»: необязательная подпись и одна кнопка; повторный клик не шлёт второй запрос. */
export default function SubmitBox({ workId, assignment, onSupport, onDone, big, main }: Props) {
  const { t } = useTranslation()
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [res, setRes] = useState<'accepted' | 'held' | 'rejected' | null>(null)
  const lock = useRef(false)
  const wrap = big ? 'col-span-2 md:col-span-3' : ''

  async function send() {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setErr(null)
    try {
      const r = await api<SubmitResult>(`/api/assignments/${assignment.id}/submit`, 'POST', {
        work_id: workId,
        comment: comment.trim() || null,
      })
      const o = outcome(r)
      if (o === 'support') onSupport()
      else {
        setRes(o)
        if (o !== 'rejected') onDone?.() // не принятая работа задание не закрывает
      }
    } catch (x) {
      setErr(submitErrorCode(errorKey(x)))
      lock.current = false
    } finally {
      setBusy(false)
    }
  }

  if (res) {
    return (
      <p
        data-testid={`submit-${res === 'accepted' ? 'done' : res}`}
        className={`${wrap} rounded-2xl bg-primary-soft px-4 py-3 text-base font-extrabold text-heading`}
      >
        {t({ accepted: 'task.submitDone', held: 'task.submitHeld', rejected: 'task.submitRejected' }[res])}
      </p>
    )
  }
  if (main) {
    return (
      <div data-testid="submit-box" className="flex flex-col gap-1.5">
        <p className="line-clamp-2 text-sm font-bold text-muted">
          {t('task.submitFor')} <span data-testid="submit-title" className="font-extrabold text-heading">{assignment.title}</span>
        </p>
        <ErrorText code={err} />
        <button type="button" data-testid="submit-task" disabled={busy} onClick={() => void send()} className="btn-press h-14 rounded-2xl bg-primary px-4 text-lg font-extrabold text-primary-fg disabled:opacity-60">
          {t('task.submit')}
        </button>
      </div>
    )
  }
  return (
    <div data-testid="submit-box" className={`${wrap} flex flex-col gap-2 rounded-2xl border border-border bg-bg p-3`}>
      <p className="text-sm font-extrabold uppercase text-primary">
        {t('task.submitFor')} <span data-testid="submit-title" className="normal-case text-heading">{assignment.title}</span>
      </p>
      <input
        data-testid="submit-comment"
        value={comment}
        maxLength={200}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t('task.submitComment')}
        aria-label={t('task.submitComment')}
        className="w-full rounded-full border border-border bg-surface px-4 py-3 text-heading outline-none focus:border-primary"
      />
      <ErrorText code={err} />
      <button
        type="button"
        data-testid="submit-task"
        disabled={busy}
        onClick={() => void send()}
        className={`flex items-center justify-center rounded-2xl bg-primary px-4 font-extrabold uppercase text-primary-fg shadow-card disabled:opacity-60 ${
          big ? 'h-[52px] text-base lg:h-[85px] lg:text-[28px]' : 'h-11 text-sm'
        }`}
      >
        {t('task.submit')}
      </button>
    </div>
  )
}
