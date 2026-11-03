import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import i18n from '../i18n'

/** Падение любого экрана: вместо белого листа понятные слова и кнопка. Снаружи всех провайдеров, поэтому i18n напрямую. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main data-testid="crash" role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg p-6 text-center">
        <img src="/art/robot-happy.webp" alt="" className="h-32 w-32 object-contain" />
        <h1 className="text-3xl font-black tracking-tight text-heading">{i18n.t('crash.title')}</h1>
        <p className="max-w-[420px] text-lg font-bold text-text">{i18n.t('crash.text')}</p>
        <button type="button" data-testid="crash-reload" onClick={() => window.location.reload()} className="btn-press h-14 rounded-full bg-primary px-8 text-lg font-extrabold text-primary-fg">
          {i18n.t('crash.reload')}
        </button>
      </main>
    )
  }
}
