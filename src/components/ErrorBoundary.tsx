import { Component, type ErrorInfo, type ReactNode } from 'react'

import styles from './BootScreen.module.css'

interface State {
  error: Error | null
}

/**
 * Keeps a render fault in one tile from blanking the whole call. React offers
 * no hook equivalent, so this stays a class component.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Sinal falhou ao renderizar:', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className={styles.boot} role="alert">
        <p>algo quebrou por aqui.</p>
        <small>{error.message}</small>
        <button type="button" onClick={() => window.location.reload()}>
          recarregar
        </button>
      </div>
    )
  }
}
