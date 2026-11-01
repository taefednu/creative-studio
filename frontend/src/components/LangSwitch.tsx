import { useTranslation } from 'react-i18next'
import { LANGS, setLang } from '../i18n'

export default function LangSwitch() {
  const { t, i18n } = useTranslation()
  return (
    <div className="ml-auto flex gap-1" role="group" aria-label={t('lang.label')}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          data-testid={`lang-${l}`}
          aria-pressed={i18n.language === l}
          onClick={() => setLang(l)}
          className={`rounded-full px-3 py-1 text-xs font-extrabold uppercase ${
            i18n.language === l ? 'bg-primary-soft text-primary' : 'text-muted'
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
