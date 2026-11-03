import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { createGate, rmsOf } from '../features/voice/vad'
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

const TICK_MS = 50
const BARS = [0.6, 0.9, 1, 0.8, 0.55]

/**
 * Кнопка голоса. Микрофон открывается не сразу, поэтому «Говори!» появляется, только когда запись уже идёт: иначе пропадает
 * начало фразы. Замолчал — запись заканчивается сама. Палочки двигаются от настоящего голоса: видно, что микрофон слышит.
 * WAV 16 кГц без тишины по краям уходит на /api/voice/transcribe.
 */
export default function VoiceButton({ guest, onText, onError, className }: Props) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [state, setState] = useState<'idle' | 'starting' | 'rec' | 'busy'>('idle')
  const mr = useRef<MediaRecorder | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const audio = useRef<AudioContext | null>(null)
  const bars = useRef<(HTMLSpanElement | null)[]>([])
  const alive = useRef(true)
  const starting = useRef(false)

  const closeMeter = useCallback(() => {
    clearInterval(timer.current)
    void audio.current?.close()
    audio.current = null
  }, [])

  const release = useCallback(() => {
    closeMeter()
    const r = mr.current
    mr.current = null
    if (r) {
      r.onstop = null
      if (r.state !== 'inactive') r.stop()
      r.stream.getTracks().forEach((x) => x.stop()) // отпускаем микрофон
    }
  }, [closeMeter])

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
      let wav: Blob | null
      try {
        wav = blob.size === 0 ? null : await recordingToWav(blob) // ткнули и сразу отпустили: записи ещё нет
      } catch {
        if (alive.current) onError('bad_audio') // нечитаемая запись
        return
      }
      if (!wav) {
        if (alive.current) onError('no_speech') // тишина: модель не зовём и не ждём
        return
      }
      const form = new FormData()
      form.append('audio', wav, 'voice.wav')
      form.append('lang', i18n.language) // говорит на языке экрана, а не на том, что выбрал при регистрации
      const r = await api<{ text: string }>('/api/voice/transcribe', 'POST', form)
      if (alive.current) onText(r.text)
    } catch (x) {
      if (alive.current) onError(errorKey(x))
    } finally {
      if (alive.current) setState('idle')
    }
  }

  function stop() {
    closeMeter()
    mr.current?.stop() // дальше onstop
  }

  /** Громкость каждые TICK_MS: двигает палочки и решает, не пора ли заканчивать. */
  function watch(stream: MediaStream, r: MediaRecorder) {
    const ctx = new AudioContext()
    audio.current = ctx
    void ctx.resume()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Float32Array(analyser.fftSize)
    const gate = createGate()
    const t0 = Date.now()
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    timer.current = window.setInterval(() => {
      analyser.getFloatTimeDomainData(buf)
      const rms = rmsOf(buf)
      if (!calm) {
        BARS.forEach((k, i) => {
          const el = bars.current[i]
          if (el) el.style.transform = `scaleY(${Math.min(1, 0.2 + rms * 5 * k).toFixed(2)})`
        })
      }
      // Так и не заговорили — тоже стоп: тишину отсечёт recordingToWav, а тихий голос в шумном классе дойдёт до модели
      if ((gate(rms, TICK_MS) === 'stop' || Date.now() - t0 >= VOICE_MAX_SECONDS * 1000) && r.state !== 'inactive') {
        closeMeter()
        r.stop()
      }
    }, TICK_MS)
  }

  async function start() {
    if (guest) return navigate('/login')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return onError('voice_unsupported')
    if (starting.current || mr.current) return // второй клик, пока микрофон запрашивается или идёт запись
    starting.current = true
    setState('starting')
    try {
      onError(null)
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
      } catch (x) {
        const name = x instanceof DOMException ? x.name : ''
        setState('idle')
        return onError(name === 'NotAllowedError' ? 'mic_denied' : name === 'NotFoundError' ? 'mic_missing' : 'generic')
      }
      if (!alive.current) return stream.getTracks().forEach((x) => x.stop())
      const chunks: Blob[] = []
      try {
        const r = new MediaRecorder(stream)
        mr.current = r
        r.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
        r.onstart = () => setState('rec')
        r.onstop = () => {
          closeMeter()
          stream.getTracks().forEach((x) => x.stop())
          if (mr.current === r) mr.current = null
          setState('busy')
          void transcribe(chunks, r.mimeType)
        }
        r.start()
        watch(stream, r)
      } catch {
        release() // без onstop: иначе поверх этой ошибки придёт другая
        stream.getTracks().forEach((x) => x.stop()) // микрофон не держим
        setState('idle')
        return onError('voice_unsupported')
      }
    } finally {
      starting.current = false
    }
  }

  const rec = state === 'rec'
  const wide = state !== 'idle'
  const name = t(rec ? 'panel.voiceStop' : state === 'busy' ? 'panel.voiceThinking' : state === 'starting' ? 'panel.voiceWait' : 'panel.voiceStart')
  return (
    <button
      type="button"
      data-testid="voice"
      data-state={state}
      disabled={state === 'busy' || state === 'starting'}
      aria-pressed={rec}
      aria-label={name}
      title={name}
      onClick={() => (rec ? stop() : void start())}
      className={`${className} relative ${wide ? '!w-auto gap-2 px-3 md:!w-auto md:px-4' : ''} ${rec ? 'border-primary' : ''}`}
    >
      {rec ? (
        <span aria-hidden="true" className="flex h-6 items-center gap-[3px]">
          {BARS.map((_, i) => (
            <span
              key={i}
              ref={(el) => {
                bars.current[i] = el
              }}
              className="h-6 w-[3px] origin-center scale-y-[0.2] rounded-full bg-primary"
            />
          ))}
        </span>
      ) : (
        <svg viewBox="0 0 24 24" className={`h-6 w-6 shrink-0 ${wide ? 'animate-pulse motion-reduce:animate-none' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <rect x="9" y="3" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      )}
      {wide && (
        <span data-testid="voice-word" aria-live="polite" className="whitespace-nowrap text-sm font-extrabold text-heading">
          {t(rec ? 'panel.voiceSpeak' : state === 'busy' ? 'panel.voiceThinking' : 'panel.voiceWait')}
        </span>
      )}
    </button>
  )
}
