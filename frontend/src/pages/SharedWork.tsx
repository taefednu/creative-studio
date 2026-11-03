import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { useCallback } from 'react'
import { api } from '../api'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import { useLoad } from '../useLoad'

/** Открытая страница работы по ссылке: только проверенная картинка в рамке. Ни ника, ни подписи: это страница для всех. */
export default function SharedWork() {
  const { t } = useTranslation()
  const { token = '' } = useParams()
  const load = useCallback(() => api<{ image_url: string }>(`/api/public/${encodeURIComponent(token)}`), [token])
  const [work, , failed] = useLoad(load)
  return (
    <main className="flex min-h-dvh flex-col items-center gap-4 bg-bg px-4 py-5 text-center">
      <Link to="/">
        <Logo />
      </Link>
      {work ? (
        <>
          <h1 className="text-balance text-3xl font-black leading-9 tracking-tight text-heading md:text-5xl md:leading-[56px]">{t('share.title')}</h1>
          <div className="relative w-[min(100%,calc(100dvh-260px))] min-w-[260px]">
            <div aria-hidden="true" className="shared-aura absolute -inset-3 rounded-[44px]" />
            <figure data-testid="shared-frame" className="relative rounded-[36px] bg-surface p-3 shadow-pop md:p-4">
              <img data-testid="shared-img" src={work.image_url} alt={t('share.alt')} className="aspect-square w-full rounded-[24px] object-cover" />
              <figcaption className="absolute bottom-6 left-6 flex items-center gap-1 rounded-full bg-success-soft py-1 pl-2 pr-3 text-sm font-extrabold text-success md:bottom-8 md:left-8">
                <Icon name="check" />
                {t('create.checkedByAi')}
              </figcaption>
            </figure>
          </div>
          <Link to="/" data-testid="shared-cta" className="btn-press mt-2 flex h-14 items-center rounded-2xl bg-primary px-8 text-lg font-extrabold text-primary-fg">{t('share.cta')}</Link>
        </>
      ) : failed ? (
        <div data-testid="shared-gone" className="my-auto flex flex-col items-center gap-4">
          <img src="/art/robot-wave.webp" alt="" className="h-40 w-40 object-contain" />
          <h1 className="text-2xl font-black text-heading">{t('share.gone')}</h1>
          <Link to="/" className="btn-press flex h-14 items-center rounded-2xl bg-primary px-8 text-lg font-extrabold text-primary-fg">{t('share.cta')}</Link>
        </div>
      ) : null}
    </main>
  )
}
