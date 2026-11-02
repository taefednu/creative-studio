type T = (key: string, opts?: Record<string, unknown>) => string

const pad = (n: number) => String(n).padStart(2, '0')
/** YYYY-MM-DD по местному календарю: то, что понимает dueIso. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** «Пт, 8 ноя»: дни и месяцы берём из i18n, потому что Intl в браузере может не знать узбекский. */
export const dateLabel = (d: Date, t: T) =>
  t('cal.date', { wd: t(`weekday.${d.getDay()}`), d: d.getDate(), m: t(`cal.month.${d.getMonth()}`) })

/** Пресеты срока для выпадающего списка: значение — день (или '' без срока), подпись с настоящей датой. */
export function duePresets(now: Date, t: T): { value: string; label: string }[] {
  const at = (n: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + n)
  const row = (n: number, key: string) => ({ value: dayKey(at(n)), label: `${t(key)} · ${dateLabel(at(n), t)}` })
  return [row(0, 'tt.today'), row(1, 'tt.tomorrow'), row(3, 'tt.in3'), row(7, 'tt.week'), { value: '', label: t('tt.none') }]
}

/** Образец для карточки без сданной работы: шаблон выбираем по id, чтобы картинка не прыгала между показами. */
export function sampleFor(id: number, list: { image_url: string }[]): string | null {
  return list.length ? list[Math.abs(id) % list.length].image_url : null
}
