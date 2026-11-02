import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LANGS, setLang } from '../i18n'
import Icon from './Icon'

// Самоназвания языков не переводятся: человек ищет свой язык, на каком бы ни был открыт экран
const NAMES = { ru: 'Русский', en: 'English', uz: "O'zbekcha" }

export default function LangSwitch() {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div ref={box} className="relative ml-auto">
      <button
        type="button"
        data-testid="lang-toggle"
        aria-label={t('lang.label')}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full lg:h-11 lg:border lg:border-border lg:bg-surface lg:px-3.5 ${
          open ? 'bg-primary-soft text-primary' : 'text-text hover:text-primary lg:hover:border-primary'
        }`}
      >
        <Icon name="globe" />
        <span className="hidden text-sm font-extrabold uppercase lg:inline">{i18n.language}</span>
      </button>
      {open && (
        <div
          role="group"
          aria-label={t('lang.label')}
          className="chip-pop absolute right-0 top-full z-[60] mt-2 flex w-40 flex-col gap-1 rounded-[20px] border border-border bg-surface p-1.5 shadow-pop"
        >
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              data-testid={`lang-${l}`}
              aria-pressed={i18n.language === l}
              onClick={() => {
                setLang(l)
                setOpen(false)
              }}
              className={`flex items-center justify-between rounded-2xl px-3 py-2 text-left text-base font-extrabold ${
                i18n.language === l ? 'bg-primary-soft text-primary' : 'text-heading hover:bg-primary-soft'
              }`}
            >
              {NAMES[l]}
              {i18n.language === l && <Icon name="check" className="h-4 w-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
