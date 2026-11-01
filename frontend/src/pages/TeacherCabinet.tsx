import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api } from '../api'
import CabinetHeader from '../components/CabinetHeader'
import ErrorText, { errorKey } from '../components/ErrorText'
import QrBox from '../components/QrBox'
import ReviewQueue from '../components/ReviewQueue'
import { useLoad } from '../useLoad'

type Room = { id: number; name: string; code: string }
type Kid = { id: number; nick: string; age_group: string }

const loadRooms = () => api<Room[]>('/api/teacher/classes')

const card = 'rounded-card border border-border bg-surface p-4 shadow-card'

export default function TeacherCabinet() {
  const { t } = useTranslation()
  const [rooms, load] = useLoad(loadRooms)
  const [open, setOpen] = useState<number | null>(null)
  const [kids, setKids] = useState<Kid[]>([])
  const [qr, setQr] = useState<{ id: number; nick: string; token: string } | null>(null)
  const [name, setName] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function create(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    try {
      await api('/api/teacher/classes', 'POST', { name })
      setName('')
      load()
    } catch (x) {
      setErr(errorKey(x))
    }
  }

  async function toggle(id: number) {
    setQr(null)
    if (open === id) return setOpen(null)
    setKids(await api<Kid[]>(`/api/teacher/classes/${id}/children`))
    setOpen(id)
  }

  async function showQr(classId: number, k: Kid) {
    const r = await api<{ token: string }>(`/api/teacher/classes/${classId}/children/${k.id}/qr`, 'POST')
    setQr({ id: k.id, nick: k.nick, token: r.token })
  }

  return (
    <div className="min-h-screen bg-bg">
      <CabinetHeader title={t('teacher.title')} />
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6 md:grid-cols-2 md:px-8">
        <div className="md:col-span-2">
          <ReviewQueue title={t('review.title')} />
        </div>
        <section className="flex flex-col gap-3" data-testid="rooms">
          <h2 className="text-xl font-extrabold text-heading">{t('teacher.classes')}</h2>
          {rooms && rooms.length === 0 && <p className="text-muted">{t('teacher.noClasses')}</p>}
          {rooms?.map((r) => (
            <div key={r.id} className={card} data-testid={`room-${r.name}`}>
              <p className="font-extrabold text-heading">{r.name}</p>
              <p className="text-xs font-extrabold uppercase text-primary">{t('teacher.code')}</p>
              <p data-testid="class-code" className="text-4xl font-extrabold tracking-widest text-heading">
                {r.code}
              </p>
              <Link
                to={`/teacher/feed/${r.id}`}
                data-testid={`feed-link-${r.name}`}
                className="mr-2 mt-2 inline-block rounded-full bg-primary px-4 py-2 text-sm font-extrabold text-primary-fg"
              >
                {t('feed.classFeed')}
              </Link>
              <button
                type="button"
                data-testid={`open-${r.name}`}
                onClick={() => void toggle(r.id)}
                className="mt-2 rounded-full bg-primary-soft px-4 py-2 text-sm font-extrabold text-primary"
              >
                {t('teacher.children')}
              </button>
              {open === r.id && (
                <div className="mt-3 flex flex-col gap-2">
                  {kids.length === 0 && <p className="text-sm text-muted">{t('teacher.noChildren')}</p>}
                  {kids.map((k) => (
                    <div key={k.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-heading">{k.nick}</span>
                        <button
                          type="button"
                          onClick={() => void showQr(r.id, k)}
                          className="ml-auto text-sm font-bold text-primary underline"
                        >
                          {t('parent.qrButton')}
                        </button>
                      </div>
                      {qr?.id === k.id && <QrBox token={qr.token} nick={qr.nick} />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
        <section>
          <form onSubmit={(e) => void create(e)} className={`${card} flex flex-col gap-4`}>
            <h2 className="text-xl font-extrabold text-heading">{t('teacher.newClass')}</h2>
            <div>
              <label htmlFor="class-name" className="mb-1 block text-xs font-extrabold uppercase text-primary">
                {t('teacher.className')}
              </label>
              <input
                id="class-name"
                data-testid="class-name"
                className="w-full rounded-2xl border border-border bg-surface px-4 py-2 font-bold text-heading outline-none focus:border-primary"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <ErrorText code={err} />
            <button
              type="submit"
              data-testid="class-create"
              disabled={!name.trim()}
              className="rounded-full bg-primary px-6 py-3 font-extrabold uppercase text-primary-fg disabled:opacity-50"
            >
              {t('teacher.create')}
            </button>
          </form>
        </section>
      </main>
    </div>
  )
}
