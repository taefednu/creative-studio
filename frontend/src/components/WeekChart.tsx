import { useTranslation } from 'react-i18next'
import { weekBars } from '../features/review/week'

/** Маленький график «работ в день» за 7 дней по меткам готовых работ; день считает браузер. */
export default function WeekChart({ readyAt }: { readyAt: string[] }) {
  const { t } = useTranslation()
  const bars = weekBars(readyAt, new Date())
  const top = Math.max(1, ...bars.map((b) => b.count))
  return (
    <div data-testid="week-chart" role="img" aria-label={t('cab.week.chart')} className="grid max-w-[360px] grid-cols-7 gap-1.5">
      {bars.map((b, i) => (
        <div key={b.key} className="flex flex-col items-center gap-1">
          <div className="flex h-16 w-full flex-col items-center justify-end gap-0.5">
            {b.count > 0 && <span className="text-[11px] font-extrabold leading-none text-heading">{b.count}</span>}
            <div
              data-testid={`week-bar-${i}`}
              data-count={b.count}
              style={{ height: b.count ? `${Math.max(14, Math.round((b.count / top) * 48))}px` : '4px' }}
              className={`w-full max-w-[14px] rounded-full ${b.count ? 'bg-primary' : 'bg-surface'}`}
            />
          </div>
          <span className="text-[11px] font-bold leading-none text-text">{t(`weekday.${b.weekday}`)}</span>
        </div>
      ))}
    </div>
  )
}
