import { parseUtc } from './review'

/** key — календарный день YYYY-MM-DD, weekday — 0 (вс) … 6 (сб). */
export type Bar = { key: string; weekday: number; count: number }

const dayKey = (d: Date, tz?: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d)

/**
 * 7 календарных дней до сегодня включительно; день считает браузер (tz — пояс, по умолчанию местный).
 * Дни считаются по календарю, а не вычитанием 24 часов: перевод часов не сдвигает и не склеивает дни.
 */
export function weekBars(readyAt: string[], now: Date, tz?: string): Bar[] {
  const [y, m, d] = dayKey(now, tz).split('-').map(Number)
  const bars: Bar[] = []
  for (let i = 6; i >= 0; i--) {
    const day = new Date(Date.UTC(y, m - 1, d - i))
    bars.push({ key: day.toISOString().slice(0, 10), weekday: day.getUTCDay(), count: 0 })
  }
  for (const iso of readyAt) {
    const bar = bars.find((b) => b.key === dayKey(parseUtc(iso), tz))
    if (bar) bar.count++
  }
  return bars
}
