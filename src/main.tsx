import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from '@/app/App'
import { ChannelsProvider } from '@/features/channels/ChannelsProvider'
import { SessionProvider } from '@/features/session/SessionProvider'
import { BootScreen } from '@/shared/ui/BootScreen'
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary'
import './styles/global.css'

const container = document.getElementById('root')
if (!container) throw new Error('Elemento #root não encontrado no documento.')

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <SessionProvider fallback={<BootScreen />}>
        <ChannelsProvider>
          <App />
        </ChannelsProvider>
      </SessionProvider>
    </ErrorBoundary>
  </StrictMode>,
)
