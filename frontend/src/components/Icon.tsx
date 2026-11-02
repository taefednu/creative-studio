const PATHS = {
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2',
  wand: 'M4 20l11-11M18 3l.9 2.1L21 6l-2.1.9L18 9l-.9-2.1L15 6l2.1-.9zM6 5l.5 1.2L8 6.5l-1.5.5L6 8.5 5.5 7 4 6.5l1.5-.3z',
  check: 'M5 12l5 5 9-10',
  copy: 'M11 9h7a2 2 0 012 2v7a2 2 0 01-2 2h-7a2 2 0 01-2-2v-7a2 2 0 012-2zM5 15V6a2 2 0 012-2h9',
  plus: 'M12 5v14M5 12h14',
  calendar: 'M6 5h12a3 3 0 013 3v10a3 3 0 01-3 3H6a3 3 0 01-3-3V8a3 3 0 013-3zM3 10h18M8 3v4M16 3v4',
  share: 'M18 2a3 3 0 100 6 3 3 0 000-6zM6 9a3 3 0 100 6 3 3 0 000-6zM18 16a3 3 0 100 6 3 3 0 000-6zM8.6 10.7l6.8-4.4M8.6 13.3l6.8 4.4',
  close: 'M6 6l12 12M18 6L6 18',
}

/** Контурная иконка в цвет текста (currentColor); размер задаёт вызывающий. */
export default function Icon({ name, className = 'h-5 w-5' }: { name: keyof typeof PATHS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}
