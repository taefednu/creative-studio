import { useTranslation } from 'react-i18next'
import CabinetHeader from '../components/CabinetHeader'

/** Заглушка: задания учителя заполнит следующая партия (#13). */
export default function TeacherTasks() {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen bg-bg pb-24 lg:pb-6">
      <CabinetHeader role="teacher" />
      <main className="px-4 py-4 md:px-9">
        <h1 data-testid="page-title" className="w-fit text-[30px] font-extrabold leading-9 text-heading lg:text-[54px] lg:leading-[50px]">
          {t('cab.tasks.title')}
        </h1>
        <p data-testid="tasks-empty" className="mt-3 text-muted">
          {t('cab.tasks.empty')}
        </p>
      </main>
    </div>
  )
}
