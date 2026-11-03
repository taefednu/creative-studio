import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

// Секунды ролика: герой появляется («бац») и скоро конец. Сверено с монтажом film2.mp4.
const TITLE_AT = 3
const ARROW_AT = 5
// Не начал играть за это время (слабая сеть): сразу финальный кадр, а не пустой экран
const START_LIMIT_MS = 2500

type Phase = 'film' | 'title' | 'arrow'

/** Первый экран гостя: рисунок становится героем. Ролик стоит на месте, лента наезжает поверх него. */
export default function HomeFilm({ feedId }: { feedId: string }) {
  const { t } = useTranslation()
  const video = useRef<HTMLVideoElement>(null)
  const [calm] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [phase, setPhase] = useState<Phase>(calm ? 'arrow' : 'film')
  const [still, setStill] = useState(calm) // ролик не показываем: движение выключено или он не запустился

  useEffect(() => {
    if (calm) return
    const giveUp = () => {
      video.current?.pause()
      setStill(true)
      setPhase('arrow')
    }
    const timer = window.setTimeout(giveUp, START_LIMIT_MS)
    const v = video.current
    const started = () => window.clearTimeout(timer)
    v?.addEventListener('playing', started)
    v?.play().catch(giveUp)
    return () => {
      window.clearTimeout(timer)
      v?.removeEventListener('playing', started)
    }
  }, [calm])

  function onTime() {
    const now = video.current?.currentTime ?? 0
    setPhase(now >= ARROW_AT ? 'arrow' : now >= TITLE_AT ? 'title' : 'film')
  }

  function replay() {
    const v = video.current
    if (!v) return
    v.currentTime = 0
    setPhase('film')
    void v.play()
  }

  const shown = phase !== 'film'
  return (
    <section data-testid="home-film" className="sticky top-0 flex h-dvh flex-col overflow-hidden bg-bg lg:block">
      <div className="film-sink relative h-[54dvh] shrink-0 overflow-hidden lg:absolute lg:inset-0 lg:h-full">
        {still ? (
          <img src="/film/hero-last.webp" alt="" className="h-full w-full object-cover" />
        ) : (
          <video
            ref={video}
            data-testid="home-film-video"
            src="/film/hero.mp4"
            poster="/film/hero-first.webp"
            muted
            playsInline
            preload="auto"
            aria-hidden="true"
            onTimeUpdate={onTime}
            onEnded={() => setPhase('arrow')}
            className="h-full w-full object-cover"
          />
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-film-top" />
        <div className={`pointer-events-none absolute inset-0 hidden bg-film-side transition-opacity duration-500 lg:block ${shown ? 'opacity-100' : 'opacity-0'}`} />
        {!still && phase === 'arrow' && (
          <button
            type="button"
            data-testid="home-film-replay"
            onClick={replay}
            className="film-in absolute bottom-3 right-3 flex h-10 items-center rounded-full bg-surface px-4 text-sm font-extrabold text-heading shadow-pop lg:bottom-8 lg:right-8"
          >
            {t('home.hero.replay')}
          </button>
        )}
      </div>
      <div className="film-dim pointer-events-none absolute inset-0 hidden bg-scrim lg:block" />
      <div className="film-leave relative flex min-h-0 flex-1 flex-col items-start px-4 pb-[160px] pt-4 lg:absolute lg:inset-y-0 lg:left-0 lg:w-[34%] lg:justify-center lg:p-0 lg:pl-8">
        <div>
          <h1 className="text-[36px] font-black leading-[1.02] tracking-tight text-heading lg:text-[64px] lg:text-primary-fg">
            {t('home.hero.title').split(' ').map((word, i) => (
              <span key={i}>
                <span style={{ animationDelay: `${i * 70}ms` }} className={`inline-block ${shown ? 'film-word' : 'opacity-0'}`}>{word}</span>{' '}
              </span>
            ))}
          </h1>
          <p className={`mt-2 max-w-[28em] text-[15px] font-semibold leading-snug text-text lg:mt-4 lg:text-xl lg:text-primary-fg ${shown ? 'film-in [animation-delay:220ms]' : 'opacity-0'}`}>{t('home.hero.text')}</p>
          <Link
            to="/login"
            data-testid="home-hero-cta"
            tabIndex={shown ? 0 : -1}
            className={`btn-press mt-3 inline-flex h-12 items-center rounded-[14px] bg-primary px-6 text-base font-extrabold text-primary-fg shadow-press lg:mt-7 lg:h-[60px] lg:px-8 lg:text-xl ${shown ? 'film-in [animation-delay:320ms]' : 'opacity-0'}`}
          >
            {t('home.hero.cta')}
          </Link>
        </div>
      </div>
      {phase === 'arrow' && (
        <button
          type="button"
          data-testid="home-film-down"
          aria-label={t('home.hero.down')}
          onClick={() => document.getElementById(feedId)?.scrollIntoView({ behavior: 'smooth' })}
          className="film-down film-in absolute bottom-[96px] left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 lg:bottom-7"
        >
          <span className="hidden rounded-full bg-surface px-4 py-1.5 text-base font-extrabold text-heading shadow-pop lg:block">{t('home.hero.down')}</span>
          <span className="film-arrow flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-fg shadow-press lg:h-[76px] lg:w-[76px]">
            <svg viewBox="0 0 24 24" className="h-8 w-8 lg:h-11 lg:w-11" aria-hidden="true">
              <path d="M12 5v13M6 12l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
      )}
    </section>
  )
}
