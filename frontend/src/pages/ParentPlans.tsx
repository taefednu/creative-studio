import { useTranslation } from 'react-i18next'
import { api } from '../api'
import CabinetHeader from '../components/CabinetHeader'
import { useLoad } from '../useLoad'

type Tariffs = { purchase_available: boolean; packs: { id: string; coins: number; price_usd: number }[] }

const loadTariffs = () => api<Tariffs>('/api/parent/tariffs')
const COINS = ['small', 'mid', 'big'] // картинка по порядку пакета: чем дальше, тем больше стопка
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }) // цена в долларах, формат един на всех языках

/** Тарифы: числа и цены из данных, покупки нет, платёжных полей нет. */
export default function ParentPlans() {
  const { t } = useTranslation()
  const [data] = useLoad(loadTariffs)
  return (
    <div className="min-h-screen bg-bg pb-24 lg:pb-6">
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
        {data && data.packs.length === 0 && <p className="text-muted">{t('cab.plans.empty')}</p>}
        <div className="grid items-stretch gap-4 md:grid-cols-3 big:gap-5" data-testid="plans">
          {data?.packs.map((p, i) => (
            <div
              key={p.id}
              data-testid="plan-card"
              className={`flex flex-col items-center rounded-card border bg-surface px-4 pb-5 pt-4 shadow-card big:px-8 big:pb-9 big:pt-6 ${
                i === 1 ? 'border-2 border-primary' : 'border-border'
              }`}
            >
              <img src={`/art/coins-${COINS[Math.min(i, 2)]}.webp`} alt="" className="h-32 short:h-24 w-full object-contain big:h-[198px]" />
              <p className="mt-2 text-6xl font-extrabold leading-none text-heading big:text-[104px]">{p.coins}</p>
              <p className="mt-1 text-2xl font-extrabold text-primary big:text-[40px]">{t('pl.word', { count: p.coins })}</p>
              <p className="mt-3 text-3xl font-extrabold text-heading big:text-[44px]">{money.format(p.price_usd)}</p>
              
            </div>
          ))}
        </div>
        <section data-testid="plans-lessons" className="flex items-center gap-4 rounded-card border border-border bg-surface p-4 shadow-card big:h-[177px] big:gap-10 big:px-10 big:py-3">
          <img src="/art/robot-happy.webp" alt="" className="h-24 w-24 short:h-16 short:w-16 shrink-0 object-contain big:h-[150px] big:w-[200px]" />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-extrabold text-heading big:text-[40px] big:leading-[48px]">{t('pl.lessonsTitle')}</h2>
            <p className="mt-1 text-base text-text big:max-w-[640px] big:text-[26px] big:leading-8">{t('pl.lessonsText')}</p>
          </div>
          <img src="/art/coins-small.webp" alt="" className="hidden short:!hidden h-28 w-44 shrink-0 object-contain md:block big:h-[150px] big:w-[300px]" />
        </section>
      </main>
    </div>
  )
}
