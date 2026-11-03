import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { ApiError, api } from '../api'
import type { TemplateInfo } from '../features/works/works'
import type { ShellContext } from './AppShell'
import ChipSelect from './ChipSelect'
import ErrorText, { errorKey } from './ErrorText'
import Icon from './Icon'
import PromptHelper from './PromptHelper'
import UploadPopup from './UploadPopup'
import VoiceButton from './VoiceButton'

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

const roundOn = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-primary md:h-12 md:w-12'

/** Панель создания: на ленте поверх и со всем выбором, на «Создать» в потоке: стиль и загрузка там плитками. Создаёт работу и ведёт на /create?work=<id>. */
export default function CreatePanel({ templates, price, tpl, onTpl, floating, guest, assignmentId }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const shell = useOutletContext<ShellContext | null>()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [helping, setHelping] = useState(false)
  const requestId = useRef<string | null>(null)
  const chosen = templates.find((x) => x.id === tpl)

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
      className={
        floating
          ? 'sticky bottom-[80px] z-20 -mx-2 mb-4 mt-3 w-[calc(100%+16px)] max-w-[835px] rounded-[28px] border border-border bg-surface p-2 shadow-card md:mx-auto md:mb-6 md:w-full md:p-[11px] lg:bottom-6 xl:w-[calc((100%-60px)/6*4+36px)] xl:max-w-none'
          : 'mx-auto mt-2 w-full max-w-[960px] shrink-0 rounded-[28px] border border-border bg-surface p-2 shadow-pop md:mt-4 md:p-[11px]'
      }
    >
      {err && (
        <div className="mb-2">
          <ErrorText code={err} />
        </div>
      )}
      <div className={floating ? 'grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 md:gap-y-2.5' : 'flex flex-wrap items-center gap-2 md:flex-nowrap md:gap-3'}>
        <div className={floating ? 'contents' : 'flex w-full min-w-0 items-center gap-2 md:flex-1 md:gap-3'}>
          {/* На «Создать» стиль выбран плиткой: здесь видно, в каком стиле нарисуем */}
          {!floating && chosen && (
            <img src={chosen.image_url} alt="" data-testid="panel-style-thumb" title={t(`templates.${chosen.id}`)} className="h-12 w-12 shrink-0 rounded-xl object-cover md:h-14 md:w-14 md:rounded-2xl" />
          )}
          <input
            data-testid="prompt-input"
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
            placeholder={t(floating ? 'create.placeholder' : tpl === 'custom' ? 'create.placeholderCustom' : 'create.placeholderIdea')}
            aria-label={t('create.placeholder')}
            className={`w-full min-w-0 rounded-full border border-border bg-bg text-heading outline-none focus:border-primary ${
              floating ? 'h-11 px-4 md:h-[45px]' : 'h-12 px-4 text-base md:h-14 md:px-5 md:text-lg'
            }`}
          />
        </div>
        <button
          type="button"
          data-testid="draw"
          disabled={!guest && (!tpl || sending || (tpl === 'custom' && !text.trim()))}
          onClick={() => void draw()}
          className={`btn-press flex items-center justify-center rounded-2xl bg-primary font-extrabold uppercase text-primary-fg disabled:opacity-60 ${
            floating
              ? 'row-span-2 w-[88px] flex-col gap-1 px-1 text-[11px] md:w-[168px] md:px-0 md:text-xl'
              : 'order-last h-12 flex-1 gap-2 px-5 text-base md:h-14 md:flex-none md:text-lg'
          }`}
        >
          {t('create.draw')}
          <span className="flex items-center gap-1">
            <img src="/art/coin.webp" alt="" className="h-6 w-6 md:h-8 md:w-8" />
            <span data-testid="price" className="text-base md:text-xl">{price ?? ''}</span>
          </span>
        </button>
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          <VoiceButton
            guest={guest}
            className={roundOn}
            onError={setErr}
            onText={(v) => {
              setErr(null)
              setText(v.slice(0, 200))
            }}
          />
          {floating && <UploadPopup guest={guest} className={roundOn} assignmentId={assignmentId} price={price} />}
          <button
            type="button"
            data-testid="prompt-help"
            aria-label={t('ideas.open')}
            onClick={() => (guest ? navigate('/login') : setHelping(true))}
            className={`${roundOn} md:w-auto md:gap-2 md:px-4 md:text-sm md:font-extrabold`}
          >
            <Icon name="wand" />
            <span className="hidden md:inline">{t('ideas.open')}</span>
          </button>
          {floating && (
            <ChipSelect
              testid="panel-style"
              label={t('panel.style')}
              value={tpl ?? ''}
              onChange={onTpl}
              options={templates.map((x) => ({ value: x.id, label: t(`templates.${x.id}`), thumb: x.image_url }))}
              className="h-11 min-w-0 flex-1 [&_button]:text-[0px] md:h-12 md:flex-initial md:[&_button]:text-base"
            />
          )}
        </div>
      </div>
      {helping && (
        <PromptHelper
          onClose={() => setHelping(false)}
          onDone={(phrase) => {
            setErr(null)
            setText(phrase.slice(0, 200))
            setHelping(false)
          }}
        />
      )}
    </div>
  )
}
