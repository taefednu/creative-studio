import type { Config } from 'tailwindcss'

const v = (name: string) => `var(--${name})`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('color-bg'),
        surface: v('color-surface'),
        border: v('color-border'),
        primary: v('color-primary'),
        'primary-fg': v('color-primary-fg'),
        'primary-soft': v('color-primary-soft'),
        heading: v('color-heading'),
        text: v('color-text'),
        muted: v('color-muted'),
        gold: v('color-gold'),
        star: v('color-star'),
        danger: v('color-danger'),
        'danger-soft': v('color-danger-soft'),
        success: v('color-success'),
        'success-soft': v('color-success-soft'),
      },
      fontFamily: { sans: ['Nunito', 'system-ui', 'sans-serif'] },
      borderRadius: { card: 'var(--radius-card)' },
      boxShadow: { card: 'var(--shadow-card)' },
    },
  },
} satisfies Config
