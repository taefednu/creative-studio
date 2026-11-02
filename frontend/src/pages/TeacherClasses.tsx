import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api } from '../api'
import Avatar from '../components/Avatar'
import CabinetHeader from '../components/CabinetHeader'
import ErrorText, { errorKey } from '../components/ErrorText'
import Icon from '../components/Icon'
import QrBox from '../components/QrBox'
import { sampleFor } from '../features/assignments/calendar'
import { notifyCabinet } from '../features/review/review'
import { loadTemplates } from '../features/works/works'
import { useLoad } from '../useLoad'

type Room = { id: number; name: string; code: string }
type Kid = { id: number; nick: string; age_group: string }

const loadRooms = () => api<Room[]>('/api/teacher/classes')
const SHOWN = 5 // аватаров в ряду карточки; число детей — из ответа целиком

/** Окно поверх страницы: закрывается крестиком и Esc, по клику на фон не закрывается, чтобы не потерять ввод. */
function Modal({ title, onClose, children, testid }: { title: string; onClose: () => void; children: ReactNode; testid: string }) {
  const { t } = useTranslation()
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-scrim p-4">
      <div role="dialog" aria-label={title} data-testid={testid} className="my-auto w-full max-w-md rounded-card bg-surface p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-2xl font-extrabold text-heading">{title}</h2>
          <button type="button" data-testid={`${testid}-close`} aria-label={t('cl.close')} onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-heading">
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function TeacherClasses() {
  const { t } = useTranslation()
  const [rooms, load] = useLoad(loadRooms)
  const [tpl] = useLoad(loadTemplates)
  const [kids, setKids] = useState<Record<number, Kid[]>>({})
  const [open, setOpen] = useState<Room | null>(null)
  const [creating, setCreating] = useState(false)
  const [qr, setQr] = useState<{ id: number; nick: string; token: string } | null>(null)
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)

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
    setErr(null)
    try {
      await api('/api/teacher/classes', 'POST', { name })
      setName('')
      setCreating(false)
      load()
      notifyCabinet()
    } catch (x) {
      setErr(errorKey(x))
    }
  }

  async function showQr(classId: number, k: Kid) {
    const r = await api<{ token: string }>(`/api/teacher/classes/${classId}/children/${k.id}/qr`, 'POST')
    setQr({ id: k.id, nick: k.nick, token: r.token })
  }

  return (
    <div className="min-h-screen bg-bg pb-24 lg:pb-6">
      <CabinetHeader role="teacher" />
      <main className="px-4 py-4 md:px-9">
        <div className="flex items-center justify-between gap-3 2xl:mt-6">
          <h1 data-testid="page-title" className="w-fit text-[30px] font-extrabold leading-9 text-heading lg:text-[54px] lg:leading-[50px]">
            {t('cab.tabs.classes')}
          </h1>
          <button
            type="button"
            data-testid="new-class"
            onClick={() => {
              setErr(null)
              setCreating(true)
            }}
            className="flex h-11 items-center gap-2 rounded-2xl bg-primary px-4 text-base font-extrabold text-primary-fg lg:h-[60px] lg:px-7 2xl:h-[72px] 2xl:min-w-[240px] 2xl:justify-center 2xl:text-[26px]"
          >
            <Icon name="plus" className="h-6 w-6 2xl:h-9 2xl:w-9" />
            {t('cl2.new')}
          </button>
        </div>
        {rooms && rooms.length === 0 && <p className="mt-4 text-muted">{t('teacher.noClasses')}</p>}
        <section data-testid="rooms" className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:mt-6 2xl:gap-[22px]">
          {rooms?.map((r) => (
            <RoomCard key={r.id} r={r} kids={kids[r.id]} banner={sampleFor(r.id, tpl?.templates ?? [])} onKids={() => { setQr(null); setOpen(r) }} />
          ))}
        </section>
      </main>
      {creating && (
        <Modal title={t('teacher.newClass')} onClose={() => setCreating(false)} testid="class-modal">
          <form onSubmit={(e) => void create(e)} className="flex flex-col gap-4">
            <div>
              <label htmlFor="class-name" className="mb-1 block text-sm font-extrabold text-primary">
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
            <button type="submit" data-testid="class-create" disabled={!name.trim()} className="h-12 rounded-full bg-primary px-6 font-extrabold uppercase text-primary-fg disabled:opacity-50">
              {t('teacher.create')}
            </button>
          </form>
        </Modal>
      )}
      {open && (
        <Modal title={`${open.name}: ${t('teacher.children')}`} onClose={() => setOpen(null)} testid="kids-modal">
          <div className="flex flex-col gap-2">
            {(kids[open.id] ?? []).length === 0 && <p className="text-sm text-muted">{t('teacher.noChildren')}</p>}
            {(kids[open.id] ?? []).map((k) => (
              <div key={k.id}>
                <div className="flex items-center gap-2">
                  <Avatar nick={k.nick} className="h-9 w-9" />
                  <span className="font-bold text-heading">{k.nick}</span>
                  <button type="button" data-testid={`kid-qr-${k.nick}`} onClick={() => void showQr(open.id, k)} className="ml-auto text-sm font-bold text-primary underline">
                    {t('parent.qrButton')}
                  </button>
                </div>
                {qr?.id === k.id && <QrBox token={qr.token} nick={qr.nick} />}
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}

function RoomCard({ r, kids, banner, onKids }: { r: Room; kids: Kid[] | undefined; banner: string | null; onKids: () => void }) {
  const { t } = useTranslation()
  const [note, setNote] = useState<'copied' | 'fail' | null>(null)
  useEffect(() => {
    if (!note) return
    const id = setTimeout(() => setNote(null), 2200)
    return () => clearTimeout(id)
  }, [note])
  async function copy() {
    try {
      await navigator.clipboard.writeText(r.code)
      setNote('copied')
    } catch {
      setNote('fail') // буфер запрещён политикой страницы: говорим как есть
    }
  }
  return (
    <div data-testid={`room-${r.name}`} className="flex flex-col rounded-card border border-border bg-surface p-3 shadow-card 2xl:p-[13px]">
      <div className="aspect-[2.4] overflow-hidden rounded-2xl bg-primary-soft">
        {banner && <img data-testid="class-banner" src={banner} alt="" className="h-full w-full object-cover" />}
      </div>
      <h2 className="mt-3 px-1 text-2xl font-extrabold leading-8 text-heading 2xl:mt-5 2xl:text-[44px] 2xl:leading-[52px]">{r.name}</h2>
      <div data-testid="code-panel" className="mt-3 rounded-2xl bg-bg p-3 2xl:mx-2 2xl:mt-5 2xl:p-3">
        <p className="text-xs font-extrabold uppercase tracking-wide text-muted 2xl:text-lg 2xl:leading-5">{t('cl.joinCode')}</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          {/* буквы подряд без пробелов между элементами: тест и скринридер читают код целиком */}
          <p data-testid="class-code" aria-label={r.code} className="min-w-0 whitespace-nowrap">
            {[...r.code].map((c, i) => (
              <span key={i} aria-hidden="true" className="mr-1 inline-block h-10 w-7 rounded-xl bg-primary-soft text-center text-2xl font-extrabold leading-10 text-heading min-[360px]:w-8 min-[400px]:w-9 2xl:mr-1 2xl:h-[70px] 2xl:w-[58px] 2xl:text-[44px] 2xl:leading-[70px]">
                {c}
              </span>
            ))}
          </p>
          <div className="relative flex shrink-0 flex-col items-center">
            <button
              type="button"
              data-testid="copy-code"
              aria-label={t('cl.copy')}
              onClick={() => void copy()}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-primary 2xl:h-[52px] 2xl:w-[52px]"
            >
              <Icon name={note === 'copied' ? 'check' : 'copy'} className="h-6 w-6 2xl:h-9 2xl:w-9" />
            </button>
          </div>
        </div>
        {note && (
          <p data-testid="copy-note" role="status" className={`mt-1 text-sm font-extrabold ${note === 'copied' ? 'text-success' : 'text-danger'}`}>
            {t(note === 'copied' ? 'cl.copied' : 'cl.copyFail')}
          </p>
        )}
      </div>
      <div className="mt-3 flex items-center gap-3 border-t border-border px-1 pt-3 2xl:mt-5 2xl:pt-5">
        <div className="flex">
          {(kids ?? []).slice(0, SHOWN).map((k, i) => (
            <Avatar key={k.id} nick={k.nick} className={`h-11 w-11 2xl:h-[78px] 2xl:w-[78px] ${i ? '-ml-2 2xl:-ml-2.5' : ''}`} />
          ))}
        </div>
        {kids && <span data-testid="kids-count" className="text-base font-bold text-muted 2xl:text-xl">{t('cl.kids', { count: kids.length })}</span>}
      </div>
      <div className="mt-3 grid grid-cols-[1fr_1.25fr] gap-3 2xl:mt-5">
        <button
          type="button"
          data-testid={`open-${r.name}`}
          onClick={onKids}
          className="h-11 rounded-2xl border border-border bg-surface px-3 text-base font-extrabold text-heading 2xl:h-[67px] 2xl:text-[26px]"
        >
          {t('cl2.kids')}
        </button>
        <Link
          to={`/teacher/feed/${r.id}`}
          data-testid={`feed-link-${r.name}`}
          className="flex h-11 items-center justify-center rounded-2xl bg-primary px-3 text-base font-extrabold uppercase text-primary-fg 2xl:h-[67px] 2xl:text-[26px]"
        >
          {t('feed.classFeed')}
        </Link>
      </div>
    </div>
  )
}
