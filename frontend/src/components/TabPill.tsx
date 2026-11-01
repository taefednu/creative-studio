import { NavLink } from 'react-router-dom'

type Props = { to: string; icon: string; label: string; testid: string; end?: boolean }

/** Вкладка-пилюля с цветной иконкой из /art/: активная фиолетовая. На телефоне — часть нижней панели. */
export default function TabPill({ to, icon, label, testid, end }: Props) {
  return (
    <NavLink
      to={to}
      end={end}
      data-testid={testid}
      className={({ isActive }) =>
        `flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-xs font-extrabold lg:h-[55px] lg:w-[92px] lg:flex-none lg:gap-0 lg:rounded-full lg:px-2 lg:text-[11px] 2xl:w-auto 2xl:min-w-[145px] 2xl:flex-row 2xl:gap-2 2xl:px-6 2xl:text-lg ${
          isActive ? 'bg-primary text-primary-fg shadow-card' : 'text-heading lg:border lg:border-border lg:bg-surface lg:shadow-card'
        }`
      }
    >
      <img src={`/art/tab-${icon}.webp`} alt="" className="h-8 w-8 shrink-0 lg:h-7 lg:w-7 2xl:h-10 2xl:w-10" />
      <span className="max-w-full truncate">{label}</span>
    </NavLink>
  )
}
