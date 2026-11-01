import { useTranslation } from 'react-i18next'
import { api } from '../api'
import CabinetHeader from '../components/CabinetHeader'
import { useLoad } from '../useLoad'

type Tariffs = { purchase_available: boolean; packs: { id: string; coins: number; price_usd: number }[] }

const loadTariffs = () => api<Tariffs>('/api/parent/tariffs')

/** Тарифы: цена из данных, покупки нет, платёжных полей нет. */
export default function ParentPlans() {
  const { t, i18n } = useTranslation()
  const [data] = useLoad(loadTariffs)
  const money = new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'USD' })
  return (
    <div className="min-h-screen bg-bg pb-24 lg:pb-6">
      <CabinetHeader role="parent" />
      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-4 md:px-7">
        <h1 data-testid="page-title" className="w-fit text-[30px] font-extrabold leading-9 text-heading lg:text-[54px] lg:leading-[50px]">
          {t('cab.plans.title')}
        </h1>
        {data && data.packs.length === 0 && <p className="text-muted">{t('cab.plans.empty')}</p>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="plans">
          {data?.packs.map((p) => (
            <div key={p.id} className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface p-6 shadow-card">
              <img src="/art/crown.webp" alt="" className="h-24 w-24 object-contain" />
              <p className="text-2xl font-extrabold text-heading">{t('cab.plans.coins', { count: p.coins })}</p>
              <p className="text-3xl font-extrabold text-primary">{money.format(p.price_usd)}</p>
              <button
                type="button"
                disabled={!data.purchase_available}
                data-testid={`plan-${p.id}`}
                className="w-full rounded-full bg-primary px-6 py-3 font-extrabold uppercase text-primary-fg disabled:opacity-50"
              >
                {t('cab.plans.soon')}
              </button>
            </div>
          ))}
        </div>
        <p className="text-muted">{t('cab.plans.note')}</p>
      </main>
    </div>
  )
}
