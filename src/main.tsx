import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { BootScreen } from './components/BootScreen'
import { ErrorBoundary } from './components/ErrorBoundary'
import { SessionProvider } from './components/SessionProvider'
import './styles/global.css'

const container = document.getElementById('root')
if (!container) throw new Error('Elemento #root não encontrado no documento.')

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <SessionProvider fallback={<BootScreen />}>
        <App />
      </SessionProvider>
    </ErrorBoundary>
  </StrictMode>,
)
