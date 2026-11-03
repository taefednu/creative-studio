import { useTranslation } from 'react-i18next'
import { weekBars } from '../features/review/week'

/** Маленький график «работ в день» за 7 дней: столбик на ровной дорожке, сегодня выделен; день считает браузер. */
export default function WeekChart({ readyAt }: { readyAt: string[] }) {
  const { t } = useTranslation()
  const bars = weekBars(readyAt, new Date())
  const top = Math.max(1, ...bars.map((b) => b.count))
  return (
    <div data-testid="week-chart" role="img" aria-label={t('cab.week.chart')} className="grid grid-cols-7 gap-2">
      {bars.map((b, i) => {
        const today = i === bars.length - 1
        return (
          <div key={b.key} className="flex flex-col items-center gap-1.5">
            <span className={`text-xs font-extrabold leading-none ${b.count ? 'text-heading' : 'text-transparent'}`}>{b.count}</span>
            <div className="flex h-20 w-full max-w-[28px] items-end overflow-hidden rounded-full bg-surface">
              {b.count > 0 && (
                <div data-testid={`week-bar-${i}`} data-count={b.count} style={{ height: `${Math.max(28, Math.round((b.count / top) * 100))}%` }} className="w-full rounded-full bg-primary" />
              )}
            </div>
            <span className={`text-xs font-bold leading-none ${today ? 'text-primary' : 'text-muted'}`}>{t(`weekday.${b.weekday}`)}</span>
          </div>
        )
      })}
    </div>
  )
}
