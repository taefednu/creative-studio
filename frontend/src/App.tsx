import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AppShell from './components/AppShell'
import { HOME, useSession } from './features/auth/session'
import type { Role } from './features/auth/session'
import AdultFeed from './pages/AdultFeed'
import Create from './pages/Create'
import Feed from './pages/Feed'
import Login from './pages/Login'
import Story from './pages/Story'
import MyWorks from './pages/MyWorks'
import ParentCabinet from './pages/ParentCabinet'
import ParentPlans from './pages/ParentPlans'
import QrLanding from './pages/QrLanding'
import Showcase from './pages/Showcase'
import Tasks from './pages/Tasks'
import TeacherClasses, { TeacherClass } from './pages/TeacherClasses'
import SharedWork from './pages/SharedWork'

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

/** Смена вкладки: содержимое проявляется. Только прозрачность: transform на main сдвинул бы закреплённую панель создания. */
function usePageFade() {
  const { pathname } = useLocation()
  const was = useRef(pathname)
  useEffect(() => {
    if (was.current === pathname) return
    was.current = pathname
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    document.querySelector('main')?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' })
  }, [pathname])
}

export default function App() {
  usePageFade()
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/qr" element={<QrLanding />} />
      <Route path="/s/:token" element={<SharedWork />} />
      <Route path="/parent" element={<Navigate to="/parent/kids" replace />} />
      <Route path="/parent/kids" element={<Guard role="parent"><ParentCabinet /></Guard>} />
      <Route path="/parent/review" element={<Navigate to="/parent/kids" replace />} />
      <Route path="/parent/plans" element={<Guard role="parent"><ParentPlans /></Guard>} />
      <Route path="/teacher" element={<Navigate to="/teacher/classes" replace />} />
      <Route path="/teacher/review" element={<Navigate to="/teacher/classes" replace />} />
      <Route path="/teacher/tasks" element={<Navigate to="/teacher/classes" replace />} />
      <Route path="/teacher/feed" element={<Guard role="teacher"><AdultFeed /></Guard>} />
      <Route path="/teacher/classes" element={<Guard role="teacher"><TeacherClasses /></Guard>} />
      <Route path="/teacher/classes/:classId" element={<Guard role="teacher"><TeacherClass /></Guard>} />
      <Route path="/teacher/feed/:classId" element={<Guard role="teacher"><AdultFeed /></Guard>} />
      <Route path="/parent/feed" element={<Navigate to="/parent/kids" replace />} />
      <Route element={<ChildArea />}>
        <Route index element={<Feed />} />
        <Route path="create" element={<Create />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="my-works" element={<MyWorks />} />
        <Route path="story/:id" element={<Story />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
