import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import CabinetHeader from '../components/CabinetHeader'
import FeedView, { FeedSkeleton } from '../components/FeedView'
import ReviewQueue from '../components/ReviewQueue'
import { useLoad } from '../useLoad'

const loadRooms = () => api<{ id: number; name: string }[]>('/api/teacher/classes')
const loadKids = () => api<unknown[]>('/api/parent/children')

function TeacherFeed() {
  const { t } = useTranslation()
  const { classId } = useParams()
  const navigate = useNavigate()
  const [rooms] = useLoad(loadRooms)
  if (!rooms) return <FeedSkeleton />
  if (rooms.length === 0) {
    return (
      <div data-testid="no-classes" className="flex flex-wrap items-center gap-4">
        <img src="/art/robot-wave.webp" alt="" className="h-24 w-24 shrink-0 object-contain" />
        <p className="min-w-[8rem] flex-1 text-lg font-extrabold text-heading">{t('teacher.noClasses')}</p>
        <Link to="/teacher/classes" className="flex h-12 items-center rounded-full bg-primary px-6 font-extrabold uppercase text-primary-fg">
          {t('cl2.new')}
        </Link>
      </div>
    )
  }
  const id = classId ? Number(classId) : rooms[0].id
  const classes = rooms.map((r) => ({
    id: String(r.id),
    label: r.name,
    active: r.id === id,
    onPick: () => navigate(`/teacher/feed/${r.id}`),
  }))
  return <FeedView kinds={['class']} classId={id} classes={classes} />
}

function ParentFeed() {
  const [kids] = useLoad(loadKids)
  if (!kids) return <FeedSkeleton />
  // Без детей лента пуста всегда: новому родителю сначала нужно добавить ребёнка
  if (kids.length === 0) return <Navigate to="/parent/kids" replace />
  return <FeedView kinds={['family']} />
}

/** Главный экран взрослого: та же лента, что у детей. Срочное видно над ней всегда, остальное ждёт по счётчику на вкладке. */
export default function AdultFeed({ who }: { who: 'teacher' | 'parent' }) {
  return (
    <div className="min-h-screen bg-bg pb-24 lg:pb-6">
      <CabinetHeader role={who} />
      <main className="px-4 pb-5 pt-1.5 md:px-8 lg:pt-4">
        <ReviewQueue urgentOnly />
        {who === 'teacher' ? <TeacherFeed /> : <ParentFeed />}
      </main>
    </div>
  )
}
