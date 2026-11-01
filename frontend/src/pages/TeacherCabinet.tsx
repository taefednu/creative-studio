import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../api'
import CabinetHeader from '../components/CabinetHeader'
import ChipSelect from '../components/ChipSelect'
import ReviewQueue from '../components/ReviewQueue'
import { useLoad } from '../useLoad'

type Room = { id: number; name: string }

const loadRooms = () => api<Room[]>('/api/teacher/classes')

/** Вкладка «Проверка»: очередь «Задержано» с фильтром по классу (виден, если классов больше одного). */
export default function TeacherCabinet() {
  const { t } = useTranslation()
  const [rooms] = useLoad(loadRooms)
  const [cls, setCls] = useState<string | null>(null)
  return (
    <div className="min-h-screen bg-bg pb-24 lg:pb-6">
      <CabinetHeader role="teacher" />
      <main className="px-4 py-4 md:px-9">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 data-testid="page-title" className="w-fit text-[30px] font-extrabold leading-9 text-heading lg:text-[54px] lg:leading-[50px]">
            {t('review.title')}
          </h1>
          {rooms && rooms.length > 1 && (
            <ChipSelect
              testid="class-filter"
              label={t('cab.filter.label')}
              value={cls ?? ''}
              onChange={(v) => setCls(v || null)}
              options={[{ value: '', label: t('cab.filter.all') }, ...rooms.map((r) => ({ value: r.name, label: r.name }))]}
              className="h-11 w-full lg:h-[55px] lg:w-[213px]"
            />
          )}
        </div>
        <ReviewQueue classFilter={cls} />
      </main>
    </div>
  )
}
