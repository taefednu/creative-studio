import { Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import Stub from './pages/Stub'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Stub name="feed" />} />
        <Route path="create" element={<Stub name="create" />} />
        <Route path="tasks" element={<Stub name="tasks" />} />
        <Route path="mine" element={<Stub name="mine" />} />
      </Route>
    </Routes>
  )
}
