import { PlansSkeleton } from '../components/Skeletons'
import LoadFailed from '../components/LoadFailed'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import CabinetHeader from '../components/CabinetHeader'
import { loadTemplates } from '../features/works/works'
import { useLoad } from '../useLoad'

type Tariffs = { purchase_available: boolean; packs: { id: string; coins: number; price_usd: number }[] }

const loadTariffs = () => api<Tariffs>('/api/parent/tariffs')
const COINS = ['small', 'mid', 'big'] // картинка по порядку пакета: чем дальше, тем больше стопка
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }) // цена в долларах, формат един на всех языках

/** Тарифы: числа и цены из данных, покупки нет, платёжных полей нет. */
export default function ParentPlans() {
  const { t } = useTranslation()
  const [data, reload, failed] = useLoad(loadTariffs)
  const [tpl] = useLoad(loadTemplates)
  const price = tpl?.price
  return (
    <div className="min-h-screen bg-bg pb-24 lg:pb-0">
      <CabinetHeader role="parent" />
      <main className="flex flex-col gap-3 px-4 py-4 md:px-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 data-testid="page-title" className="w-fit text-[30px] font-extrabold leading-9 text-heading lg:text-4xl lg:leading-10">
            {t('cab.plans.title')}
          </h1>
          <p data-testid="plans-chip" className="rounded-full bg-primary-soft px-4 py-1.5 text-sm font-extrabold text-primary big:px-5 big:py-2 big:text-xl">
            {t('pl.soonChip')}
          </p>
        </div>
        {failed && !data && <LoadFailed onRetry={reload} />}
        {!failed && !data && <PlansSkeleton />}
        {data && data.packs.length === 0 && <p className="text-muted">{t('cab.plans.empty')}</p>}
        <div data-testid="plans" className="empty:hidden stagger mx-auto w-full max-w-[720px] divide-y divide-border rounded-card border border-border bg-surface px-4 shadow-card">
          {data?.packs.map((p, i) => (
            <div key={p.id} data-testid="plan-card" className="flex items-center gap-4 py-3">
              <img src={`/art/coins-${COINS[Math.min(i, 2)]}.webp`} alt="" className="h-16 w-16 shrink-0 object-contain" />
              <div className="min-w-0 flex-1">
                <p className="text-xl font-extrabold text-heading">{p.coins} {t('pl.word', { count: p.coins })}</p>
                {!!price && <p className="text-sm text-muted">{t('pl.enough', { n: Math.floor(p.coins / price) })}</p>}
              </div>
              <p className="text-2xl font-extrabold text-heading">{money.format(p.price_usd)}</p>
            </div>
          ))}
        </div>
        <section data-testid="plans-lessons" className="mx-auto flex w-full max-w-[720px] items-center gap-4 rounded-card border border-border bg-surface p-4 shadow-card">
          <img src="/art/robot-happy.webp" alt="" className="h-24 w-24 short:h-16 short:w-16 shrink-0 object-contain" />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-extrabold text-heading">{t('pl.lessonsTitle')}</h2>
            <p className="mt-1 text-base text-text">{t('pl.lessonsText')}</p>
          </div>
        </section>
      </main>
    </div>
  )
}
