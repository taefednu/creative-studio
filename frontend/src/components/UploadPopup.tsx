import { useEffect, useRef, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ApiError, api } from '../api'
import DrawPad from './DrawPad'
import type { DrawPadHandle } from './DrawPad'
import ErrorText, { errorKey } from './ErrorText'
import Icon from './Icon'

/** Как UPLOAD_MAX_BYTES на бэкенде (backend/app/config.py): большой файл не гоним по сети зря. */
const UPLOAD_MAX_BYTES = 5_000_000

type Props = { guest?: boolean; className: string; assignmentId?: number | null; label?: ReactNode; testid?: string; boxClassName?: string; price?: number }

/**
 * Кнопка и окно «Твой рисунок»: фото или рисование прямо здесь, потом одна кнопка «Оживить». Файл уходит только на POST /api/works/upload,
 * дальше /create?work=<id>: там проверка и, если рисунок её прошёл, оживление (auto в состоянии перехода).
 * Портал: на ленте панель создания сдвинута transform, и fixed внутри неё считался бы от панели.
 */
export default function UploadPopup({ guest, className, assignmentId, label, testid = 'upload-open', boxClassName = '', price }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [picked, setPicked] = useState<File | null>(null)
  const [mode, setMode] = useState<'photo' | 'draw'>('photo')
  const [drew, setDrew] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const pad = useRef<DrawPadHandle>(null)
  const kept = useRef(false)
  const sent = useRef<{ key: string; id: string } | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (!open || busy) return // пока файл летит, окно не закрываем: иначе ребёнка внезапно уведёт на экран работы
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [open, busy])

  useEffect(
    () => () => {
      // ушло на экран работы: там фото ещё показывается, пока рисунок оживает
      if (preview && !kept.current) URL.revokeObjectURL(preview)
    },
    [preview],
  )

  // Выбор файла ничего не отправляет: ребёнок сначала видит свой рисунок и сам жмёт кнопку
  function choose(file: File) {
    setErr(file.size > UPLOAD_MAX_BYTES ? 'file_too_large' : null)
    if (file.size > UPLOAD_MAX_BYTES) return
    setPicked(file)
    setPreview(URL.createObjectURL(file)) // только на этом экране, никуда не уходит
  }

  async function send(file: File, url: string) {
    if (busy) return
    setErr(null)
    setBusy(true)
    // тот же файл — тот же request_id (двойной клик, сеть); другой файл или 4xx — новый
    // файл узнаём по имени, размеру и дате: тот же файл, выбранный снова, — тот же запрос
    const key = `${file.name}|${file.size}|${file.lastModified}`
    if (sent.current?.key !== key) sent.current = { key, id: crypto.randomUUID() }
    const form = new FormData()
    form.append('file', file)
    form.append('request_id', sent.current.id)
    try {
      const r = await api<{ id: number }>('/api/works/upload', 'POST', form)
      if (!alive.current) return // экран уже закрыт: не уводим ребёнка со страницы, куда он перешёл
      kept.current = true
      setOpen(false)
      navigate(`/create?work=${r.id}${assignmentId ? `&assignment=${assignmentId}` : ''}`, { state: { drawing: url, auto: true } })
    } catch (x) {
      setErr(x instanceof ApiError && x.status === 503 ? 'upload_busy' : errorKey(x))
      if (x instanceof ApiError && x.status >= 400 && x.status < 500) sent.current = null
    } finally {
      setBusy(false)
    }
  }

  function drop(e: DragEvent) {
    e.preventDefault()
    setOver(false)
    const f = e.dataTransfer.files[0]
    if (f) choose(f)
  }

  async function go() {
    if (mode === 'draw') {
      const f = await pad.current?.toFile()
      if (f) void send(f, URL.createObjectURL(f))
    } else if (picked && preview) void send(picked, preview)
    else input.current?.click()
  }

  const name = t('panel.uploadTitle')
  const ready = mode === 'draw' ? drew : !!picked
  return (
    <div className={`relative ${boxClassName}`}>
      <button
        type="button"
        data-testid={testid}
        aria-expanded={open}
        aria-label={name}
        title={name}
        onClick={() => (guest ? navigate('/login') : setOpen(true))}
        className={className}
      >
        {label ?? (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        )}
      </button>
      {open && createPortal(
        <div
          className="modal-bg fixed inset-0 z-50 flex items-center justify-center bg-scrim p-3"
          onPointerDown={(e) => e.target === e.currentTarget && !busy && setOpen(false)}
        >
          <div
            data-testid="upload-popup"
            role="dialog"
            aria-modal="true"
            aria-label={name}
            className="modal-in max-h-full w-full max-w-[600px] overflow-y-auto rounded-[28px] bg-surface p-4 shadow-pop md:p-5"
          >
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 gap-2" role="tablist">
                {(['photo', 'draw'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    data-testid={`upload-mode-${m}`}
                    disabled={busy}
                    onClick={() => setMode(m)}
                    className={`min-h-11 min-w-0 flex-1 rounded-full px-3 py-1 text-sm font-extrabold leading-tight sm:text-base ${mode === m ? 'bg-primary text-primary-fg' : 'border border-border bg-surface text-heading'}`}
                  >
                    {t(m === 'photo' ? 'panel.modePhoto' : 'panel.modeDraw')}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-label={t('panel.uploadClose')}
                disabled={busy}
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-primary-soft"
              >
                <Icon name="close" />
              </button>
            </div>
            <div className="mx-auto mt-3 aspect-square w-full max-w-[min(100%,calc(100dvh-230px))] overflow-hidden rounded-3xl bg-primary-soft">
              {/* Вкладки только прячем: рисунок не должен стираться, если заглянул на другую вкладку */}
              <div className={`h-full w-full p-2 ${mode === 'draw' ? '' : 'hidden'}`}>
                <DrawPad ref={pad} onDirty={setDrew} />
              </div>
              <label
                onDragOver={(e) => {
                  e.preventDefault()
                  setOver(true)
                }}
                onDragLeave={() => setOver(false)}
                onDrop={drop}
                data-over={over || undefined}
                className={`upload-zone relative h-full w-full cursor-pointer overflow-hidden ${mode === 'photo' ? 'block' : 'hidden'}`}
              >
                <input
                  ref={input}
                  data-testid="upload-input"
                  type="file"
                  accept="image/png,image/jpeg"
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) choose(f)
                  }}
                />
                {preview ? (
                  <img key={preview} src={preview} alt="" data-testid="upload-preview" className="upload-preview absolute inset-0 h-full w-full object-contain p-2" />
                ) : (
                  <img src="/art/upload-hint.webp" alt="" className="upload-art absolute inset-0 h-full w-full object-cover" />
                )}
                {preview && !busy && (
                  <span className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-surface px-4 py-1.5 text-sm font-extrabold text-heading shadow-card">
                    {t('panel.uploadOther')}
                  </span>
                )}
              </label>
            </div>
            {err && (
              <div className="mt-2">
                <ErrorText code={err} />
              </div>
            )}
            <button
              type="button"
              data-testid={ready ? 'upload-send' : 'upload-pick'}
              disabled={busy || (mode === 'draw' && !drew)}
              onClick={() => void go()}
              className="btn-press mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-lg font-extrabold text-primary-fg disabled:opacity-60"
            >
              {busy ? t('panel.uploadSending') : ready || mode === 'draw' ? (
                <>
                  {t('story.hero')}
                  <img src="/art/coin.webp" alt="" className="h-7 w-7" />
                  {price}
                </>
              ) : t('panel.uploadPick')}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
