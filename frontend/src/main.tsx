import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { installRuntimeGlobal } from './ui-runtime/global'
import './index.css'

// Expose data hooks + surfaces on window so code-track presets compiled at
// runtime (sucrase) can resolve their imports. Must run before any <App />
// mount so route-based lazy compilation has the runtime ready.
installRuntimeGlobal()

// Sync dark mode with system preference
function syncDarkMode() {
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}
syncDarkMode()
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncDarkMode)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
