import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import { HOME, useSession } from './features/auth/session'
import type { Role } from './features/auth/session'
import AdultFeed from './pages/AdultFeed'
import Create from './pages/Create'
import Feed from './pages/Feed'
import Login from './pages/Login'
import MyWorks from './pages/MyWorks'
import ParentCabinet from './pages/ParentCabinet'
import QrLanding from './pages/QrLanding'
import Stub from './pages/Stub'
import TeacherCabinet from './pages/TeacherCabinet'

/** Роутинг по роли: чужой кабинет не открывается, без входа — на экран входа. */
function Guard({ role, children }: { role: Role; children: ReactNode }) {
  const { role: current } = useSession()
  if (current === undefined) return null
  if (current === null) return <Navigate to="/login" replace />
  if (current !== role) return <Navigate to={HOME[current]} replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/qr" element={<QrLanding />} />
      <Route path="/parent" element={<Guard role="parent"><ParentCabinet /></Guard>} />
      <Route path="/teacher" element={<Guard role="teacher"><TeacherCabinet /></Guard>} />
      <Route path="/teacher/feed/:classId" element={<Guard role="teacher"><AdultFeed who="teacher" /></Guard>} />
      <Route path="/parent/feed" element={<Guard role="parent"><AdultFeed who="parent" /></Guard>} />
      <Route element={<Guard role="child"><AppShell /></Guard>}>
        <Route index element={<Feed />} />
        <Route path="create" element={<Create />} />
        <Route path="tasks" element={<Stub name="tasks" />} />
        <Route path="my-works" element={<MyWorks />} />
      </Route>
    </Routes>
  )
}
