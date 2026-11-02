import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { VOICE_MAX_SECONDS, recordingToWav } from '../features/voice/wav'
import { errorKey } from './ErrorText'

type Props = {
  guest?: boolean
  /** Текст расшифровки: попадает в поле на проверку ребёнку, сам по себе ничего не запускает. */
  onText: (text: string) => void
  /** Код ошибки для ErrorText; null — убрать прежнюю. */
  onError: (code: string | null) => void
  className: string
}

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

/** Кнопка голоса: запись MediaRecorder, стоп по клику или через 30 с, WAV 16 кГц на /api/voice/transcribe. */
export default function VoiceButton({ guest, onText, onError, className }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [state, setState] = useState<'idle' | 'rec' | 'busy'>('idle')
  const [secs, setSecs] = useState(0)
  const mr = useRef<MediaRecorder | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const alive = useRef(true)
  const starting = useRef(false)

  const release = useCallback(() => {
    clearInterval(timer.current)
    const r = mr.current
    mr.current = null
    if (r) {
      r.onstop = null
      if (r.state !== 'inactive') r.stop()
      r.stream.getTracks().forEach((x) => x.stop()) // отпускаем микрофон
    }
  }, [])

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      release()
    }
  }, [release])

  async function transcribe(chunks: Blob[], type: string) {
    try {
      const blob = new Blob(chunks, { type })
      let wav: Blob
      try {
        if (blob.size === 0) throw new Error('empty')
        wav = await recordingToWav(blob)
      } catch {
        if (alive.current) onError('bad_audio') // пустая или нечитаемая запись
        return
      }
      const form = new FormData()
      form.append('audio', wav, 'voice.wav')
      const r = await api<{ text: string }>('/api/voice/transcribe', 'POST', form)
      if (alive.current) onText(r.text)
    } catch (x) {
      if (alive.current) onError(errorKey(x))
    } finally {
      if (alive.current) setState('idle')
    }
  }

  function stop() {
    clearInterval(timer.current)
    mr.current?.stop() // дальше onstop
  }

  async function start() {
    if (guest) return navigate('/login')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return onError('voice_unsupported')
    if (starting.current || mr.current) return // второй клик, пока микрофон запрашивается или идёт запись
    starting.current = true
    try {
      onError(null)
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch (x) {
        const name = x instanceof DOMException ? x.name : ''
        return onError(name === 'NotAllowedError' ? 'mic_denied' : name === 'NotFoundError' ? 'mic_missing' : 'generic')
      }
      if (!alive.current) return stream.getTracks().forEach((x) => x.stop())
      const chunks: Blob[] = []
      let r: MediaRecorder
      try {
        r = new MediaRecorder(stream)
        mr.current = r
        r.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
        const t0 = Date.now()
        const id = window.setInterval(() => {
          const s = Math.floor((Date.now() - t0) / 1000)
          setSecs(s)
          if (s >= VOICE_MAX_SECONDS && r.state !== 'inactive') r.stop() // свой рекордер: на новую запись не влияет
        }, 250)
        timer.current = id
        r.onstop = () => {
          clearInterval(id)
          stream.getTracks().forEach((x) => x.stop())
          if (mr.current === r) mr.current = null
          setState('busy')
          void transcribe(chunks, r.mimeType)
        }
        r.start()
      } catch {
        clearInterval(timer.current)
        mr.current = null
        stream.getTracks().forEach((x) => x.stop()) // микрофон не держим
        return onError('voice_unsupported')
      }
      setSecs(0)
      setState('rec')
    } finally {
      starting.current = false
    }
  }

  const rec = state === 'rec'
  const busy = state === 'busy'
  const name = t(rec ? 'panel.voiceStop' : busy ? 'panel.voiceListening' : 'panel.voiceStart')
  return (
    <button
      type="button"
      data-testid="voice"
      data-state={state}
      disabled={busy}
      aria-pressed={rec}
      aria-label={name}
      title={name}
      onClick={() => (rec ? stop() : void start())}
      className={`${className} relative ${rec || busy ? '!w-auto gap-2 px-3' : ''} ${rec ? 'border-primary' : ''}`}
    >
      {rec && <span aria-hidden="true" className="absolute inset-0 animate-ping rounded-full border-2 border-primary motion-reduce:animate-none" />}
      {rec ? (
        <span aria-hidden="true" className="flex h-6 items-center gap-[3px]">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="voice-bar w-[3px] rounded-full bg-primary-light" style={{ animationDelay: `${i * 0.12}s` }} />
          ))}
        </span>
      ) : (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <rect x="9" y="3" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      )}
      {rec && (
        <span data-testid="voice-timer" className="text-sm font-extrabold tabular-nums text-heading">
          {mmss(secs)}
        </span>
      )}
      {busy && <span className="animate-pulse text-sm font-extrabold text-heading">{t('panel.voiceListening')}</span>}
    </button>
  )
}
