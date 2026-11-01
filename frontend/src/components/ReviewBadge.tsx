import { useTranslation } from 'react-i18next'
import { HOME, useSession } from '../features/auth/session'
import { useReviewCount } from '../features/review/review'

/** Счётчик задержанного на входе в кабинет; ведёт к списку. */
export default function ReviewBadge() {
  const { t } = useTranslation()
  const n = useReviewCount()
  const { role } = useSession()
  if (!n) return null
  return (
    <a
      href={`${role ? HOME[role] : '/'}#review`}
      data-testid="review-badge"
      className="rounded-full bg-primary px-4 py-2 text-sm font-extrabold text-primary-fg"
    >
      {t('review.badge', { count: n })}
    </a>
  )
}
