import { QRCodeSVG } from 'qrcode.react'
import { useTranslation } from 'react-i18next'

/** QR одноразового входа. Цвета — токены темы. */
export default function QrBox({ token, nick }: { token: string; nick: string }) {
  const { t } = useTranslation()
  const url = `${window.location.origin}/qr?token=${encodeURIComponent(token)}`
  return (
    <div data-testid="qr-box" className="mt-3 flex flex-col items-center gap-2 rounded-card border border-border bg-surface p-4">
      <QRCodeSVG value={url} size={160} bgColor="var(--color-surface)" fgColor="var(--color-heading)" />
      <p className="text-center text-sm font-bold text-heading">{t('qr.for', { nick })}</p>
      <p className="text-center text-xs text-muted">{t('qr.hint')}</p>
    </div>
  )
}
