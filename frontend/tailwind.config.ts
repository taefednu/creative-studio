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
        'primary-light': v('color-primary-light'),
        'primary-soft': v('color-primary-soft'),
        heading: v('color-heading'),
        text: v('color-text'),
        muted: v('color-muted'),
        gold: v('color-gold'),
        star: v('color-star'),
        heart: v('color-heart'),
        danger: v('color-danger'),
        'danger-soft': v('color-danger-soft'),
        success: v('color-success'),
        'success-soft': v('color-success-soft'),
        urgent: v('color-urgent'),
        'urgent-soft': v('color-urgent-soft'),
        'urgent-border': v('color-urgent-border'),
        scrim: v('color-scrim'),
      },
      fontFamily: { sans: ['Nunito', 'system-ui', 'sans-serif'] },
      borderRadius: { card: 'var(--radius-card)' },
      boxShadow: { card: 'var(--shadow-card)', primary: 'var(--shadow-primary)', pop: 'var(--shadow-pop)' },
      backgroundImage: { 'primary-grad': v('gradient-primary') },
    },
  },
} satisfies Config
