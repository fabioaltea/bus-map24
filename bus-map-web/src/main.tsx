import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/query-client.js'
import App from './App.js'
import './index.css'

async function prepare() {
  if (import.meta.env.VITE_MOCK_API === 'true') {
    const { worker } = await import('./mocks/browser.js')
    await worker.start({ onUnhandledRequest: 'bypass' })
  }
}

const root = document.getElementById('root')
if (!root) throw new Error('#root element not found')

prepare().then(() => {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  )
})
