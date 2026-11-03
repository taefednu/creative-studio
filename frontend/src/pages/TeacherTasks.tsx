import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import Avatar from '../components/Avatar'
import CabinetHeader from '../components/CabinetHeader'
import ChipSelect from '../components/ChipSelect'
import ErrorText, { errorKey } from '../components/ErrorText'
import Icon from '../components/Icon'
import { dueIso, showErrorCode, taskErrorCode } from '../features/assignments/assignments'
import { dateLabel, duePresets, sampleFor } from '../features/assignments/calendar'
import { LANGS } from '../i18n'
import { parseUtc } from '../features/review/review'
import { loadTemplates } from '../features/works/works'
import { useLoad } from '../useLoad'

type Room = { id: number; name: string }
type Task = { id: number; title: string; description: string; due_at: string | null; submissions: number }
type Sub = { id: number; nick: string; status: 'accepted' | 'held'; shown_in_feed: boolean; image_url: string; comment: string | null }

const loadRooms = () => api<Room[]>('/api/teacher/classes')
const field =
  'w-full rounded-2xl border border-border bg-bg px-4 text-heading outline-none placeholder:text-muted focus:border-primary big:text-[22px]'
const label = 'mb-1 mt-3 block text-base font-extrabold text-heading big:mb-2.5 big:mt-7 big:text-[22px]'
const SHOWN = 4 // аватаров сдавших в строке задания; остальные — «+N»

/** Задания учителя (#13): создать, список класса со сдачами и прогрессом, галерея сдач и «показать в ленте класса». */
export default function TeacherTasks() {
  const { t, i18n } = useTranslation()
  const [rooms, reloadRooms, roomsFailed] = useLoad(loadRooms)
  const [tpl] = useLoad(loadTemplates)
  const [picked, setPicked] = useState<number | null>(null)
  const classId = picked ?? rooms?.[0]?.id ?? null
  const [tasks, setTasks] = useState<{ cls: number; items: Task[]; subs: Record<number, Sub[]> } | null>(null)
  const [kids, setKids] = useState<{ cls: number; n: number } | null>(null)
  const [tick, setTick] = useState(0)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState<Task | null>(null)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const lock = useRef(false)

  useEffect(() => {
    if (classId === null) return
    let alive = true
    api<Task[]>(`/api/teacher/classes/${classId}/assignments`)
      .then(async (items) => {
        const lists = await Promise.all(items.map((a) => api<Sub[]>(`/api/teacher/assignments/${a.id}/submissions`)))
        if (!alive) return
        setTasks({ cls: classId, items, subs: Object.fromEntries(items.map((a, i) => [a.id, lists[i]])) })
        setFailed(false)
      })
      .catch(() => alive && setFailed(true)) // сбой — видимая ошибка и повтор, а не «заданий нет»
    return () => {
      alive = false
    }
  }, [classId, tick])
  useEffect(() => {
    if (classId === null) return
    let alive = true
    api<unknown[]>(`/api/teacher/classes/${classId}/children`)
      .then((k) => alive && setKids({ cls: classId, n: k.length }))
      .catch(() => alive && setKids({ cls: classId, n: 0 }))
    return () => {
      alive = false
    }
  }, [classId])
  const items = tasks?.cls === classId ? tasks.items : null
  const total = kids?.cls === classId ? kids.n : 0
  const presets = duePresets(new Date(), t) // при рендере: после полуночи «сегодня» уже другой день; выбранное хранит день
  const recent = items && tasks ? items.flatMap((a) => tasks.subs[a.id] ?? []).sort((x, y) => y.id - x.id).slice(0, 4) : []

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
        lang: LANGS.includes(i18n.language as never) ? i18n.language : 'ru', // язык задания = язык интерфейса учителя
      })
      setTitle('')
      setDesc('')
      setDue('')
      setFormOpen(false)
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
      <main className="px-4 py-4 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
          <h1 data-testid="page-title" className="w-fit text-[32px] font-black leading-9 tracking-tight text-heading lg:text-5xl lg:leading-[56px]">
            {t('cab.tasks.title')}
          </h1>
          {classId !== null && (
            <button type="button" data-testid="task-new" onClick={() => setFormOpen(true)} className="btn-press ml-auto flex h-12 items-center gap-2 rounded-2xl bg-primary px-5 font-extrabold text-primary-fg lg:order-last">
              <Icon name="plus" className="h-5 w-5" />
              {t('tt.newTask')}
            </button>
          )}
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
              className="h-11 w-full lg:w-[213px]"
            />
          )}
        </div>
        {(roomsFailed || (failed && classId !== null)) && (
          <div data-testid="tasks-load-error" className="mt-3 flex flex-col items-start gap-2">
            <ErrorText code="generic" />
            <button
              type="button"
              data-testid="tasks-retry"
              onClick={() => (roomsFailed ? reloadRooms() : setTick((n) => n + 1))}
              className="h-10 rounded-full bg-primary px-6 font-extrabold text-primary-fg"
            >
              {t('create.retry')}
            </button>
          </div>
        )}
        {rooms && rooms.length === 0 && (
          <p data-testid="tasks-empty" className="mt-3 text-muted">
            {t('cab.tasks.noClasses')}
          </p>
        )}
        {classId !== null && (
          <div className="mt-3">
            {formOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-scrim p-3" onPointerDown={(e) => e.target === e.currentTarget && !busy && setFormOpen(false)}>
            <form
              onSubmit={(e) => void create(e)}
              data-testid="task-form"
              role="dialog"
              aria-modal="true"
              aria-label={t('tt.newTask')}
              className="modal-in relative my-auto w-full max-w-[520px] rounded-[28px] bg-surface p-5 shadow-pop"
            >
              <button type="button" data-testid="task-form-close" aria-label={t('mw.close')} disabled={busy} onClick={() => setFormOpen(false)} className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-primary-soft">
                <Icon name="close" />
              </button>
              <h2 className="pr-10 text-2xl font-black tracking-tight text-heading">{t('tt.newTask')}</h2>
              <label htmlFor="task-title" className={label}>{t('tt.titleLabel')}</label>
              <input
                id="task-title"
                data-testid="task-title"
                value={title}
                maxLength={100}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('cab.tasks.titlePh')}
                className={`${field} h-12 big:h-[65px]`}
              />
              <label htmlFor="task-description" className={label}>{t('tt.descLabel')}</label>
              <textarea
                id="task-description"
                data-testid="task-description"
                value={desc}
                maxLength={1000}
                onChange={(e) => setDesc(e.target.value)}
                placeholder={t('cab.tasks.descPh')}
                className={`${field} h-[110px] short:h-20 resize-none py-3 big:h-[169px]`}
              />
              <span className={label}>{t('tt.dueLabel')}</span>
              <ChipSelect
                testid="task-due"
                label={t('tt.dueLabel')}
                value={due}
                onChange={setDue}
                options={presets.map((p) => ({ ...p, icon: <Icon name="calendar" className="h-5 w-5" /> }))}
                className="h-12 w-full big:h-[70px] big:w-[328px]"
              />
              <button
                type="submit"
                data-testid="task-create"
                disabled={busy || !title.trim()}
                className="mt-5 h-[52px] w-full rounded-full bg-primary px-4 text-lg font-extrabold uppercase text-primary-fg disabled:opacity-60 big:mt-12 big:h-[77px] big:text-[28px]"
              >
                {t('cab.tasks.create')}
              </button>
              <ErrorText code={err} />
            </form>
              </div>
            )}
            <section data-testid="tasks-panel">
              <h2 className="text-2xl font-black tracking-tight text-heading md:text-3xl">{t('tt.assigned')}</h2>
              {items && items.length === 0 && (
                <p data-testid="tasks-none" className="mt-3 px-2 text-muted">
                  {t('tt.empty')}
                </p>
              )}
              <div className="mt-2 flex flex-col gap-3">
                {items?.map((a) => (
                  <AssignmentRow
                    key={a.id}
                    a={a}
                    subs={tasks?.subs[a.id] ?? []}
                    total={total}
                    sample={sampleFor(a.id, tpl?.templates ?? [])}
                    active={open?.id === a.id}
                    onClick={() => setOpen(open?.id === a.id ? null : a)}
                  />
                ))}
              </div>
              {open ? (
                <Submissions key={open.id} task={open} onShown={() => setTick((n) => n + 1)} />
              ) : (
                items &&
                items.length > 0 && (
                  <section className="mt-5" data-testid="recent">
                    <h2 className="px-2 text-2xl font-extrabold text-heading big:text-[40px] big:leading-[48px]">{t('tt.recent')}</h2>
                    {recent.length === 0 ? (
                      <p className="mt-2 px-2 text-muted">{t('tt.recentEmpty')}</p>
                    ) : (
                      <Gallery subs={recent} onShown={() => setTick((n) => n + 1)} cols="grid-cols-2 lg:grid-cols-4" />
                    )}
                  </section>
                )
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  )
}

function AssignmentRow({ a, subs, total, sample, active, onClick }: { a: Task; subs: Sub[]; total: number; sample: string | null; active: boolean; onClick: () => void }) {
  const { t } = useTranslation()
  const accepted = subs.filter((s) => s.status === 'accepted')
  const nicks = [...new Set(accepted.map((s) => s.nick))]
  const thumb = accepted[0]?.image_url ?? sample
  const pct = total > 0 ? Math.min(100, Math.round((a.submissions / total) * 100)) : 0
  return (
    <button
      type="button"
      data-testid="assignment-card"
      aria-pressed={active}
      onClick={onClick}
      className={`grid grid-cols-[96px_1fr] items-center gap-x-3 gap-y-2 rounded-2xl border bg-surface p-2 text-left shadow-card md:grid-cols-[110px_1fr] lg:grid-cols-[120px_minmax(0,1fr)_minmax(150px,200px)_auto] big:grid-cols-[163px_minmax(0,1fr)_205px_auto] big:gap-x-5 ${active ? 'border-primary' : 'border-border'}`}
    >
      <span className="aspect-[1.66] overflow-hidden rounded-xl bg-primary-soft">
        {thumb && <img src={thumb} alt="" className="h-full w-full object-cover" />}
      </span>
      <span className="flex min-w-0 flex-col items-start gap-1.5">
        <span className="text-lg font-extrabold leading-6 text-heading big:text-[26px] big:leading-8">{a.title}</span>
        <span className="flex h-8 items-center gap-2 rounded-full bg-primary-soft px-3 text-sm font-extrabold text-primary big:h-[38px] big:text-xl">
          <Icon name="calendar" className="h-4 w-4 big:h-5 big:w-5" />
          {a.due_at ? t('tt.dueOn', { date: dateLabel(parseUtc(a.due_at), t) }) : t('cab.tasks.noDue')}
        </span>
      </span>
      <span className="col-span-2 flex flex-col gap-1.5 lg:col-span-1">
        <span data-testid="assignment-count" className="text-sm font-bold text-heading big:text-lg">
          {total > 0 ? t('tt.handedOf', { done: a.submissions, total }) : t('cab.tasks.count', { count: a.submissions })}
        </span>
        {total > 0 && (
          <span className="h-2.5 overflow-hidden rounded-full bg-primary-soft" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={a.submissions}>
            <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </span>
        )}
      </span>
      <span className="col-span-2 flex items-center lg:col-span-1">
        {nicks.slice(0, SHOWN).map((n, i) => (
          <Avatar key={n} nick={n} className={`h-10 w-10 big:h-[52px] big:w-[52px] ${i ? '-ml-2' : ''}`} />
        ))}
        {a.submissions > Math.min(nicks.length, SHOWN) && (
          <span className="ml-2 flex h-10 min-w-10 items-center justify-center rounded-full bg-primary-soft px-2 text-sm font-extrabold text-primary big:h-[52px] big:min-w-[52px]">
            {t('tt.more', { count: a.submissions - Math.min(nicks.length, SHOWN) })}
          </span>
        )}
      </span>
    </button>
  )
}

/** Галерея сдач одного задания: грузится при открытии, чтобы видеть свежее. */
function Submissions({ task, onShown }: { task: Task; onShown: () => void }) {
  const { t } = useTranslation()
  const [subs, setSubs] = useState<Sub[] | null>(null)
  const load = useCallback(
    () => api<Sub[]>(`/api/teacher/assignments/${task.id}/submissions`).then(setSubs).catch(() => setSubs([])),
    [task.id],
  )
  useEffect(() => {
    void load()
  }, [load])
  return (
    <section data-testid="submissions" className="mt-5">
      <h2 className="px-2 text-2xl font-extrabold text-heading">{t('cab.tasks.subsTitle', { title: task.title })}</h2>
      {subs && subs.length === 0 && (
        <p data-testid="submissions-empty" className="mt-2 px-2 text-muted">
          {t('cab.tasks.subsEmpty')}
        </p>
      )}
      {subs && <Gallery subs={subs} onShown={onShown} reload={load} cols="grid-cols-2 md:grid-cols-3 lg:grid-cols-4" />}
    </section>
  )
}

/** Плитки сдач. Что на проверке — с пометкой; «в ленту» только принятое. */
function Gallery({ subs, onShown, reload, cols }: { subs: Sub[]; onShown: () => void; reload?: () => Promise<void>; cols: string }) {
  const { t } = useTranslation()
  const [err, setErr] = useState<{ id: number; code: string } | null>(null)
  const [note, setNote] = useState<number | null>(null)
  const lock = useRef(false)

  async function show(s: Sub) {
    if (lock.current) return // двойной клик не шлёт второй запрос
    lock.current = true
    try {
      const r = await api<{ shown_in_feed: boolean }>(`/api/teacher/submissions/${s.id}/show-in-feed`, 'POST')
      setErr(null)
      // false — пост задержан проверкой и ещё никому не виден: говорим как есть
      setNote(r.shown_in_feed ? null : s.id)
      await reload?.()
      onShown()
    } catch (x) {
      setErr({ id: s.id, code: showErrorCode(errorKey(x)) })
    } finally {
      lock.current = false
    }
  }

  return (
    <div className={`mt-3 grid gap-3 ${cols}`}>
      {subs.map((s) => (
        <figure key={s.id} data-testid="submission" className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          <img src={s.image_url} alt={s.nick} className="aspect-[1.66] w-full object-cover" loading="lazy" />
          <figcaption className="flex flex-col gap-2 p-2.5">
            <span className="flex items-center gap-2 text-sm font-extrabold text-heading">
              <Avatar nick={s.nick} className="h-8 w-8" />
              <span className="min-w-0 truncate">{s.nick}</span>
            </span>
            {s.comment && <span className="text-sm text-text">{s.comment}</span>}
            {s.status === 'held' ? (
              <span data-testid="sub-held" className="rounded-xl bg-primary-soft px-2 py-1 text-center text-xs font-extrabold text-heading">
                {t('cab.tasks.held')}
              </span>
            ) : s.shown_in_feed ? (
              <span data-testid="sub-shown" className="rounded-xl bg-success-soft px-2 py-1 text-center text-xs font-extrabold text-success">
                {t('cab.tasks.shown')}
              </span>
            ) : (
              <button
                type="button"
                data-testid="show-in-feed"
                onClick={() => void show(s)}
                className="h-10 rounded-full border border-primary bg-surface px-3 text-sm font-extrabold text-primary"
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
  )
}
