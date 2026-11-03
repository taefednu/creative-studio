import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../../api'

export type Role = 'child' | 'parent' | 'teacher'

type Ctx = {
  /** undefined — ещё грузим, null — не вошли */
  role: Role | null | undefined
  refresh: () => Promise<void>
}

const SessionCtx = createContext<Ctx>({ role: undefined, refresh: async () => {} })

export function SessionProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null | undefined>(undefined)
  const refresh = useCallback(async () => {
    try {
      setRole((await api<{ role: Role | null }>('/api/session')).role)
    } catch {
      setRole(null)
    }
  }, [])
  useEffect(() => {
    api<{ role: Role | null }>('/api/session')
      .then((r) => setRole(r.role))
      .catch(() => setRole(null))
  }, [])
  const value = useMemo(() => ({ role, refresh }), [role, refresh])
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>
}

export function useSession() {
  return useContext(SessionCtx)
}

export const HOME: Record<Role, string> = { child: '/', parent: '/parent/kids', teacher: '/teacher/classes' }
