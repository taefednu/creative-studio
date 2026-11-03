import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import Avatar from '../components/Avatar'
import CabinetHeader from '../components/CabinetHeader'
import ErrorText, { errorKey } from '../components/ErrorText'
import Icon from '../components/Icon'
import OpenLinks from '../components/OpenLinks'
import QrBox from '../components/QrBox'
import ReviewQueue from '../components/ReviewQueue'
import ClassTasks from './TeacherTasks'
import { sampleFor } from '../features/assignments/calendar'
import { forClass, notifyCabinet, REVIEW_EVENT } from '../features/review/review'
import { loadTemplates } from '../features/works/works'
import type { ReviewItem } from '../features/review/review'
import { useLoad } from '../useLoad'

type Room = { id: number; name: string; code: string }
type Kid = { id: number; nick: string; age_group: string }

const loadRooms = () => api<Room[]>('/api/teacher/classes')
const loadQueue = () => api<ReviewItem[]>('/api/review/queue')
const SHOWN = 5 // аватаров на карточке класса; число детей из ответа целиком

/** Окно поверх страницы: закрывается крестиком и Esc, по клику на фон не закрывается, чтобы не потерять ввод. */
function Modal({ title, onClose, children, testid }: { title: string; onClose: () => void; children: ReactNode; testid: string }) {
  const { t } = useTranslation()
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className="modal-bg fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label={title} data-testid={testid} className="modal-in max-h-full w-full max-w-sm overflow-y-auto rounded-[28px] bg-surface p-5 shadow-pop">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-2xl font-black tracking-tight text-heading">{title}</h2>
          <button type="button" data-testid={`${testid}-close`} aria-label={t('cl.close')} onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-heading transition-colors duration-150 hover:bg-primary-soft">
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Код для вступления: буквы по одной, копировать в одно нажатие. */
function ClassCode({ code }: { code: string }) {
  const { t } = useTranslation()
  const [note, setNote] = useState<'copied' | 'fail' | null>(null)
  useEffect(() => {
    if (!note) return
    const id = setTimeout(() => setNote(null), 2200)
    return () => clearTimeout(id)
  }, [note])
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setNote('copied')
    } catch {
      setNote('fail') // буфер запрещён политикой страницы: говорим как есть
    }
  }
  return (
    <div data-testid="code-panel">
      <p className="mb-1.5 text-sm font-extrabold text-heading">{t('cl.joinCode')}</p>
      <div className="flex items-center gap-2">
        {/* буквы подряд без пробелов между элементами: тест и скринридер читают код целиком */}
        <p data-testid="class-code" aria-label={code} className="flex min-w-0 flex-1 gap-1">
          {[...code].map((c, i) => (
            <span key={i} aria-hidden="true" className="flex h-12 min-w-0 flex-1 items-center justify-center rounded-xl bg-primary-soft text-2xl font-black text-heading">{c}</span>
          ))}
        </p>
        <button type="button" data-testid="copy-code" aria-label={t('cl.copy')} title={t('cl.copy')} onClick={() => void copy()} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-primary transition-colors duration-150 hover:bg-primary-soft">
          <Icon name={note === 'copied' ? 'check' : 'copy'} className="h-6 w-6" />
        </button>
      </div>
      {note && (
        <p data-testid="copy-note" role="status" className={`mt-1 text-sm font-extrabold ${note === 'copied' ? 'text-success' : 'text-danger'}`}>
          {t(note === 'copied' ? 'cl.copied' : 'cl.copyFail')}
        </p>
      )}
    </div>
  )
}

/** Большая карточка класса: вся нажимается и ведёт внутрь. Код и задания уже там. */
function RoomCard({ r, kids, banner, waiting }: { r: Room; kids: Kid[] | undefined; banner: string | null; waiting: number }) {
  const { t } = useTranslation()
  return (
    <Link to={`/teacher/classes/${r.id}`} data-testid={`room-${r.name}`} className="feed-card group flex flex-col overflow-hidden rounded-[28px] border border-border bg-surface shadow-card">
      <span className="relative block aspect-[2.2] overflow-hidden bg-primary-soft">
        {banner && <img data-testid="class-banner" src={banner} alt="" className="feed-img feed-img-on h-full w-full object-cover group-hover:scale-105" />}
        {!!waiting && <span data-testid={`room-waiting-${r.id}`} className="absolute right-3 top-3 flex h-9 items-center rounded-full bg-danger px-3 text-sm font-extrabold text-primary-fg">{t('cl.waiting', { count: waiting })}</span>}
      </span>
      <span className="flex flex-col gap-3 p-4">
        <span className="truncate text-[28px] font-black leading-9 tracking-tight text-heading">{r.name}</span>
        <span className="flex min-h-11 items-center gap-3">
          <span className="flex">
            {(kids ?? []).slice(0, SHOWN).map((k, i) => (
              <Avatar key={k.id} nick={k.nick} className={`h-11 w-11 ${i ? '-ml-2' : ''}`} />
            ))}
          </span>
          {kids && <span data-testid="kids-count" className="text-base font-bold text-text">{t('cl.kids', { count: kids.length })}</span>}
        </span>
      </span>
    </Link>
  )
}

/** Главный экран учителя: классы большими карточками. */
export default function TeacherClasses() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [rooms, load] = useLoad(loadRooms)
  const [queue, reloadQueue] = useLoad(loadQueue)
  const [tpl] = useLoad(loadTemplates)
  const [kids, setKids] = useState<Record<number, Kid[]>>({})
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    window.addEventListener(REVIEW_EVENT, reloadQueue)
    return () => window.removeEventListener(REVIEW_EVENT, reloadQueue)
  }, [reloadQueue])

  const ids = rooms?.map((r) => r.id).join(',') ?? ''
  useEffect(() => {
    let alive = true
    for (const id of ids ? ids.split(',').map(Number) : []) {
      api<Kid[]>(`/api/teacher/classes/${id}/children`)
        .then((k) => alive && setKids((m) => ({ ...m, [id]: k })))
        .catch(() => {})
    }
    return () => {
      alive = false
    }
  }, [ids])

  async function create(e: FormEvent) {
    e.preventDefault()
    if (lock.current) return // двойной клик не создаёт два класса
    lock.current = true
    setBusy(true)
    setErr(null)
    try {
      const made = await api<{ id: number }>('/api/teacher/classes', 'POST', { name })
      setName('')
      setCreating(false)
      load()
      notifyCabinet()
      navigate(`/teacher/classes/${made.id}`) // новый класс сразу открыт: там код для детей
    } catch (x) {
      setErr(errorKey(x))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg pb-24 lg:pb-6">
      <CabinetHeader role="teacher" />
      <main className="px-4 py-4 md:px-8">
        <ReviewQueue urgentOnly />
        <div className="flex items-center gap-3">
          <h1 data-testid="page-title" className="text-[32px] font-black leading-9 tracking-tight text-heading lg:text-5xl lg:leading-[56px]">{t('cab.tabs.classes')}</h1>
          <button
            type="button"
            data-testid="new-class"
            onClick={() => {
              setErr(null)
              setCreating(true)
            }}
            className="btn-press ml-auto flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-primary px-3 text-base font-extrabold text-primary-fg sm:h-12 sm:px-5"
          >
            <Icon name="plus" className="h-5 w-5" />
            <span className="hidden sm:inline">{t('cl2.new')}</span>
          </button>
        </div>
        {rooms && rooms.length === 0 && <p data-testid="rooms-empty" className="mt-4 text-lg font-bold text-text">{t('teacher.noClasses')}</p>}
        <section data-testid="rooms" className="stagger mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rooms?.map((r) => (
            <RoomCard key={r.id} r={r} kids={kids[r.id]} banner={sampleFor(r.id, tpl?.templates ?? [])} waiting={queue ? forClass(queue, r.id).length : 0} />
          ))}
        </section>
        <div className="mt-6"><OpenLinks role="teacher" /></div>
      </main>
      {creating && (
        <Modal title={t('teacher.newClass')} onClose={() => setCreating(false)} testid="class-modal">
          <form onSubmit={(e) => void create(e)} className="flex flex-col gap-4">
            <div>
              <label htmlFor="class-name" className="mb-1.5 block text-sm font-extrabold text-heading">
                {t('teacher.className')}
              </label>
              <input
                id="class-name"
                data-testid="class-name"
                autoFocus
                className="h-12 w-full rounded-2xl border border-border bg-surface px-4 font-bold text-heading outline-none focus:border-primary"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <ErrorText code={err} />
            <button type="submit" data-testid="class-create" disabled={busy || !name.trim()} className="btn-press h-14 rounded-[14px] bg-primary px-6 text-lg font-extrabold text-primary-fg disabled:opacity-50">
              {t('teacher.create')}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}

/** Внутри класса: что решить, код и дети, выдача и проверка заданий. */
export function TeacherClass() {
  const { t } = useTranslation()
  const { classId } = useParams()
  const [rooms] = useLoad(loadRooms)
  const [queue, reloadQueue] = useLoad(loadQueue)
  const [kids, setKids] = useState<Kid[] | null>(null)
  const [qrErr, setQrErr] = useState<string | null>(null)
  const [qr, setQr] = useState<{ nick: string; token: string } | null>(null)

  useEffect(() => {
    window.addEventListener(REVIEW_EVENT, reloadQueue)
    return () => window.removeEventListener(REVIEW_EVENT, reloadQueue)
  }, [reloadQueue])

  const room = rooms?.find((r) => r.id === Number(classId)) ?? null
  const inRoom = room && queue ? forClass(queue, room.id) : []
  const waiting = inRoom.some((x) => !x.urgent)

  const roomId = room?.id
  useEffect(() => {
    if (roomId === undefined) return
    let alive = true
    api<Kid[]>(`/api/teacher/classes/${roomId}/children`)
      .then((k) => alive && setKids(k))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [roomId])

  async function showQr(k: Kid) {
    if (!room) return
    setQrErr(null)
    try {
      const r = await api<{ token: string }>(`/api/teacher/classes/${room.id}/children/${k.id}/qr`, 'POST')
      setQr({ nick: k.nick, token: r.token })
    } catch (x) {
      setQrErr(errorKey(x))
    }
  }

  if (rooms && !room) return <Navigate to="/teacher/classes" replace />

  return (
    <div className="min-h-screen bg-bg pb-24 lg:pb-6">
      <CabinetHeader role="teacher" />
      <main className="px-4 py-4 md:px-8">
        <ReviewQueue urgentOnly />
        {room && (
          <>
            <div className="flex min-w-0 items-center gap-2">
              <Link to="/teacher/classes" data-testid="back-classes" aria-label={t('cab.tabs.classes')} title={t('cab.tabs.classes')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-heading transition-colors duration-150 hover:bg-primary-soft">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m15 5-7 7 7 7" />
                </svg>
              </Link>
              <h1 data-testid="page-title" className="min-w-0 truncate text-[32px] font-black leading-9 tracking-tight text-heading lg:text-5xl lg:leading-[56px]">{room.name}</h1>
            </div>
            <section data-testid="room-inside" className="stagger mt-4 grid gap-6 lg:grid-cols-6 lg:gap-x-3 xl:grid-cols-7">
              <aside data-testid="room-panel" className="flex min-w-0 flex-col gap-4 lg:order-2 lg:col-span-2">
                <ClassCode key={room.id} code={room.code} />
                <div className="border-t border-border pt-3">
                  {kids && <p data-testid="kids-count" className="mb-2 text-sm font-extrabold text-heading">{t('cl.kids', { count: kids.length })}</p>}
                  <ErrorText code={qrErr} />
                  {kids?.length === 0 && <p className="text-sm font-bold text-text">{t('cl.noKids')}</p>}
                  <div data-testid="room-kids" className="stagger -mx-1 flex gap-1 overflow-x-auto p-1 [scrollbar-width:none] lg:grid lg:max-h-[252px] lg:grid-cols-4 lg:gap-x-1 lg:gap-y-2 lg:overflow-y-auto lg:overflow-x-hidden lg:[scrollbar-width:thin] xl:grid-cols-5">
                    {kids?.map((k) => (
                      <button key={k.id} type="button" data-testid={`kid-qr-${k.nick}`} title={`${k.nick}: ${t('parent.qrButton')}`} onClick={() => void showQr(k)} className="flex w-[72px] shrink-0 flex-col items-center gap-1 transition-transform duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97] motion-reduce:transition-none lg:w-full">
                        <Avatar nick={k.nick} className="h-14 w-14" />
                        <span className="w-full truncate text-center text-xs font-extrabold leading-4 text-heading">{k.nick}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </aside>
              <div className="flex min-w-0 flex-col lg:order-1 lg:col-span-4 xl:col-span-5">
                {waiting && <ReviewQueue stackOf={(x) => forClass([x], room.id).length > 0} withWho title={t('review.okTitle')} />}
                {/* Только когда точно пусто: очередь загрузилась и в классе нет ничего, срочного тоже */}
                {queue && inRoom.length === 0 && (
                  <div data-testid="room-clear" className="flex flex-1 items-center gap-3 rounded-[28px] bg-success-soft p-3 pr-5 md:gap-5 md:p-4 md:pr-8 lg:gap-8 lg:p-8">
                    <img src="/art/robot-happy.webp" alt="" className="h-20 w-20 shrink-0 object-contain md:h-28 md:w-28 lg:h-44 lg:w-44" />
                    <div className="min-w-0">
                      <h2 className="text-[28px] font-black leading-8 tracking-tight text-heading md:text-4xl md:leading-[44px]">{t('cab.kid.clearTitle')}</h2>
                      <p className="mt-1 text-base font-semibold leading-6 text-text lg:text-lg">{t('cl.clearText', { name: room.name, interpolation: { escapeValue: false } })}</p>
                    </div>
                  </div>
                )}
                {/* Есть только срочное: оно над экраном, здесь не «всё хорошо» и не пустота */}
                {queue && inRoom.length > 0 && !waiting && (
                  <div data-testid="room-urgent-note" className="flex flex-1 items-center rounded-[28px] border border-urgent-border bg-urgent-soft p-4 lg:p-8">
                    <p className="text-xl font-extrabold text-urgent">{t('cab.kid.urgentAbove')}</p>
                  </div>
                )}
              </div>
              <div className="lg:order-3 lg:col-span-6 xl:col-span-7">
                <ClassTasks key={room.id} classId={room.id} nicks={(kids ?? []).map((k) => k.nick)} />
              </div>
            </section>
          </>
        )}
      </main>
      {qr && (
        <Modal title={qr.nick} onClose={() => setQr(null)} testid="qr-modal">
          <QrBox token={qr.token} nick={qr.nick} />
        </Modal>
      )}
    </div>
  )
}
