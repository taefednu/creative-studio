import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { IDEA_STEPS, ideaArt } from '../features/works/promptIdeas'
import type { IdeaStep } from '../features/works/promptIdeas'
import ErrorText from './ErrorText'
import Icon from './Icon'
import VoiceButton from './VoiceButton'

type Props = { onClose: () => void; onDone: (phrase: string) => void }

// Подсказка в поле: пример из словаря идей
const EXAMPLE: Record<IdeaStep, string> = { who: 'dragon', where: 'moon', what: 'fly' }

/**
 * «Помоги придумать»: робот спрашивает кто → где → что делает, ребёнок отвечает картинкой, текстом или голосом, фраза складывается на глазах.
 * Монету не тратит: только заполняет поле, рисует ребёнок сам. Текст дальше проходит ту же проверку, что и написанный руками.
 * Портал: на ленте панель создания сдвинута transform, и fixed внутри неё считался бы от панели.
 */
export default function PromptHelper({ onClose, onDone }: Props) {
  const { t } = useTranslation()
  const [picked, setPicked] = useState<Partial<Record<IdeaStep, string>>>({})
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const step = IDEA_STEPS.find((s) => !picked[s])

  function answer(e: FormEvent) {
    e.preventDefault()
    if (step && draft.trim()) setPicked({ ...picked, [step]: draft.trim() })
    setDraft('')
    setErr(null)
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])

  const phrase = () =>
    t('ideas.phrase', {
      who: picked.who,
      where: picked.where,
      what: picked.what,
      interpolation: { escapeValue: false },
    })

  return createPortal(
    <div
      data-testid="helper-bg"
      className="modal-bg fixed inset-0 z-50 flex items-center justify-center bg-scrim p-3"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('ideas.open')}
        data-testid="helper"
        className="modal-in max-h-full w-full max-w-[600px] overflow-y-auto rounded-[28px] bg-surface p-4 shadow-pop md:p-6"
      >
        <div className="flex items-center gap-3">
          <img src="/art/robot-wave.webp" alt="" className="h-12 w-12 shrink-0 object-contain" />
          <p data-testid="helper-title" className="min-w-0 flex-1 text-lg font-extrabold text-heading md:text-xl">
            {t(step ? `ideas.ask.${step}` : 'ideas.ready')}
          </p>
          <button
            type="button"
            data-testid="helper-close"
            aria-label={t('ideas.close')}
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-primary-soft"
          >
            <Icon name="close" />
          </button>
        </div>

        {/* Три шага видны всегда: так ребёнок запоминает, из чего состоит хороший запрос. Нажатый шаг можно выбрать заново */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {IDEA_STEPS.map((s) => (
            <button
              key={s}
              type="button"
              data-testid={`helper-slot-${s}`}
              disabled={!picked[s]}
              onClick={() => {
                setPicked({ ...picked, [s]: undefined })
                setDraft(picked[s] ?? '')
              }}
              className={`min-h-12 rounded-2xl border px-2 py-1 text-sm font-extrabold ${
                s === step
                  ? 'border-primary bg-primary-soft text-primary'
                  : picked[s]
                    ? 'border-border bg-surface text-heading'
                    : 'border-border bg-bg text-muted'
              }`}
            >
              {picked[s] ?? t(`ideas.slot.${s}`)}
            </button>
          ))}
        </div>

        {step ? (
          <form onSubmit={answer} className="mt-3">
            <div className="grid grid-cols-4 gap-2">
              {ideaArt(step).map(({ id, src }) => (
                <button
                  key={id}
                  type="button"
                  data-testid={`idea-${step}-${id}`}
                  onClick={() => {
                    setPicked({ ...picked, [step]: t(`ideas.${step}.${id}`) })
                    setDraft('')
                    setErr(null)
                  }}
                  className="flex flex-col items-center gap-1 rounded-2xl border border-border bg-surface p-1 text-center text-xs font-bold text-heading transition-transform hover:border-primary active:scale-95 motion-reduce:transition-none md:text-sm"
                >
                  <img src={src} alt="" className="aspect-square w-full rounded-xl object-cover" />
                  <span className="min-h-8 leading-4">{t(`ideas.${step}.${id}`)}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                key={step}
                data-testid="helper-input"
                value={draft}
                maxLength={60}
                autoFocus={window.matchMedia('(pointer: fine)').matches}
                autoComplete="off"
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t('ideas.example', { word: t(`ideas.${step}.${EXAMPLE[step]}`) })}
                aria-label={t(`ideas.ask.${step}`)}
                className="h-14 w-full min-w-0 flex-1 rounded-full border border-border bg-bg px-5 text-lg text-heading outline-none focus:border-primary"
              />
              <VoiceButton
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-primary"
                onError={setErr}
                onText={(v) => {
                  setErr(null)
                  setDraft(v.slice(0, 60))
                }}
              />
            </div>
            <ErrorText code={err} />
            <button
              type="submit"
              data-testid="helper-next"
              disabled={!draft.trim()}
              className="btn-press mt-4 h-12 w-full rounded-full bg-primary font-extrabold text-primary-fg disabled:opacity-50"
            >
              {t('ideas.next')}
            </button>
          </form>
        ) : (
          <div className="mt-4">
            <p data-testid="helper-phrase" className="rounded-2xl bg-primary-soft p-4 text-center text-xl font-extrabold text-heading">
              {phrase()}
            </p>
            <p className="mt-3 text-center text-sm font-bold text-muted">{t('ideas.lesson')}</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                data-testid="helper-again"
                onClick={() => {
                  setPicked({})
                  setDraft('')
                }}
                className="flex-1 rounded-full border border-border bg-surface py-3 font-extrabold text-heading"
              >
                {t('ideas.again')}
              </button>
              <button
                type="button"
                data-testid="helper-done"
                onClick={() => onDone(phrase())}
                className="flex-[2] rounded-full bg-primary py-3 font-extrabold text-primary-fg"
              >
                {t('ideas.done')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
