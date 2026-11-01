import { useTranslation } from 'react-i18next'

export default function Stub({ name }: { name: 'feed' | 'create' | 'tasks' | 'mine' }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-card border border-border bg-surface p-8 text-heading shadow-card">
      <p className="text-xl font-extrabold">{t(`pages.${name}`)}</p>
    </div>
  )
}
