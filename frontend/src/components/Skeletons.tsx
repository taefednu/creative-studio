import { Skeleton } from './FeedImage'

/** Заглушки по форме настоящего экрана: контент встаёт на их место без сдвигов. На быстрой сети не успевают мелькнуть (skel-in). */
const RING = 'block rounded-full'
const CARD = 'block rounded-[22px]'

export function WorksSkeleton() {
  return (
    <div data-testid="works-skeleton" aria-hidden="true" className="skel-in">
      <Skeleton className="block h-[132px] rounded-[28px] md:h-[230px]" />
      <div className="mt-[58px] grid grid-cols-2 gap-2 md:mt-[58px] md:grid-cols-4 lg:grid-cols-6">
        <Skeleton className={`${CARD} col-span-2 row-span-2 aspect-square`} />
        {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className={`${CARD} aspect-square`} />)}
      </div>
    </div>
  )
}

export function TasksSkeleton() {
  return (
    <div data-testid="tasks-skeleton" aria-hidden="true" className="skel-in mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => <Skeleton key={i} className="block h-[320px] rounded-[28px]" />)}
    </div>
  )
}

export function PlansSkeleton() {
  return (
    <div data-testid="plans-skeleton" aria-hidden="true" className="skel-in mx-auto grid w-full max-w-[720px] gap-3">
      {[0, 1, 2].map((i) => <Skeleton key={i} className="block h-[88px] rounded-[22px]" />)}
    </div>
  )
}

export function RoomsSkeleton() {
  return (
    <div data-testid="rooms-skeleton" aria-hidden="true" className="skel-in mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((i) => <Skeleton key={i} className="block h-[280px] rounded-[28px]" />)}
    </div>
  )
}

/** Кабинет: слева решение и работы, справа герой. Один на родителя и класс: у них общая сетка. */
export function CabinetSkeleton() {
  return (
    <div data-testid="cabinet-skeleton" aria-hidden="true" className="skel-in grid gap-6 lg:grid-cols-6 lg:gap-x-3 xl:grid-cols-7">
      <div className="flex min-w-0 flex-col gap-4 lg:col-span-4 xl:col-span-5">
        <Skeleton className="block h-10 w-[60%] rounded-full" />
        <Skeleton className="block h-[30dvh] min-h-[220px] rounded-[22px]" />
        <Skeleton className="block h-10 w-[40%] rounded-full" />
      </div>
      <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
        <Skeleton className="block h-10 w-[50%] rounded-full" />
        <Skeleton className={`${RING} aspect-square w-1/2`} />
        <Skeleton className="block h-16 rounded-[22px]" />
      </div>
    </div>
  )
}

/** Правая часть шапки ребёнка, пока профиль не пришёл: монеты и аватар не выскакивают из пустоты. */
export function HeaderSkeleton() {
  return (
    <span aria-hidden="true" className="skel-in flex items-center gap-1.5 s380:gap-2 big:gap-4">
      <Skeleton className={`${RING} h-9 w-9 lg:h-11 lg:w-11`} />
      <Skeleton className={`${RING} h-9 w-[68px] lg:h-11 lg:w-[88px]`} />
      <Skeleton className={`${RING} h-9 w-9 lg:h-11 lg:w-11`} />
    </span>
  )
}
