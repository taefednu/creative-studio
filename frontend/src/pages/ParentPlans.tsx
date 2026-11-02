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
      <main className="flex flex-col gap-4 px-4 py-4 md:px-11">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 data-testid="page-title" className="w-fit text-[30px] font-extrabold leading-9 text-heading lg:text-[54px] lg:leading-[50px]">
            {t('cab.plans.title')}
          </h1>
          <p data-testid="plans-chip" className="rounded-full bg-primary-soft px-4 py-1.5 text-sm font-extrabold text-primary 2xl:px-5 2xl:py-2 2xl:text-xl">
            {t('pl.soonChip')}
          </p>
        </div>
        {data && data.packs.length === 0 && <p className="text-muted">{t('cab.plans.empty')}</p>}
        <div className="grid items-stretch gap-4 md:grid-cols-3 2xl:gap-5" data-testid="plans">
          {data?.packs.map((p, i) => (
            <div
              key={p.id}
              data-testid="plan-card"
              className={`flex flex-col items-center rounded-card border bg-surface px-4 pb-5 pt-4 shadow-card 2xl:px-8 2xl:pb-9 2xl:pt-6 ${
                i === 1 ? 'border-2 border-primary' : 'border-border'
              }`}
            >
              <img src={`/art/coins-${COINS[Math.min(i, 2)]}.webp`} alt="" className="h-32 w-full object-contain 2xl:h-[198px]" />
              <p className="mt-2 text-6xl font-extrabold leading-none text-heading 2xl:text-[104px]">{p.coins}</p>
              <p className="mt-1 text-2xl font-extrabold text-primary 2xl:text-[40px]">{t('pl.word', { count: p.coins })}</p>
              <p className="mt-3 text-3xl font-extrabold text-heading 2xl:text-[44px]">{money.format(p.price_usd)}</p>
              <button
                type="button"
                disabled={!data.purchase_available}
                data-testid={`plan-${p.id}`}
                className="mt-4 h-14 w-full rounded-2xl bg-primary-soft px-6 text-lg font-extrabold uppercase text-primary disabled:cursor-not-allowed 2xl:h-[62px] 2xl:text-[28px]"
              >
                {t('cab.plans.soon')}
              </button>
            </div>
          ))}
        </div>
        <section data-testid="plans-lessons" className="flex items-center gap-4 rounded-card border border-border bg-surface p-4 shadow-card 2xl:h-[177px] 2xl:gap-10 2xl:px-10 2xl:py-3">
          <img src="/art/robot-happy.webp" alt="" className="h-24 w-24 shrink-0 object-contain 2xl:h-[150px] 2xl:w-[200px]" />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-extrabold text-heading 2xl:text-[40px] 2xl:leading-[48px]">{t('pl.lessonsTitle')}</h2>
            <p className="mt-1 text-base text-text 2xl:max-w-[640px] 2xl:text-[26px] 2xl:leading-8">{t('pl.lessonsText')}</p>
          </div>
          <img src="/art/coins-small.webp" alt="" className="hidden h-28 w-44 shrink-0 object-contain md:block 2xl:h-[150px] 2xl:w-[300px]" />
        </section>
      </main>
    </div>
  )
}
