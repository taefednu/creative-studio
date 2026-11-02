import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import Logo from '../components/Logo'
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
    <div className="flex min-h-screen items-center justify-center bg-cover bg-center p-4" style={{ backgroundImage: 'url(/art/login-bg.webp)' }}>
      <div role="status" className="flex w-full max-w-md flex-col items-center gap-4 rounded-card border border-border bg-surface p-8 text-center text-heading shadow-card">
        <Logo />
        <img src={failed ? '/art/robot-brush.webp' : '/art/robot-wave.webp'} alt="" className="h-40 w-40 object-contain" />
        {failed ? (
          <>
            <p data-testid="qr-failed" className="text-lg font-extrabold">
              {t('qr.failed')}
            </p>
            <Link to="/login" className="flex h-12 items-center rounded-full bg-primary px-8 font-extrabold uppercase text-primary-fg">
              {t('qr.toLogin')}
            </Link>
          </>
        ) : (
          <p data-testid="qr-signing" className="text-xl font-extrabold">
            {t('qr.signingIn')}
          </p>
        )}
      </div>
    </div>
  )
}
