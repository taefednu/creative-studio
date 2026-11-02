import { NavLink } from 'react-router-dom'

type Props = { to: string; icon: string; label: string; testid: string; end?: boolean; badge?: number | null; className?: string }

/** Вкладка с цветной иконкой из /art/ на общей дорожке: активная белая, с тенью. На телефоне — часть нижней панели. */
export default function TabPill({ to, icon, label, testid, end, badge, className = '' }: Props) {
  return (
    <NavLink
      to={to}
      end={end}
      data-testid={testid}
      className={({ isActive }) =>
        `relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-xs font-extrabold transition-colors duration-150 lg:h-10 lg:flex-none lg:flex-row lg:gap-2 lg:whitespace-nowrap lg:rounded-full lg:px-4 lg:text-[15px] ${
          isActive ? 'bg-primary-soft text-primary lg:bg-surface lg:shadow-card' : 'text-heading lg:hover:text-primary'
        } ${className}`
      }
    >
      <img src={icon.includes('.') ? `/art/${icon}` : `/art/tab-${icon}.webp`} alt="" className="h-8 w-8 shrink-0 lg:h-6 lg:w-6" />
      <span className="line-clamp-2 max-w-full break-words text-center leading-tight lg:line-clamp-1">{label}</span>
      {!!badge && (
        <span
          data-testid={`${testid}-badge`}
          className="absolute right-1 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-extrabold leading-none text-primary-fg"
        >
          {badge}
        </span>
      )}
    </NavLink>
  )
}
