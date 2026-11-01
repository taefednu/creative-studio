import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useSession } from '../features/auth/session'

/** Одноразовая ссылка из QR: меняем токен на сессию. Работает один раз. */
export default function QrLanding() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const token = params.get('token')
  const { refresh } = useSession()
  const navigate = useNavigate()
  const [failed, setFailed] = useState(!token)
  const started = useRef(false)

  useEffect(() => {
    // токен одноразовый: StrictMode запускает эффект дважды, второй запрос не отправляем
    if (!token || started.current) return
    started.current = true
    api('/api/child/qr-login', 'POST', { token })
      .then(refresh)
      .then(() => navigate('/create', { replace: true }))
      .catch(() => setFailed(true))
  }, [token, refresh, navigate])

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center text-heading">
      {failed ? (
        <>
          <p data-testid="qr-failed" className="text-lg font-extrabold">
            {t('qr.failed')}
          </p>
          <Link to="/login" className="mt-4 inline-block font-bold text-primary underline">
            {t('qr.toLogin')}
          </Link>
        </>
      ) : (
        <p className="text-lg font-extrabold">{t('qr.signingIn')}</p>
      )}
    </div>
  )
}
