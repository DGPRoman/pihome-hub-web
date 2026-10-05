import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { readLanding } from './lib/join'
import { createQueryClient } from './queryClient'
import './styles/global.css'

const container = document.getElementById('root')

// index.html always ships this element; if it is missing, the build is broken
// in a way that a blank page would hide. Fail loudly instead.
if (!container) {
  throw new Error('Root element #root is missing from the document')
}

// Created once, outside the render. A client built inside a component would be
// replaced on every render, discarding the cache it exists to hold.
const queryClient = createQueryClient()

// Read here, once, before React renders anything. It takes an invitation's token
// out of the address as it reads it, so a second read — which StrictMode makes in
// development — would find nothing.
const landing = readLanding(window.location, window.history)

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App landing={landing} />
    </QueryClientProvider>
  </StrictMode>,
)
