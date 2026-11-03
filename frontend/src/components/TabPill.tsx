import { useLayoutEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'

type Props = { to: string; icon: string; label: string; testid: string; end?: boolean; badge?: number | null; className?: string }

// Подложка одна на всю шапку: новая вкладка принимает её с места старой
let lastPill: DOMRect | null = null

function Pill() {
  const el = useRef<HTMLSpanElement>(null)
  const flew = useRef(false)
  useLayoutEffect(() => {
    const node = el.current
    if (!node || flew.current) return // второй проход StrictMode мерил бы уже летящую подложку
    flew.current = true
    const now = node.getBoundingClientRect()
    const from = lastPill
    lastPill = now
    // По другой строке: окно сменило ширину и панель переехала, подложка не летит через экран
    if (!from || from.left === now.left || Math.abs(from.top - now.top) > 4) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    node.animate(
      [{ transform: `translateX(${from.left - now.left}px) scaleX(${from.width / now.width})` }, { transform: 'none' }],
      { duration: 260, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
    )
  }, [])
  return <span ref={el} aria-hidden="true" className="absolute inset-0 -z-10 origin-left rounded-2xl bg-primary-soft lg:rounded-full lg:bg-surface lg:shadow-card" />
}

/** Вкладка с цветной иконкой из /art/ на общей дорожке: активная белая, с тенью. На телефоне — часть нижней панели. */
export default function TabPill({ to, icon, label, testid, end, badge, className = '' }: Props) {
  return (
    <NavLink
      to={to}
      end={end}
      data-testid={testid}
      className={({ isActive }) =>
        `relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-xs font-extrabold transition-colors duration-150 lg:h-11 lg:flex-none lg:flex-row lg:gap-2 lg:whitespace-nowrap lg:rounded-full lg:px-4 lg:text-base ${
          isActive ? 'text-primary' : 'text-heading lg:text-text lg:hover:bg-primary-soft lg:hover:text-heading'
        } ${className}`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <Pill />}
          <img src={icon.includes('.') ? `/art/${icon}` : `/art/tab-${icon}.webp`} alt="" className="h-8 w-8 shrink-0 lg:h-6 lg:w-6" />
          <span className="line-clamp-2 max-w-full break-words text-center leading-tight lg:line-clamp-1">{label}</span>
          {!!badge && (
            <span
              key={badge}
              data-testid={`${testid}-badge`}
              className="tick-in absolute right-1 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-extrabold leading-none text-primary-fg lg:-right-1 lg:-top-1"
            >
              {badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}
