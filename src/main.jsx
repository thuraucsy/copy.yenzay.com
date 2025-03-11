import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import ThemedApp from './ThemedApp'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemedApp />
  </StrictMode>,
)
