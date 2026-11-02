import { useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ApiError, api } from '../api'
import ErrorText, { errorKey } from './ErrorText'

/** Как UPLOAD_MAX_BYTES на бэкенде (backend/app/config.py): большой файл не гоним по сети зря. */
const UPLOAD_MAX_BYTES = 5_000_000

type Props = { guest?: boolean; className: string }

/** Кнопка «+» и попап загрузки (menus.jpg): файл уходит только на POST /api/works/upload, дальше /create?work=<id>. */
export default function UploadPopup({ guest, className }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const sent = useRef<{ file: File; id: string } | null>(null)

  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )

  async function send(file: File) {
    if (busy) return
    setErr(file.size > UPLOAD_MAX_BYTES ? 'file_too_large' : null)
    if (file.size > UPLOAD_MAX_BYTES) return
    setBusy(true)
    setPreview(URL.createObjectURL(file)) // только на этом экране, никуда не уходит
    // тот же файл — тот же request_id (двойной клик, сеть); другой файл или 4xx — новый
    if (sent.current?.file !== file) sent.current = { file, id: crypto.randomUUID() }
    const form = new FormData()
    form.append('file', file)
    form.append('request_id', sent.current.id)
    try {
      const r = await api<{ id: number }>('/api/works/upload', 'POST', form)
      setOpen(false)
      navigate(`/create?work=${r.id}`)
    } catch (x) {
      setErr(x instanceof ApiError && x.status === 503 ? 'upload_busy' : errorKey(x))
      if (x instanceof ApiError && x.status >= 400 && x.status < 500) sent.current = null
    } finally {
      setBusy(false)
      setPreview(null)
    }
  }

  function drop(e: DragEvent) {
    e.preventDefault()
    setOver(false)
    const f = e.dataTransfer.files[0]
    if (f) void send(f)
  }

  const name = t('panel.uploadTitle')
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        data-testid="upload-open"
        aria-expanded={open}
        aria-label={name}
        title={name}
        onClick={() => (guest ? navigate('/login') : setOpen((o) => !o))}
        className={className}
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      {open && (
        <div
          data-testid="upload-popup"
          role="dialog"
          aria-label={name}
          className="chip-pop absolute bottom-full left-0 z-40 mb-4 w-[min(250px,calc(100vw-32px))] rounded-3xl border border-border bg-surface p-3 shadow-pop"
          style={{ transformOrigin: 'bottom left' }}
        >
          <label
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={drop}
            className={`flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed px-3 py-4 text-center ${
              over ? 'border-primary bg-primary-soft' : 'border-primary-light bg-bg'
            }`}
          >
            <input
              data-testid="upload-input"
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void send(f)
              }}
            />
            <span className="relative">
              <img src={preview ?? '/art/tab-feed.webp'} alt="" className={`h-14 w-14 object-cover ${preview ? 'rounded-xl' : ''}`} />
              <svg viewBox="0 0 24 24" className="absolute -bottom-1 -right-2 h-7 w-7 rounded-full bg-primary text-primary-fg" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                <path d="M12 7v10M7 12h10" />
              </svg>
            </span>
            <span className="mt-1 text-base font-extrabold text-heading">{busy ? t('panel.uploadSending') : name}</span>
            <span className="text-sm font-bold text-muted">{t('panel.uploadHint')}</span>
          </label>
          {err && (
            <div className="mt-2">
              <ErrorText code={err} />
            </div>
          )}
          <button
            type="button"
            aria-label={t('panel.uploadClose')}
            onClick={() => setOpen(false)}
            className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full text-muted"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
