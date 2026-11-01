type Props = {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  testid: string
  label: string
  className?: string
}

/** Настоящий select в виде пилюли с шевроном; высоту задаёт вызывающий через className. */
export default function ChipSelect({ value, onChange, options, testid, label, className = 'h-11' }: Props) {
  return (
    <span className={`relative inline-flex ${className}`}>
      <select
        data-testid={testid}
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full w-full min-w-0 cursor-pointer appearance-none rounded-full border border-border bg-surface pl-4 pr-9 text-sm font-extrabold text-heading outline-none focus:border-primary md:text-base"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-heading"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </span>
  )
}
