import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import Avatar from '../components/Avatar'
import CabinetHeader from '../components/CabinetHeader'
import ChipSelect from '../components/ChipSelect'
import ErrorText, { errorKey } from '../components/ErrorText'
import { dueIso, showErrorCode, taskErrorCode } from '../features/assignments/assignments'
import { dueLabel } from '../features/assignments/due'
import { LANGS } from '../i18n'
import { useLoad } from '../useLoad'

type Room = { id: number; name: string }
type Task = { id: number; title: string; description: string; due_at: string | null; submissions: number }
type Sub = { id: number; nick: string; status: 'accepted' | 'held'; shown_in_feed: boolean; image_url: string; comment: string | null }

const loadRooms = () => api<Room[]>('/api/teacher/classes')
const field = 'w-full rounded-2xl border border-border bg-bg px-4 text-heading outline-none focus:border-primary'

/** Задания учителя (#13): создать, список класса со счётчиком сдач, галерея сдач и «показать в ленте класса». */
export default function TeacherTasks() {
  const { t, i18n } = useTranslation()
  const [rooms] = useLoad(loadRooms)
  const [picked, setPicked] = useState<number | null>(null)
  const classId = picked ?? rooms?.[0]?.id ?? null
  const [tasks, setTasks] = useState<{ cls: number; items: Task[] } | null>(null)
  const [tick, setTick] = useState(0)
  const [open, setOpen] = useState<Task | null>(null)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [due, setDue] = useState('')
  const [lang, setLang] = useState<string>(LANGS.includes(i18n.language as never) ? i18n.language : 'ru')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const lock = useRef(false)

  useEffect(() => {
    if (classId === null) return
    let alive = true
    api<Task[]>(`/api/teacher/classes/${classId}/assignments`)
      .then((items) => alive && setTasks({ cls: classId, items }))
      .catch(() => alive && setTasks({ cls: classId, items: [] }))
    return () => {
      alive = false
    }
  }, [classId, tick])
  const items = tasks?.cls === classId ? tasks.items : null

  async function create(e: FormEvent) {
    e.preventDefault()
    if (classId === null || !title.trim() || lock.current) return
    lock.current = true
    setBusy(true)
    setErr(null)
    try {
      await api(`/api/teacher/classes/${classId}/assignments`, 'POST', {
        title: title.trim(),
        description: desc.trim(),
        due_at: dueIso(due),
        lang,
      })
      setTitle('')
      setDesc('')
      setDue('')
      setTick((n) => n + 1)
    } catch (x) {
      setErr(taskErrorCode(errorKey(x)))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg pb-24 lg:pb-6">
      <CabinetHeader role="teacher" />
      <main className="px-4 py-4 md:px-9">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
          <h1 data-testid="page-title" className="w-fit text-[30px] font-extrabold leading-9 text-heading lg:text-[54px] lg:leading-[50px]">
            {t('cab.tasks.title')}
          </h1>
          {rooms && rooms.length > 0 && (
            <ChipSelect
              testid="task-class"
              label={t('cab.tasks.class')}
              value={String(classId)}
              onChange={(v) => {
                setPicked(Number(v))
                setOpen(null)
              }}
              options={rooms.map((r) => ({ value: String(r.id), label: r.name }))}
              className="h-11 w-full lg:h-[55px] lg:w-[213px]"
            />
          )}
        </div>
        {rooms && rooms.length === 0 && (
          <p data-testid="tasks-empty" className="mt-3 text-muted">
            {t('cab.tasks.noClasses')}
          </p>
        )}
        {classId !== null && (
          <form
            onSubmit={(e) => void create(e)}
            data-testid="task-form"
            className="mt-4 grid gap-3 rounded-card border border-border bg-surface p-4 shadow-card lg:mt-[18px] lg:grid-cols-[1fr_230px_120px] lg:p-5"
          >
            <input
              data-testid="task-title"
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('cab.tasks.titlePh')}
              aria-label={t('cab.tasks.titlePh')}
              className={`${field} h-12`}
            />
            <div className="grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-[230px_120px]">
              <label className="relative block">
                <span className="pointer-events-none absolute left-4 top-1 text-[10px] font-extrabold uppercase text-muted">{t('cab.tasks.due')}</span>
                <input data-testid="task-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${field} h-12 pb-0 pt-4 text-sm`} />
              </label>
              <ChipSelect
                testid="task-lang"
                label={t('cab.tasks.lang')}
                value={lang}
                onChange={setLang}
                options={LANGS.map((l) => ({ value: l, label: `${t('cab.tasks.lang')}: ${l.toUpperCase()}` }))}
                className="h-12"
              />
            </div>
            <div className="grid gap-3 lg:col-span-3 lg:grid-cols-[1fr_190px]">
              <textarea
                data-testid="task-description"
                value={desc}
                maxLength={1000}
                onChange={(e) => setDesc(e.target.value)}
                placeholder={t('cab.tasks.descPh')}
                aria-label={t('cab.tasks.descPh')}
                className={`${field} h-[76px] resize-none py-3`}
              />
              <button
                type="submit"
                data-testid="task-create"
                disabled={busy || !title.trim()}
                className="h-[52px] rounded-2xl bg-primary px-4 text-lg font-extrabold uppercase text-primary-fg shadow-card disabled:opacity-60 lg:h-[76px]"
              >
                {t('cab.tasks.create')}
              </button>
            </div>
            <div className="lg:col-span-3 empty:hidden">
              <ErrorText code={err} />
            </div>
          </form>
        )}
        {items && items.length === 0 && (
          <p data-testid="tasks-none" className="mt-4 text-muted">
            {t('cab.tasks.none')}
          </p>
        )}
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items?.map((a) => {
            const left = dueLabel(a.due_at)
            return (
              <button
                key={a.id}
                type="button"
                data-testid="assignment-card"
                aria-pressed={open?.id === a.id}
                onClick={() => setOpen(open?.id === a.id ? null : a)}
                className={`flex min-h-[150px] flex-col rounded-card border bg-surface p-4 text-left shadow-card ${open?.id === a.id ? 'border-primary' : 'border-border'}`}
              >
                <span className="line-clamp-1 text-xl font-extrabold leading-7 text-heading">{a.title}</span>
                {a.description && <span className="mt-1 line-clamp-2 text-base leading-6 text-text">{a.description}</span>}
                <span className="mt-auto flex items-center justify-between gap-2 pt-2 text-sm font-extrabold">
                  <span className="text-primary">{left ? t(left.key, { count: left.count }) : t('cab.tasks.noDue')}</span>
                  <span data-testid="assignment-count" className="rounded-full bg-primary-soft px-3 py-1 text-heading">
                    {t('cab.tasks.count', { count: a.submissions })}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
        {open && <Submissions key={open.id} task={open} onShown={() => setTick((n) => n + 1)} />}
      </main>
    </div>
  )
}

/** Галерея сдач одного задания. Что на проверке — с пометкой; «в ленту» только принятое. */
function Submissions({ task, onShown }: { task: Task; onShown: () => void }) {
  const { t } = useTranslation()
  const [subs, setSubs] = useState<Sub[] | null>(null)
  const [err, setErr] = useState<{ id: number; code: string } | null>(null)
  const [note, setNote] = useState<number | null>(null)
  const load = useCallback(
    () => api<Sub[]>(`/api/teacher/assignments/${task.id}/submissions`).then(setSubs).catch(() => setSubs([])),
    [task.id],
  )
  useEffect(() => {
    void load()
  }, [load])

  async function show(s: Sub) {
    setErr(null)
    try {
      const r = await api<{ shown_in_feed: boolean }>(`/api/teacher/submissions/${s.id}/show-in-feed`, 'POST')
      // false — пост задержан проверкой и ещё никому не виден: говорим как есть
      setNote(r.shown_in_feed ? null : s.id)
      await load()
      onShown()
    } catch (x) {
      setErr({ id: s.id, code: showErrorCode(errorKey(x)) })
    }
  }

  return (
    <section data-testid="submissions" className="mt-6">
      <h2 className="text-2xl font-extrabold text-heading">{t('cab.tasks.subsTitle', { title: task.title })}</h2>
      {subs && subs.length === 0 && (
        <p data-testid="submissions-empty" className="mt-2 text-muted">
          {t('cab.tasks.subsEmpty')}
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
        {subs?.map((s) => (
          <figure key={s.id} data-testid="submission" className="flex flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card">
            <img src={s.image_url} alt={s.nick} className="aspect-square w-full object-cover" loading="lazy" />
            <figcaption className="flex flex-col gap-2 p-3">
              <span className="flex items-center gap-2 text-sm font-extrabold text-heading">
                <Avatar nick={s.nick} className="h-8 w-8" />
                <span className="min-w-0 truncate">{s.nick}</span>
              </span>
              {s.comment && <span className="text-sm text-text">{s.comment}</span>}
              {s.status === 'held' ? (
                <span data-testid="sub-held" className="rounded-xl bg-primary-soft px-2 py-1 text-xs font-extrabold text-heading">
                  {t('cab.tasks.held')}
                </span>
              ) : s.shown_in_feed ? (
                <span data-testid="sub-shown" className="rounded-xl bg-success-soft px-2 py-1 text-xs font-extrabold text-success">
                  {t('cab.tasks.shown')}
                </span>
              ) : (
                <button
                  type="button"
                  data-testid="show-in-feed"
                  onClick={() => void show(s)}
                  className="h-10 rounded-full bg-primary px-3 text-sm font-extrabold text-primary-fg"
                >
                  {t('cab.tasks.show')}
                </button>
              )}
              {note === s.id && !s.shown_in_feed && (
                <span data-testid="sub-pending" className="text-xs font-bold text-muted">
                  {t('cab.tasks.pending')}
                </span>
              )}
              {err?.id === s.id && <ErrorText code={err.code} />}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}
