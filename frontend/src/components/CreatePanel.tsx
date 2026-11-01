import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { ApiError, api } from '../api'
import type { TemplateInfo } from '../features/works/works'
import type { ShellContext } from './AppShell'
import ChipSelect from './ChipSelect'
import ErrorText, { errorKey } from './ErrorText'

type Props = {
  templates: TemplateInfo[]
  price: number | undefined
  tpl: string | null
  onTpl: (id: string) => void
  floating?: boolean
  /** Гость витрины: все контролы ведут на вход, ничего не отправляется. */
  guest?: boolean
  /** Задание, по которому рисуем: уходит дальше в ссылку на экран работы. */
  assignmentId?: number | null
}

const chip = 'hidden h-11 items-center rounded-full border border-border bg-surface px-4 text-sm font-extrabold text-heading md:inline-flex md:h-12 md:text-base'
const roundOn = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-primary md:h-12 md:w-12'
const round = `${roundOn} opacity-50`

/** Панель создания: одна на ленте (поверх) и на «Создать» (в потоке). Создаёт работу и ведёт на /create?work=<id>. */
export default function CreatePanel({ templates, price, tpl, onTpl, floating, guest, assignmentId }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const shell = useOutletContext<ShellContext | null>()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const requestId = useRef<string | null>(null)

  // тот же запрос с теми же полями — тот же request_id (двойной клик, сеть); правка полей — новый запрос
  useEffect(() => {
    requestId.current = null
  }, [tpl, text])

  async function draw() {
    if (guest) return navigate('/login')
    if (!tpl || sending) return
    setSending(true)
    setErr(null)
    requestId.current ??= crypto.randomUUID()
    try {
      const r = await api<{ id: number }>('/api/works', 'POST', {
        template_id: tpl,
        text: text.trim() || null,
        request_id: requestId.current,
      })
      shell?.reloadMe()
      navigate(`/create?work=${r.id}${assignmentId ? `&assignment=${assignmentId}` : ''}`)
    } catch (x) {
      setErr(errorKey(x))
      // 4xx — сервер запрос отверг; сеть и 5xx — работа могла создаться, id оставляем
      if (x instanceof ApiError && x.status >= 400 && x.status < 500) requestId.current = null
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      data-testid="create-panel"
      className={`max-w-[835px] rounded-[28px] border border-border bg-surface p-2 shadow-card md:p-[11px] ${
        floating ? 'fixed bottom-[80px] left-1/2 z-20 w-[calc(100%-16px)] -translate-x-1/2 lg:bottom-6' : 'sticky bottom-[80px] z-20 -mx-2 mt-3 w-[calc(100%+16px)] md:mt-[15px] md:mx-auto md:w-full lg:static'
      }`}
    >
      {err && (
        <div className="mb-2">
          <ErrorText code={err} />
        </div>
      )}
      <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 md:gap-y-2.5">
        <input
          data-testid="prompt-input"
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('create.placeholder')}
          aria-label={t('create.placeholder')}
          className="h-11 w-full min-w-0 rounded-full border border-border bg-bg px-4 text-heading outline-none focus:border-primary md:h-[45px]"
        />
        <button
          type="button"
          data-testid="draw"
          disabled={!guest && (!tpl || sending)}
          onClick={() => void draw()}
          className="row-span-2 flex w-[88px] flex-col items-center justify-center gap-1 rounded-2xl bg-primary px-1 text-[11px] md:px-0 font-extrabold uppercase text-primary-fg shadow-card disabled:opacity-60 md:w-[168px] md:text-xl"
        >
          {t('create.draw')}
          <span className="flex items-center gap-1">
            <img src="/art/coin.webp" alt="" className="h-6 w-6 md:h-8 md:w-8" />
            <span data-testid="price" className="text-base md:text-xl">{price ?? ''}</span>
          </span>
        </button>
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          <button type="button" data-testid="voice" disabled={!guest} onClick={() => guest && navigate('/login')} title={t(guest ? 'showcase.loginToCreate' : 'create.voiceSoon')} aria-label={t(guest ? 'showcase.loginToCreate' : 'create.voiceSoon')} className={guest ? roundOn : round}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <rect x="9" y="3" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
          </button>
          <button type="button" data-testid="upload-open" disabled={!guest} onClick={() => guest && navigate('/login')} title={t(guest ? 'showcase.loginToCreate' : 'panel.uploadSoon')} aria-label={t(guest ? 'showcase.loginToCreate' : 'panel.uploadSoon')} className={guest ? roundOn : round}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <span className={chip}>{t('panel.model')}</span>
          <ChipSelect
            testid="panel-style"
            label={t('panel.style')}
            value={tpl ?? ''}
            onChange={onTpl}
            options={templates.map((x) => ({ value: x.id, label: t(`templates.${x.id}`) }))}
            className="h-11 min-w-0 flex-1 md:h-12 md:flex-none"
          />
          <span className={chip}>{t('panel.format')}</span>
        </div>
      </div>
    </div>
  )
}
