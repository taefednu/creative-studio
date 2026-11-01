/** Иконки вкладок: цвет берут у текста (currentColor), форма простая. */
const PATHS: Record<string, string> = {
  feed: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M9 9.5a1 1 0 1 0 0 .01',
  create: 'M4 20L16 8M14 6l4 4M18 3v3M16.5 4.5h3M6 5v2M5 6h2',
  tasks: 'M12 6c-2-1.5-5-2-8-1.5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5v-13c-3-.5-6 0-8 1.5zM12 6v13',
  mine: 'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M9 8.5a1 1 0 1 0 0 .01',
}

export default function NavIcon({ name, className = 'h-6 w-6' }: { name: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
