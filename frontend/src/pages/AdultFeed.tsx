import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import CabinetHeader from '../components/CabinetHeader'
import FeedView from '../components/FeedView'
import { useLoad } from '../useLoad'

const loadRooms = () => api<{ id: number; name: string }[]>('/api/teacher/classes')

function TeacherFeed() {
  const { classId } = useParams()
  const navigate = useNavigate()
  const [rooms] = useLoad(loadRooms)
  const id = Number(classId)
  const classes = (rooms ?? []).map((r) => ({
    id: String(r.id),
    label: r.name,
    active: r.id === id,
    onPick: () => navigate(`/teacher/feed/${r.id}`),
  }))
  return <FeedView kinds={['class']} classId={id} classes={classes} />
}

/** Та же лента, что у детей: учитель переключает классы, родитель видит семью. */
export default function AdultFeed({ who }: { who: 'teacher' | 'parent' }) {
  return (
    <div className="min-h-screen bg-bg pb-24 lg:pb-6">
      <CabinetHeader role={who} />
      <main className="px-4 pb-5 pt-1.5 md:px-8 lg:pt-4">
        {who === 'teacher' ? <TeacherFeed /> : <FeedView kinds={['family']} />}
      </main>
    </div>
  )
}
