import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AppShell from './components/AppShell'
import { HOME, useSession } from './features/auth/session'
import type { Role } from './features/auth/session'
import AdultFeed from './pages/AdultFeed'
import Create from './pages/Create'
import Feed from './pages/Feed'
import Login from './pages/Login'
import MyWorks from './pages/MyWorks'
import ParentCabinet from './pages/ParentCabinet'
import ParentPlans from './pages/ParentPlans'
import ParentReview from './pages/ParentReview'
import QrLanding from './pages/QrLanding'
import Showcase from './pages/Showcase'
import Tasks from './pages/Tasks'
import TeacherCabinet from './pages/TeacherCabinet'
import TeacherClasses from './pages/TeacherClasses'
import TeacherTasks from './pages/TeacherTasks'

/** Роутинг по роли: чужой кабинет не открывается, без входа — на экран входа. */
function Guard({ role, children }: { role: Role; children: ReactNode }) {
  const { role: current } = useSession()
  if (current === undefined) return null
  if (current === null) return <Navigate to="/login" replace />
  if (current !== role) return <Navigate to={HOME[current]} replace />
  return children
}

/** Зона ребёнка. Гость на «/» видит витрину, на остальных маршрутах уходит на вход; взрослый — в свой кабинет. */
function ChildArea() {
  const { role } = useSession()
  const { pathname } = useLocation()
  if (role === undefined) return null
  if (role === null) return pathname === '/' ? <Showcase /> : <Navigate to="/login" replace />
  if (role !== 'child') return <Navigate to={HOME[role]} replace />
  return <AppShell />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/qr" element={<QrLanding />} />
      <Route path="/parent" element={<Guard role="parent"><ParentCabinet /></Guard>} />
      <Route path="/parent/review" element={<Guard role="parent"><ParentReview /></Guard>} />
      <Route path="/parent/plans" element={<Guard role="parent"><ParentPlans /></Guard>} />
      <Route path="/teacher" element={<Guard role="teacher"><TeacherCabinet /></Guard>} />
      <Route path="/teacher/tasks" element={<Guard role="teacher"><TeacherTasks /></Guard>} />
      <Route path="/teacher/classes" element={<Guard role="teacher"><TeacherClasses /></Guard>} />
      <Route path="/teacher/feed/:classId" element={<Guard role="teacher"><AdultFeed who="teacher" /></Guard>} />
      <Route path="/parent/feed" element={<Guard role="parent"><AdultFeed who="parent" /></Guard>} />
      <Route element={<ChildArea />}>
        <Route index element={<Feed />} />
        <Route path="create" element={<Create />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="my-works" element={<MyWorks />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
