import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import './styles/global.css'

const container = document.getElementById('root')

// index.html always ships this element; if it is missing, the build is broken
// in a way that a blank page would hide. Fail loudly instead.
if (!container) {
  throw new Error('Root element #root is missing from the document')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
