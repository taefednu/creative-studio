import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useSession } from '../features/auth/session'
import LangSwitch from './LangSwitch'

export default function CabinetHeader({ title }: { title: string }) {
  const { t } = useTranslation()
  const { refresh } = useSession()
  const navigate = useNavigate()
  async function logout() {
    await api('/api/logout', 'POST')
    await refresh()
    navigate('/login')
  }
  return (
    <header className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-8">
      <img src="/mentorium-logo.png" alt="Mentorium" className="h-9 w-auto" />
      <span className="text-lg font-extrabold text-heading">{title}</span>
      <LangSwitch />
      <button
        type="button"
        data-testid="logout"
        onClick={() => void logout()}
        className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-bold text-heading"
      >
        {t('auth.logout')}
      </button>
    </header>
  )
}
