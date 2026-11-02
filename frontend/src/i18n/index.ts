import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import ru from './ru.json'
import uz from './uz.json'

export const LANGS = ['ru', 'en', 'uz'] as const
export type Lang = (typeof LANGS)[number]
const KEY = 'studio.lang'

function saved(): Lang {
  try {
    const v = localStorage.getItem(KEY)
    if (v && (LANGS as readonly string[]).includes(v)) return v as Lang
  } catch {
    /* localStorage недоступен */
  }
  return 'ru'
}

export function setLang(l: Lang) {
  void i18n.changeLanguage(l)
  try {
    localStorage.setItem(KEY, l)
  } catch {
    /* ignore */
  }
}

void i18n.use(initReactI18next).init({
  resources: { ru: { translation: ru }, en: { translation: en }, uz: { translation: uz } },
  lng: saved(),
  fallbackLng: 'ru',
  interpolation: { escapeValue: false },
})

// Заголовок и описание вкладки на языке интерфейса: их видят поисковики и закладки
function applyLang() {
  document.documentElement.lang = i18n.language
  document.title = i18n.t('seo.title')
  document.querySelector('meta[name="description"]')?.setAttribute('content', i18n.t('seo.description'))
}
i18n.on('languageChanged', applyLang)
if (typeof document !== 'undefined') applyLang()

export default i18n
