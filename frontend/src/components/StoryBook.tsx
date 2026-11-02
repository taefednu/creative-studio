import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export type BookPage = { text: string | null; url: string | null }

/** Книжка: картинка и текст страницы, листается стрелками, точками и клавишами. Непришедшая страница живёт цветной заглушкой. */
export default function StoryBook({ title, pages, compact, children }: { title: string | null; pages: BookPage[]; compact?: boolean; children?: ReactNode }) {
  const { t } = useTranslation()
  const [at, setAt] = useState(0)
  const [dir, setDir] = useState(1)
  const go = (n: number) => {
    if (n < 0 || n >= pages.length) return
    setDir(n > at ? 1 : -1)
    setAt(n)
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(at + 1)
      if (e.key === 'ArrowLeft') go(at - 1)
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  })
  const page = pages[at]
  const arrow = 'absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-xl font-extrabold text-primary shadow-card disabled:opacity-0'
  const picture = page?.url ? (
    <img key={at} src={page.url} alt="" data-testid="story-image" style={{ '--turn': `${dir * 24}px` } as React.CSSProperties} className="story-turn h-full w-full object-cover" />
  ) : (
    <div data-testid="story-pending" className="story-pending h-full w-full" />
  )
  const buttons = (
    <>
      <button type="button" data-testid="story-prev" aria-label={t('story.prev')} disabled={at === 0} onClick={() => go(at - 1)} className={`${arrow} left-3`}>‹</button>
      <button type="button" data-testid="story-next" aria-label={t('story.next')} disabled={at === pages.length - 1} onClick={() => go(at + 1)} className={`${arrow} right-3`}>›</button>
    </>
  )
  const dots = (
    <div className="flex items-center gap-2" role="group" aria-label={t('story.pages')}>
      {pages.map((p, i) => (
        <button
          key={i}
          type="button"
          data-testid={`story-dot-${i}`}
          aria-label={t('story.pageN', { n: i + 1 })}
          aria-current={i === at}
          onClick={() => go(i)}
          className={`h-3 rounded-full transition-all duration-200 motion-reduce:transition-none ${i === at ? 'w-8 bg-primary' : p.url ? 'w-3 bg-primary-light' : 'w-3 bg-primary-soft'}`}
        />
      ))}
    </div>
  )
  // В карточке работы места мало: текст лежит на картинке, чтобы ребёнок читал не прокручивая
  if (compact) {
    return (
      <div data-testid="story-book" className="relative h-full min-h-[320px] w-full overflow-hidden">
        {picture}
        {buttons}
        <div className="absolute inset-x-3 bottom-3 flex flex-col gap-2 rounded-2xl bg-surface p-3 shadow-card">
          <p key={at} data-testid="story-text" className="gen-title text-base font-bold leading-6 text-heading">{page?.text ?? t('story.pageSoon')}</p>
          {dots}
        </div>
      </div>
    )
  }
  return (
    <div data-testid="story-book" className="flex flex-col lg:flex-row lg:items-center lg:gap-8">
      <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-[28px] bg-primary-soft shadow-pop lg:h-[calc(100dvh-112px)] lg:max-h-[700px] lg:w-auto">
        {picture}
        {buttons}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4 pt-3 lg:pt-0">
        {title && <h1 data-testid="story-title" className="text-2xl font-extrabold text-heading lg:text-4xl lg:leading-10">{title}</h1>}
        <p key={at} data-testid="story-text" className="gen-title min-h-[6lh] text-lg font-bold text-text lg:text-2xl lg:leading-9">{page?.text ?? t('story.pageSoon')}</p>
        {dots}
        {children}
      </div>
    </div>
  )
}
